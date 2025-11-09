/**
 * OTISSHOPEE - SERVER CHÍNH
 * =========================
 * 
 * File khởi tạo chính của hệ thống backend
 * Chức năng:
 * - Khởi tạo database tự động
 * - Đăng ký routes API
 * - Cấu hình Express server
 * - Tích hợp Vite cho development
 */

import dotenv from 'dotenv';
dotenv.config();
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { initializeApp } from "./init-db";
import { createCookiePairsTable } from "./migrations/create-cookie-pairs-table";
import { startCleanupService } from "./cleanup-service";
import { startDatabaseCleanupService } from "./database-cleanup";
import { startAutoRefundScheduler } from "./auto-refund-scheduler";
import { startExternalApiAutoChargeService } from "./external-api-auto-charge-service";
import { startCookieValidatorService } from "./cookie-validator-service";
import { closeDatabaseConnections, checkDatabaseHealth } from "./db";
import { startMemoryMonitoring } from "./memory-monitor";

// Global error handlers với auto-restart support
let startTime = Date.now();
let errorCount = 0;
const ERROR_THRESHOLD = 10; // Max 10 errors trong 1 phút
const ERROR_WINDOW = 60000; // 1 phút

// Reset error count sau mỗi phút
setInterval(() => {
  if (errorCount > 0) {
    console.log(`[HEALTH] Error count reset (was ${errorCount} errors in last minute)`);
    errorCount = 0;
  }
}, ERROR_WINDOW);

process.on('uncaughtException', async (error: Error) => {
  console.error('[GLOBAL] 🚨 Uncaught Exception:', error.message);
  console.error('[GLOBAL] Stack:', error.stack);
  errorCount++;
  
  // Recoverable errors - không cần restart
  const recoverablePatterns = [
    'db_termination',
    'shutdown',
    'ECONNRESET',
    'ETIMEDOUT',
    'fetch failed'
  ];
  
  const isRecoverable = recoverablePatterns.some(pattern => 
    error.message.includes(pattern)
  );
  
  if (isRecoverable) {
    console.log('[GLOBAL] ✅ Recoverable error - application continues');
    return;
  }
  
  // Critical errors - cần restart
  console.error('[GLOBAL] ❌ CRITICAL ERROR - preparing for restart');
  console.error('[GLOBAL] Uptime before crash:', Math.round((Date.now() - startTime) / 1000), 'seconds');
  
  // Cleanup trước khi exit
  try {
    await closeDatabaseConnections();
    console.log('[GLOBAL] Database connections closed');
  } catch (e) {
    console.error('[GLOBAL] Error closing connections:', e);
  }
  
  // Exit để wrapper script restart
  process.exit(1);
});

process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
  console.error('[GLOBAL] 🚨 Unhandled Rejection:', reason);
  errorCount++;
  
  // Recoverable rejections
  const isRecoverable = reason && (
    reason.code === 'XX000' || 
    reason.message?.includes('db_termination') ||
    reason.message?.includes('fetch failed')
  );
  
  if (isRecoverable) {
    console.log('[GLOBAL] ✅ Recoverable rejection - application continues');
    return;
  }
  
  // Nếu quá nhiều errors trong thời gian ngắn -> restart
  if (errorCount >= ERROR_THRESHOLD) {
    console.error('[GLOBAL] ❌ ERROR THRESHOLD EXCEEDED - forcing restart');
    console.error('[GLOBAL] Errors in last minute:', errorCount);
    
    try {
      await closeDatabaseConnections();
    } catch (e) {
      console.error('[GLOBAL] Error during cleanup:', e);
    }
    
    process.exit(1);
  }
  
  console.log('[GLOBAL] Application continuing (error count:', errorCount, '/', ERROR_THRESHOLD, ')');
});

// Handle SIGTERM and SIGINT gracefully
process.on('SIGTERM', async () => {
  console.log('[GLOBAL] SIGTERM received, shutting down gracefully');
  await closeDatabaseConnections();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[GLOBAL] SIGINT received, shutting down gracefully');
  await closeDatabaseConnections();
  process.exit(0);
});


const app = express();

// Enable gzip compression for all responses to reduce egress bandwidth
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// Memory optimization for Windows Server 2019 (1GB RAM)
const memoryOptions = {
  limit: '10mb' // Reduced from default to conserve memory
};

app.use(express.json(memoryOptions));
app.use(express.urlencoded({ extended: false, ...memoryOptions }));

// Enable CORS for external access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Add HTTP caching headers for analytics endpoints
app.use((req, res, next) => {
  if (req.path.startsWith('/api/analytics') && req.method === 'GET') {
    res.set('Cache-Control', 'private, max-age=60');
    res.set('Vary', 'Authorization');
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize default users on startup
async function initializeDefaultUsers() {
  try {
    // Create demo user
    const existingUser = await storage.getUserByUsername("a");
    if (!existingUser) {
      await storage.createUser({
        username: "a",
        email: "demo@otisshopee.com",
        password: "1", // Will be hashed by storage.createUser
        fullName: "Demo User",
        phone: "+84123456789",
        role: "user"
      });
      log("Demo user created: username 'a', password '1'");
    }

    // Create admin user
    const existingAdmin = await storage.getUserByUsername("admin");
    if (!existingAdmin) {
      await storage.createUser({
        username: "admin",
        email: "admin@otisshopee.com",
        password: "1", // Will be hashed by storage.createUser
        fullName: "System Administrator",
        phone: "+84987654321",
        role: "admin"
      });
      log("Admin user created: username 'admin', password '1'");
    }

    // Create spadmin user
    const existingSpadmin = await storage.getUserByUsername("spadmin");
    if (!existingSpadmin) {
      await storage.createUser({
        username: "spadmin",
        email: "spadmin@otisshopee.com",
        password: "1", // Will be hashed by storage.createUser
        fullName: "Super Administrator",
        phone: "+84111222333",
        role: "superadmin"
      });
      log("Super admin user created: username 'spadmin', password '1'");
    }
  } catch (error) {
    log(`Error creating default users: ${error}`);
  }
}

(async () => {
  // Initialize database and default data
  await initializeApp();
  
  // Run cookie pairs table migration
  await createCookiePairsTable();
  
  const server = await registerRoutes(app);
  
  // Start database cleanup service
  startDatabaseCleanupService();
  
  // Start CMD cleanup service
  startCleanupService();
  
  // Start auto-refund scheduler
  startAutoRefundScheduler();
  
  // Start external API auto charge service
  startExternalApiAutoChargeService(storage);
  
  // Start cookie validator service
  startCookieValidatorService();
  
  // Start memory monitoring service
  startMemoryMonitoring();
  
  // Start database health monitoring
  setInterval(async () => {
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      console.log('[DATABASE] Health check failed - connection issues detected');
    }
  }, 60000); // Check every minute
  
  // Optimize for Windows Server 2019 with 1GB RAM
  if (process.platform === 'win32') {
    // Enable garbage collection optimization
    if (typeof global.gc === 'function') {
      setInterval(() => {
        try {
          global.gc?.();
        } catch (error) {
          log(`GC error: ${error}`);
        }
      }, 300000); // Run GC every 5 minutes
    }
    
    // Set memory usage warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        log(`Memory warning: ${warning.message}`);
      }
    });
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  const port = 5000;
  const host = "0.0.0.0";
  
  // Try to bind to additional ports for external access
  const additionalPorts = [8080, 3000, 8000];
  
  server.listen(port, host, () => {
    log(`serving on host ${host}, port ${port}`);
    log(`Server accessible at:`);
    log(`- Local: http://localhost:${port}`);
    log(`- Network: http://157.66.24.150:${port} (may need firewall config)`);
    log(`- Domain: https://otistx.com (working via nginx)`);
    
    // Khởi động service dọn dẹp CMD tự động mỗi 30 phút
    startCleanupService();
    
    // Try binding to additional ports for external access
    additionalPorts.forEach(additionalPort => {
      try {
        const additionalServer = app.listen(additionalPort, host, () => {
          log(`Additional server listening on ${host}:${additionalPort}`);
          log(`- Alternative access: http://157.66.24.150:${additionalPort}`);
        });
        
        additionalServer.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            log(`Port ${additionalPort} already in use, skipping`);
          } else {
            log(`Error binding to port ${additionalPort}: ${err.message}`);
          }
        });
      } catch (error) {
        log(`Failed to bind additional port ${additionalPort}: ${error}`);
      }
    });
  });
})();
