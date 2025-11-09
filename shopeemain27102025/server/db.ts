/**
 * KẾT NỐI DATABASE
 * ================
 * 
 * Cấu hình kết nối PostgreSQL với Supabase Database
 * Sử dụng Drizzle ORM để quản lý schema và queries
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import fs from 'fs';
import path from 'path';

// Ưu tiên đọc DATABASE_URL từ file .env trước
let DATABASE_URL: string | undefined;

try {
  const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = envFile.match(/DATABASE_URL=(.+)/);
  if (match) {
    DATABASE_URL = match[1].trim();
    console.log('[DATABASE CONFIG] Using DATABASE_URL from .env file (PRIORITY)');
  }
} catch (error) {
  console.log('[DATABASE CONFIG] Could not read .env file, falling back to environment variables');
}

// Fallback sang environment variable nếu .env không có
if (!DATABASE_URL) {
  dotenv.config();
  DATABASE_URL = process.env.DATABASE_URL;
  if (DATABASE_URL) {
    console.log('[DATABASE CONFIG] Using DATABASE_URL from environment variables (FALLBACK)');
  }
}

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL not found in .env file or environment variables");
}

// Debug: Show database URL info
console.log("Connecting to database:", DATABASE_URL?.replace(/:[^:@]*@/, ':***@'));

// Determine SSL config based on database URL or environment
// Check if SSL should be disabled (for local/non-SSL databases)
const shouldUseSSL = () => {
  // Disable SSL if explicitly set in environment
  console.log('[SSL CONFIG] Checking environment variables...');
  console.log('[SSL CONFIG] DB_SSL_DISABLED from .env:', process.env.DB_SSL_DISABLED || 'not set');
  
  if (process.env.DB_SSL_DISABLED === 'true' || process.env.DB_SSL_DISABLED === '1') {
    console.log('[SSL CONFIG] ✅ SSL disabled by DB_SSL_DISABLED environment variable');
    return false;
  }
  
  // Disable SSL if DATABASE_URL contains sslmode=disable
  if (DATABASE_URL?.includes('sslmode=disable')) {
    console.log('[SSL CONFIG] ✅ SSL disabled by sslmode=disable in DATABASE_URL');
    return false;
  }
  
  // Disable SSL for localhost/127.0.0.1 connections
  if (DATABASE_URL?.includes('localhost') || DATABASE_URL?.includes('127.0.0.1')) {
    console.log('[SSL CONFIG] ✅ SSL disabled for localhost connection');
    return false;
  }
  
  // Disable SSL for local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, 103.x.x.x)
  const localIpPattern = /(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|103\.\d+\.\d+\.\d+)/;
  if (DATABASE_URL && localIpPattern.test(DATABASE_URL)) {
    console.log('[SSL CONFIG] ✅ SSL disabled for local network IP detected in DATABASE_URL');
    return false;
  }
  
  // Enable SSL for cloud databases (Supabase, Neon, etc.)
  const isCloudDatabase = DATABASE_URL?.includes('supabase.com') || 
                          DATABASE_URL?.includes('neon.tech') || 
                          DATABASE_URL?.includes('aws') ||
                          DATABASE_URL?.includes('pooler');
  
  if (isCloudDatabase) {
    console.log('[SSL CONFIG] ✅ SSL enabled for cloud database');
  }
  
  return isCloudDatabase;
};

const useSSL = shouldUseSSL();
console.log(`[SSL CONFIG] Final decision: SSL ${useSSL ? 'ENABLED' : 'DISABLED'}`);

// Khởi tạo connection pool và Drizzle ORM với cấu hình tối ưu
// Optimized for 2 cores, 4GB RAM - Support 30-50 concurrent users
export const pool = new Pool({ 
  connectionString: DATABASE_URL,
  ssl: useSSL ? {
    rejectUnauthorized: false
  } : false,
  max: 15, // Tăng lên 15 cho 2 cores 4GB RAM (7-8 connections per core)
  min: 3, // Tăng min để sẵn sàng xử lý burst traffic
  connectionTimeoutMillis: 30000, // Giảm xuống 30s để fail fast
  idleTimeoutMillis: 30000, // Giảm idle timeout để giải phóng connections nhanh hơn
  statement_timeout: 30000, // Giảm statement timeout để tránh blocking lâu
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false
});

// Add error handling for database connection to prevent crashes
pool.on('error', (err: any, client) => {
  console.error('[DATABASE] Unexpected database error:', err);
  console.error('[DATABASE] Error occurred on client:', client ? 'client connected' : 'no client');
  
  // Log the specific error type for debugging
  if (err.code) {
    console.error(`[DATABASE] Error code: ${err.code}`);
  }
  if (err.severity) {
    console.error(`[DATABASE] Error severity: ${err.severity}`);
  }
  
  // Handle specific database termination errors
  if (err.code === 'XX000' || err.message?.includes('db_termination') || err.message?.includes('shutdown')) {
    console.log('[DATABASE] Database termination detected - attempting reconnection');
    
    // Don't manually release the client as the pool handles this automatically during termination
    // The pool will detect the broken connection and remove it from the pool
    
    // The pool will automatically create new connections as needed
    return;
  }
  
  // Don't let the pool error crash the application
  // The pool will automatically handle reconnection
});

// Add connection event handlers for better monitoring
// OPTIMIZATION: Commented out to reduce egress usage (saves ~100MB/day)
// pool.on('connect', (client) => {
//   console.log('[DATABASE] New client connected to database pool');
// });

// pool.on('acquire', (client) => {
//   console.log('[DATABASE] Client acquired from pool');
// });

// pool.on('remove', (client) => {
//   console.log('[DATABASE] Client removed from pool');
// });

export const db = drizzle(pool, { schema });

// Helper function để thực hiện query với retry logic
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a connection termination error
      if (error.code === 'XX000' || error.message?.includes('db_termination') || error.message?.includes('shutdown')) {
        console.log(`[DATABASE] Connection error on attempt ${attempt}/${maxRetries}, retrying in ${delayMs}ms...`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      } else {
        // For non-connection errors, throw immediately
        throw error;
      }
    }
  }
  
  throw lastError!;
}

// Health check function để kiểm tra kết nối database
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await executeWithRetry(async () => {
      const result = await pool.query('SELECT 1');
      return result;
    });
    return true;
  } catch (error) {
    console.error('[DATABASE] Health check failed:', error);
    return false;
  }
}

// Graceful shutdown function
export async function closeDatabaseConnections(): Promise<void> {
  try {
    console.log('[DATABASE] Closing database connections...');
    await pool.end();
    console.log('[DATABASE] Database connections closed successfully');
  } catch (error) {
    console.error('[DATABASE] Error closing database connections:', error);
  }
}