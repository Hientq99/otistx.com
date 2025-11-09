import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { globalRateLimiter, strictRateLimiter, authRateLimiter } from "./rate-limiter";
import { concurrentRequestLimiter, phoneRentalRequestLimiter, getQueueStats } from "./request-queue";
import { getMemoryStats, getMonitoringStatus } from "./memory-monitor";
import { 
  loginSchema, 
  registerSchema, 
  insertProjectSchema, 
  insertAuditLogSchema,
  insertPhoneRentalSchema,
  insertPhoneCheckSchema,
  insertShopeeCookieSchema,
  insertTrackingCheckSchema,
  insertEmailAdditionSchema,
  insertVoucherSavingOperationSchema,
  insertVoucherSaveResultSchema,
  voucherSavingRequestSchema,
  insertExpressTrackingCheckSchema,
  insertFreeshipVoucherSchema,
  insertFreeshipVoucherUsageSchema
} from "@shared/schema";
import { z } from "zod";
import fetch, { Response as NodeResponse } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getCleanupServiceStatus, manualCleanup, startCleanupService, stopCleanupService, getCleanupConfig, testAllCleanupMethods, forceWindowsCleanup } from "./cleanup-service";
import { getDatabaseCleanupServiceStatus, manualDatabaseCleanup } from "./database-cleanup";
import { runPricingCleanup } from "./database-pricing-cleanup";
import * as xlsx from 'xlsx';


/**
 * Lấy IP gốc của người dùng từ request headers
 * Hỗ trợ proxy và CDN (Cloudflare, nginx, etc.)
 */
function getClientIP(req: Request): string {
  // Thứ tự ưu tiên để lấy IP gốc
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xRealIP = req.headers['x-real-ip'];
  const cfConnectingIP = req.headers['cf-connecting-ip'];
  const xClientIP = req.headers['x-client-ip'];
  
  // X-Forwarded-For có thể chứa nhiều IP, lấy IP đầu tiên
  if (xForwardedFor) {
    const ips = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    const firstIP = ips.split(',')[0].trim();
    if (firstIP) return firstIP;
  }
  
  // Cloudflare connecting IP
  if (cfConnectingIP && typeof cfConnectingIP === 'string') {
    return cfConnectingIP;
  }
  
  // X-Real-IP (nginx)
  if (xRealIP && typeof xRealIP === 'string') {
    return xRealIP;
  }
  
  // X-Client-IP
  if (xClientIP && typeof xClientIP === 'string') {
    return xClientIP;
  }
  
  // Fallback to connection remote address
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

/**
 * Helper function để lấy IP gốc của người dùng
 * Sử dụng cho tất cả endpoints cần track IP
 */
function getUserIP(req: any): string {
  return getClientIP(req);
}

// ============================================================================
// SEPARATE REFUND LOGIC FOR EACH SERVICE - NO SHARED FUNCTIONS
// ============================================================================

// Import refund handlers
import { processOtissimV1Refund, processOtissimV2Refund, processOtissimV3Refund, processTiktokRentalRefund } from './refund-handlers';
import { auditSystemDuplicateProtection, testDuplicateProtection } from './refund-duplicate-check';
import { getAutoRefundSchedulerStatus, runManualRefundCheck } from './auto-refund-scheduler';
import { auditRefundSystem, recoverIncorrectRefunds, validateRefundMechanism } from './refund-audit-service';

// ============================================================================
// ANTI-SPAM SYSTEM FOR PHONE RENTAL
// ============================================================================

interface ServiceRentalLimit {
  userId: number;
  serviceType: string;  // otissim_v1, otissim_v2, otissim_v3
  attempts: number[];  // Array of timestamps
  blockedUntil?: number;  // Timestamp when user will be unblocked
}

// In-memory storage for rate limiting per service (resets on server restart)
// Key format: `${userId}_${serviceType}`
const serviceRentalLimits = new Map<string, ServiceRentalLimit>();

// Rate limiting configuration - PER SERVICE TYPE (optimized for 30 concurrent users)
const RENTAL_SPAM_THRESHOLD = 15;  // Max attempts per service per minute
const RENTAL_SPAM_WINDOW = 60 * 1000;  // 60 seconds (1 minute) in milliseconds
const RENTAL_BLOCK_DURATION = 30 * 1000;  // 30 seconds block duration (reduced for better UX)

// ============================================================================
// SHOPEE SIM V2 SPECIFIC RATE LIMITING - IMPORTED FROM SEPARATE MODULE
// ============================================================================

import { 
  checkShopeeV2GlobalLimit, 
  addToShopeeV2GlobalQueue, 
  removeFromShopeeV2GlobalQueue,
  getShopeeV2GlobalQueueStatus,
  getShopeeV2GlobalQueueDetails
} from './shopee-v2-global-queue';

/**
 * Check if user is currently blocked for a specific service type
 */
function isUserServiceBlocked(userId: number, serviceType: string): boolean {
  const key = `${userId}_${serviceType}`;
  const serviceLimit = serviceRentalLimits.get(key);
  if (!serviceLimit?.blockedUntil) return false;
  
  const now = Date.now();
  if (now >= serviceLimit.blockedUntil) {
    // Block has expired, remove it
    serviceLimit.blockedUntil = undefined;
    serviceLimit.attempts = [];
    return false;
  }
  
  return true;
}

/**
 * Format block time into human readable string
 */
function formatBlockTime(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds} giây`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} phút`;
}

/**
 * Check rental rate limit for TikTok service (simple version)
 * Returns remaining block time in milliseconds, 0 if not blocked
 */
function checkRentalRateLimit(userId: number): number {
  const result = checkServiceRentalRateLimit(userId, 'tiktoksim_v1');
  return result.blocked ? result.remainingTime : 0;
}

/**
 * Check if user should be blocked for spam attempts for specific service
 * Returns { blocked: boolean, remainingTime: number, message: string }
 */
function checkServiceRentalRateLimit(userId: number, serviceType: string): { blocked: boolean, remainingTime: number, message: string } {
  const now = Date.now();
  const key = `${userId}_${serviceType}`;
  
  // Check if user is currently blocked for this service
  if (isUserServiceBlocked(userId, serviceType)) {
    const serviceLimit = serviceRentalLimits.get(key)!;
    const remainingTime = serviceLimit.blockedUntil! - now;
    const seconds = Math.ceil(remainingTime / 1000);
    return {
      blocked: true,
      remainingTime,
      message: `Bạn đã vượt quá giới hạn 15 lần/phút cho dịch vụ ${serviceType.replace('otissim_', 'V')}. Vui lòng chờ ${seconds} giây.`
    };
  }
  
  // Get or create service limit record
  let serviceLimit = serviceRentalLimits.get(key);
  if (!serviceLimit) {
    serviceLimit = { userId, serviceType, attempts: [] };
    serviceRentalLimits.set(key, serviceLimit);
  }
  
  // Remove attempts older than RENTAL_SPAM_WINDOW (1 minute)
  serviceLimit.attempts = serviceLimit.attempts.filter(timestamp => 
    now - timestamp < RENTAL_SPAM_WINDOW
  );
  
  // Add current attempt
  serviceLimit.attempts.push(now);
  
  // Check if user exceeds threshold for this service
  if (serviceLimit.attempts.length > RENTAL_SPAM_THRESHOLD) {
    serviceLimit.blockedUntil = now + RENTAL_BLOCK_DURATION;
    console.log(`[ANTI-SPAM] User ${userId} blocked for service ${serviceType} for ${RENTAL_BLOCK_DURATION/1000} seconds - ${serviceLimit.attempts.length} attempts in ${RENTAL_SPAM_WINDOW/1000}s`);
    const seconds = Math.ceil(RENTAL_BLOCK_DURATION / 1000);
    return {
      blocked: true,
      remainingTime: RENTAL_BLOCK_DURATION,
      message: `Bạn đã vượt quá giới hạn 15 lần/phút cho dịch vụ ${serviceType.replace('otissim_', 'V')}. Vui lòng chờ ${seconds} giây.`
    };
  }
  
  console.log(`[ANTI-SPAM] User ${userId} service ${serviceType} attempt ${serviceLimit.attempts.length}/${RENTAL_SPAM_THRESHOLD} in last ${RENTAL_SPAM_WINDOW/1000}s`);
  return { blocked: false, remainingTime: 0, message: '' };
}










// SSRF Protection: Enhanced validation for internal/private IPs (RFC1918 + reserved ranges)
function isInternalIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Invalid IP = block it
  }
  
  // Block all reserved/private IP ranges per RFC
  if (parts[0] === 0) return true; // 0.0.0.0/8 - This network
  if (parts[0] === 10) return true; // 10.0.0.0/8 - Private
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10 - Shared Address Space
  if (parts[0] === 127) return true; // 127.0.0.0/8 - Loopback
  if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 - Link-local
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12 - Private
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true; // 192.0.0.0/24 - IETF Protocol
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true; // 192.0.2.0/24 - TEST-NET-1
  if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16 - Private
  if (parts[0] === 198 && parts[1] === 18) return true; // 198.18.0.0/15 - Benchmarking
  if (parts[0] === 198 && parts[1] === 19) return true; // 198.18.0.0/15 - Benchmarking
  if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true; // 198.51.100.0/24 - TEST-NET-2
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true; // 203.0.113.0/24 - TEST-NET-3
  if (parts[0] >= 224) return true; // 224.0.0.0/4 - Multicast & Reserved (224-255)
  
  return false;
}

// SSRF Protection: Validate proxy URL and extract/check host
function validateProxyUrl(proxyInput: string): { valid: boolean; error?: string; url?: string } {
  try {
    // Add scheme if missing
    const proxyUrl = proxyInput.includes('://') ? proxyInput : `http://${proxyInput}`;
    
    // Parse URL
    const parsed = new URL(proxyUrl);
    const hostname = parsed.hostname;
    
    // Check if it's an IP address or hostname
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ipPattern.test(hostname)) {
      // It's an IP - validate it
      if (isInternalIP(hostname)) {
        return { valid: false, error: 'Internal/private IP addresses are not allowed' };
      }
    } else {
      // It's a hostname - block common internal hostnames
      const lowerHost = hostname.toLowerCase();
      if (lowerHost === 'localhost' || lowerHost.endsWith('.local') || lowerHost.endsWith('.internal')) {
        return { valid: false, error: 'Internal hostnames are not allowed' };
      }
    }
    
    // Validate port
    const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, error: 'Invalid port number' };
    }
    
    return { valid: true, url: proxyUrl };
  } catch (error) {
    return { valid: false, error: 'Invalid proxy URL format' };
  }
}

// Function to test proxy connection
async function testProxyConnection(proxy: any): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false);
    }, 4000);

    (async () => {
      try {
        // SSRF Protection: Validate proxy
        const proxyInput = `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.ip}:${proxy.port}`;
        const validation = validateProxyUrl(proxyInput);
        
        if (!validation.valid) {
          console.error(`Proxy ${proxy.ip}:${proxy.port} rejected: ${validation.error}`);
          clearTimeout(timeout);
          resolve(false);
          return;
        }
        
        console.log(`Creating proxy agent with URL: ${validation.url!.replace(/:([^:@]+)@/, ':***@')}`);
        
        const agent = new HttpProxyAgent(validation.url!);
        
        const response = await fetch('http://httpbin.org/ip', {
          method: 'GET',
          agent: agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });


        if (response.status === 200) {
          const text = await response.text();
          console.log(`Proxy ${proxy.ip}:${proxy.port} raw response:`, text.substring(0, 100));
          
          try {
            const data = JSON.parse(text);
            console.log(`Proxy ${proxy.ip}:${proxy.port} parsed JSON:`, data);
            
            if (data && data.origin && typeof data.origin === 'string') {
              const originIP = data.origin.trim();
              console.log(`Proxy ${proxy.ip}:${proxy.port} origin IP: "${originIP}"`);
              
              // Basic IP validation
              const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
              const isValid = ipPattern.test(originIP);
              
              clearTimeout(timeout);
              resolve(isValid);
              return;
            }
          } catch (parseError) {
            console.error(`Proxy ${proxy.ip}:${proxy.port} JSON parse error:`, parseError);
          }
        }
        
        clearTimeout(timeout);
        resolve(false);
        
      } catch (error) {
        const errorMsg = (error as Error).message;
        console.error(`Proxy ${proxy.ip}:${proxy.port} error:`, errorMsg);
        
        if (errorMsg.includes('ECONNREFUSED')) {
        } else if (errorMsg.includes('ENOTFOUND')) {
        } else if (errorMsg.includes('407')) {
        } else {
        }
        
        clearTimeout(timeout);
        resolve(false);
      }
    })();
  });
}
import QRCode from "qrcode";
import crypto from "crypto";

// Type definitions
interface AuthenticatedRequest extends Request {
  user?: any;
}

// SECURITY: JWT_SECRET from environment (with secure fallback for development)
const JWT_SECRET = process.env.JWT_SECRET || "HWTq/G1wvR3OFWU9rmO3qy5Kpc3Syy3J/Ui3GXOUsC063/C1STgbQupPjvlle3nd+PIUVKNrLqYzjR+AXW9vhg==";

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: Using fallback JWT_SECRET. For production, set JWT_SECRET in environment variables');
}

// API Key Authentication Middleware
async function authenticateApiKey(req: any, res: any, next: any) {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ message: "API key không được cung cấp" });
    }

    // Get API key from database
    const keyData = await storage.getApiKeyByValue(apiKey);
    
    if (!keyData) {
      return res.status(401).json({ message: "API key không hợp lệ" });
    }

    if (!keyData.isActive) {
      return res.status(401).json({ message: "API key đã bị vô hiệu hóa" });
    }

    // Check rate limits
    if (keyData.requestCount >= (keyData.monthlyRequestLimit || 1000)) {
      return res.status(429).json({ message: "Đã vượt quá giới hạn request tháng" });
    }

    // Update usage statistics
    await storage.updateApiKeyUsage(keyData.keyValue);

    // Get user info
    const user = await storage.getUserById(keyData.userId);
    if (!user) {
      return res.status(401).json({ message: "Người dùng không tồn tại" });
    }

    req.user = user;
    req.apiKey = keyData;
    next();
  } catch (error) {
    console.error('API Key authentication error:', error);
    res.status(500).json({ message: "Lỗi xác thực API key" });
  }
}

// Middleware to check API key permissions for specific services
function checkApiKeyPermission(requiredPermission: string) {
  return (req: any, res: any, next: any) => {
    // If using JWT token, skip permission check
    if (!req.apiKey) {
      return next();
    }

    try {
      // Parse permissions from JSON string
      const permissions = typeof req.apiKey.permissions === 'string' 
        ? JSON.parse(req.apiKey.permissions)
        : req.apiKey.permissions;

      if (!Array.isArray(permissions) || !permissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          message: `API key không có quyền truy cập dịch vụ ${requiredPermission}` 
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ message: "Lỗi kiểm tra quyền API key" });
    }
  };
}

// Combined authentication middleware (JWT or API Key)
async function authenticateTokenOrApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  if (apiKey) {
    return authenticateApiKey(req, res, next);
  } else if (authHeader) {
    return authenticateToken(req, res, next);
  } else {
    return res.status(401).json({ message: "Token hoặc API key không được cung cấp" });
  }
}

// Helper function to generate random fingerprint
function generateRandomFingerprint(): string {
  const randomBase64 = (length: number) => {
    const bytes = crypto.randomBytes(length);
    return bytes.toString('base64');
  };
  
  const randomHex = (length: number) => {
    const bytes = crypto.randomBytes(length);
    return bytes.toString('hex');
  };
  
  const part1 = randomBase64(16);
  const part2 = randomBase64(48);
  const part3 = randomHex(8);
  const part4 = '08';
  const part5 = '3';
  
  return `${part1}|${part2}|${part3}|${part4}|${part5}`;
}

// Helper function to generate random User-Agent
function generateRandomUserAgent(): string {
  const chromeVersions = ['119', '120', '121', '122', '123', '124', '125'];
  const androidVersions = ['10', '11', '12', '13', '14'];
  const shopeeAppVersions = ['28305', '28310', '28315', '28320', '28325', '28330'];
  
  const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const androidVersion = androidVersions[Math.floor(Math.random() * androidVersions.length)];
  const shopeeVersion = shopeeAppVersions[Math.floor(Math.random() * shopeeAppVersions.length)];
  
  // Mix between mobile app and web UA
  const useAppUA = Math.random() > 0.5;
  
  if (useAppUA) {
    return `Android app Shopee appver=${shopeeVersion} app_type=1`;
  } else {
    return `Mozilla/5.0 (Linux; Android ${androidVersion}; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Mobile Safari/537.36`;
  }
}

// Helper function to generate random CSRF token
function generateRandomCsrfToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Function to process SPC_F extraction
async function processSpcFExtraction(inputData: string, proxy: string | null): Promise<{
  status: 'success' | 'failed';
  message: string;
  spcSt?: string;
  spcF?: string;
}> {
  try {
    const parts = inputData.split('|');
    if (parts.length < 3) {
      throw new Error('Định dạng không hợp lệ. Cần: SPC_F=value|username|password|proxy');
    }

    const [spcFPart, username, password] = parts;
    // Use proxy from parameter first, then fallback to parts[3]
    const finalProxy = proxy || (parts.length > 3 && parts[3] ? parts[3] : null);
    
    if (!spcFPart || !username || !password) {
      throw new Error('Thiếu thông tin: SPC_F, username hoặc password');
    }

    // Parse SPC_F value from format "SPC_F=value" 
    let spcFValue;
    if (spcFPart.startsWith('SPC_F=')) {
      spcFValue = spcFPart.substring(6); // Remove "SPC_F=" prefix
    } else {
      spcFValue = spcFPart; // Fallback for direct value
    }

    if (!spcFValue) {
      throw new Error('SPC_F value không hợp lệ');
    }

    // Hash password: MD5 then SHA256
    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
    const sha256Hash = crypto.createHash('sha256').update(md5Hash).digest('hex');

    // Generate random values to avoid detection
    const randomFingerprint = generateRandomFingerprint();
    const randomUserAgent = generateRandomUserAgent();
    const randomCsrf = generateRandomCsrfToken();

    console.log('[SPC_F EXTRACTION] Using random fingerprint:', randomFingerprint);
    console.log('[SPC_F EXTRACTION] Using random User-Agent:', randomUserAgent);

    const url = "https://shopee.vn/api/v4/account/login_by_password";
    const baseHeaders = {
      "Host": "shopee.vn",
      "User-Agent": randomUserAgent,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": "https://shopee.vn/buyer/login",
      "x-csrftoken": randomCsrf,
    };

    const payload = {
      "username": username,
      "password": sha256Hash,
      "support_ivs": true,
      "client_identifier": {
        "security_device_fingerprint": randomFingerprint
      }
    };

    // Setup proxy if provided (with SSRF protection)
    let agent = null;
    if (finalProxy) {
      try {
        // SSRF Protection: Validate proxy before use
        const validation = validateProxyUrl(finalProxy);
        if (!validation.valid) {
          throw new Error(`Proxy validation failed: ${validation.error}`);
        }
        
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        agent = new HttpsProxyAgent(validation.url!);
        console.log(`Using validated proxy for SPC_F extraction: ${validation.url!.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')}`);
      } catch (error) {
        console.warn('Proxy setup failed:', error);
        throw new Error(`Proxy configuration error: ${(error as Error).message}`);
      }
    }

    // ============== FIRST REQUEST: Without SPC_F ==============
    console.log('[SPC_F EXTRACTION] Step 1: Calling API without SPC_F...');
    const response1 = await fetch(url, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(payload),
      agent,
      timeout: 15000
    } as any);

    if (!response1.ok) {
      const responseText = await response1.text();
      throw new Error(`First request failed - HTTP ${response1.status}: ${response1.statusText}`);
    }

    // Collect cookies from first response
    const cookieMap = new Map<string, string>();
    const setCookieHeaders1 = response1.headers.raw()['set-cookie'] || [];
    for (const cookieHeader of setCookieHeaders1) {
      const semi = cookieHeader.indexOf(';');
      const pair = semi === -1 ? cookieHeader : cookieHeader.substring(0, semi);
      const eq = pair.indexOf('=');
      if (eq !== -1) {
        const name = pair.substring(0, eq).trim();
        const value = pair.substring(eq + 1).trim();
        if (name) cookieMap.set(name, value);
      }
    }

    // ============== INJECT SPC_F ==============
    cookieMap.set('SPC_F', spcFValue);
    console.log(`[SPC_F EXTRACTION] Step 2: Injected SPC_F, total cookies: ${cookieMap.size}`);

    // Build cookie string for second request
    const cookieString = Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    // ============== SECOND REQUEST: With SPC_F ==============
    console.log('[SPC_F EXTRACTION] Step 3: Calling API with SPC_F...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        "Cookie": cookieString
      },
      body: JSON.stringify(payload),
      agent,
      timeout: 15000
    } as any);

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${responseText.substring(0, 200)}`);
    }

    // Parse response body to check login status
    const responseBody = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseBody);
    } catch (e) {
      throw new Error('Invalid JSON response from Shopee API');
    }

    // LOG FULL RESPONSE FOR DEBUGGING
    console.log('[SPC_F EXTRACTION] Shopee API Response:', JSON.stringify(responseData));

    // Check if login was successful based on response
    if (responseData.error !== 0) {
      // Log detailed error information
      console.error('[SPC_F EXTRACTION] Login failed - Error code:', responseData.error);
      console.error('[SPC_F EXTRACTION] Error message:', responseData.error_msg);
      console.error('[SPC_F EXTRACTION] Full response:', JSON.stringify(responseData));
      
      // Provide more helpful error messages based on error code
      let errorMessage = responseData.error_msg;
      if (!errorMessage || errorMessage.trim() === '') {
        switch (responseData.error) {
          case 1:
            errorMessage = 'SPC_F không hợp lệ hoặc username/password sai. Vui lòng kiểm tra lại thông tin.';
            break;
          case 2:
            errorMessage = 'Tài khoản bị khóa hoặc cần xác thực bổ sung.';
            break;
          case 3:
            errorMessage = 'Shopee yêu cầu xác thực captcha hoặc 2FA.';
            break;
          default:
            errorMessage = `Lỗi Shopee API (Error code: ${responseData.error})`;
        }
      }
      
      throw new Error(`Login failed: ${errorMessage}`);
    }

    // Extract cookies from Set-Cookie headers
    let spcSt = null;
    let spcEc = null;
    let spcRtId = null;
    let spcTId = null;
    
    const setCookieHeaders = response.headers.raw()['set-cookie'] || [];
    
    for (const cookieHeader of setCookieHeaders) {
      if (cookieHeader.includes('SPC_ST=')) {
        const match = cookieHeader.match(/SPC_ST=([^;]+)/);
        if (match) spcSt = match[1];
      }
      if (cookieHeader.includes('SPC_EC=')) {
        const match = cookieHeader.match(/SPC_EC=([^;]+)/);
        if (match) spcEc = match[1];
      }
      if (cookieHeader.includes('SPC_R_T_ID=')) {
        const match = cookieHeader.match(/SPC_R_T_ID=([^;]+)/);
        if (match) spcRtId = match[1];
      }
      if (cookieHeader.includes('SPC_T_ID=')) {
        const match = cookieHeader.match(/SPC_T_ID=([^;]+)/);
        if (match) spcTId = match[1];
      }
    }

    if (spcSt) {
      return {
        status: 'success',
        message: 'Lấy cookie SPC_ST thành công',
        spcSt: `SPC_ST=${spcSt}`,
        spcF: `SPC_F=${spcFValue}`
      };
    } else {
      return {
        status: 'failed',
        message: 'Không tìm thấy SPC_ST trong phản hồi. Login có thể thất bại hoặc SPC_F không hợp lệ.'
      };
    }

  } catch (error: any) {
    console.error('SPC_F extraction error:', error);
    return {
      status: 'failed',
      message: error.message || 'Lỗi khi xử lý SPC_F extraction'
    };
  }
}

// Function to generate random token for QR
function generateRandomToken(): string {
  const part1 = Buffer.from(crypto.randomBytes(12)).toString('base64');
  const part2 = "oAtDtNfJzOLZY4DVPsUwvJVPz9KM178kWjPSHjP7UV4AtKhBtnyDNxK2PfDptxSpKdacna2Ygg8=";
  const part3 = "vLBZDcIgFdejbiIP";
  const part4 = "08";
  const part5 = "3";
  return `${part1}|${part2}|${part3}|${part4}|${part5}`;
}

// Utility function to parse proxy configuration
function parseProxy(proxyString: string) {
  if (!proxyString) return null;
  
  try {
    const url = new URL(proxyString);
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      auth: url.username && url.password ? {
        username: url.username,
        password: url.password
      } : null
    };
  } catch (error) {
    // Try parsing format: ip:port or ip:port:user:pass
    const parts = proxyString.split(':');
    if (parts.length >= 2) {
      return {
        protocol: 'http',
        host: parts[0],
        port: parseInt(parts[1]),
        auth: parts.length >= 4 ? {
          username: parts[2],
          password: parts[3]
        } : null
      };
    }
  }
  return null;
}

// Function to get order details following your specification
// Function to get order details with proxy retry logic
async function get_order_details_with_retry(spcSt: string, httpProxies: any[] = [], maxRetries: number = 3) {
  const errors = [];
  
  // Try without proxy first
  console.log(`[TRACKING RETRY] Attempt 1/${maxRetries + 1}: Trying without proxy`);
  try {
    const result = await get_order_details(spcSt);
    if (result && result.length > 0) {
      console.log(`[TRACKING RETRY] ✅ Success without proxy - found ${result.length} orders`);
      return { success: true, orders: result, proxy: null };
    } else {
      errors.push(`No proxy: No orders found`);
      console.log(`[TRACKING RETRY] ❌ Failed without proxy: No orders found`);
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    errors.push(`No proxy: ${errorMsg}`);
    console.log(`[TRACKING RETRY] ❌ Exception without proxy: ${errorMsg}`);
    
    // If it's a cookie error, no point trying with proxies
    if (errorMsg.includes('Cookie hết hạn') || errorMsg.includes('DIE')) {
      console.log(`[TRACKING RETRY] Cookie error detected - stopping retry`);
      throw error;
    }
  }

  if (!httpProxies || httpProxies.length === 0) {
    console.log(`[TRACKING RETRY] No proxies available`);
    return {
      success: false,
      error: 'No orders found and no proxies available',
      allErrors: errors,
      orders: []
    };
  }

  // Try with different proxies
  for (let i = 0; i < Math.min(maxRetries, httpProxies.length); i++) {
    const proxy = httpProxies[i];
    const attemptNum = i + 2; // +2 because first attempt was without proxy
    console.log(`[TRACKING RETRY] Attempt ${attemptNum}/${maxRetries + 1}: Trying with proxy ${proxy.ip}:${proxy.port}`);
    
    const proxy_dict = {
      ip: proxy.ip,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      type: proxy.protocol || 'http'
    };

    try {
      const result = await get_order_details(spcSt, proxy_dict);
      
      if (result && result.length > 0) {
        console.log(`[TRACKING RETRY] ✅ Success with proxy ${proxy.ip}:${proxy.port} - found ${result.length} orders`);
        
        // Update proxy usage stats
        try {
          await storage.updateHttpProxy(proxy.id, {
            lastUsed: new Date(),
            totalUsage: proxy.totalUsage + 1
          });
        } catch (updateError) {
          console.log(`[TRACKING RETRY] Warning: Failed to update proxy stats: ${updateError}`);
        }
        
        return { 
          success: true, 
          orders: result, 
          proxy: `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` 
        };
      } else {
        const errorMsg = 'No orders found';
        errors.push(`Proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
        console.log(`[TRACKING RETRY] ❌ Failed with proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
        continue;
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      errors.push(`Proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
      console.log(`[TRACKING RETRY] ❌ Exception with proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
      
      // If it's a cookie error, stop trying
      if (errorMsg.includes('Cookie hết hạn') || errorMsg.includes('DIE')) {
        console.log(`[TRACKING RETRY] Cookie error detected - stopping retry`);
        throw error;
      }
      
      // If it's a network/connection error, try next proxy
      if (errorMsg.includes('timeout') || 
          errorMsg.includes('ECONNRESET') || 
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('403')) {
        console.log(`[TRACKING RETRY] Network/Connection error detected, trying next proxy...`);
        continue;
      }
      
      // For other errors (logic/code errors), stop retrying as changing proxy won't help
      console.log(`[TRACKING RETRY] Non-network error detected - stopping retry to avoid wasting resources`);
      break;
    }
  }

  // All attempts failed
  console.log(`[TRACKING RETRY] ❌ All ${maxRetries + 1} attempts failed`);
  return {
    success: false,
    error: `Failed after ${maxRetries + 1} attempts`,
    allErrors: errors,
    orders: []
  };
}

async function get_order_details(spcSt: string, proxy_dict?: any) {
  let agent = null;
  if (proxy_dict) {
    const { ip, port, type, auth, username, password } = proxy_dict;
    console.log(`Proxy dict received:`, { ip, port, type, auth, username, password });
    
    if (type && type.includes('socks')) {
      const proxyUrl = auth 
        ? `${type}://${auth.username}:${auth.password}@${ip}:${port}`
        : username && password
        ? `${type}://${username}:${password}@${ip}:${port}`
        : `${type}://${ip}:${port}`;
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      // For HTTP proxy, use HttpsProxyAgent for HTTPS requests
      if (username && password) {
        const proxyUrl = `http://${username}:${password}@${ip}:${port}`;
        console.log(`Tracking check: Creating HttpsProxyAgent with auth: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (auth && typeof auth === 'string' && auth.includes(':')) {
        // Handle auth string format "username:password"
        const proxyUrl = `http://${auth}@${ip}:${port}`;
        console.log(`Tracking check: Creating HttpsProxyAgent with auth string: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (auth && auth.username && auth.password) {
        const proxyUrl = `http://${auth.username}:${auth.password}@${ip}:${port}`;
        console.log(`Tracking check: Creating HttpsProxyAgent with auth object: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else {
        const proxyUrl = `http://${ip}:${port}`;
        console.log(`Tracking check: Creating HttpsProxyAgent without auth: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      }
    }
  }

  const headers = {
    'User-Agent': 'Android app Shopee appver=28320 app_type=1',
    'Cookie': spcSt,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };

  const apiListUrl = `https://shopee.vn/api/v4/order/get_all_order_and_checkout_list?limit=5&offset=0`;
  
  
  try {
    // Enhanced fetch with better timeout handling for tracking API
    const response = await Promise.race([
      fetch(apiListUrl, {
        method: 'GET',
        headers,
        agent,
        timeout: 10000 // Increased timeout to 10 seconds for tracking API
      } as any),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tracking API timeout after 10 seconds')), 10000)
      )
    ]) as NodeResponse;

    console.log(`[TRACKING] Response status: ${response.status}`);
    console.log(`[TRACKING] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    // Parse response body - Shopee trả về JSON kể cả khi có lỗi
    let data;
    try {
      const responseText = await response.text();
      console.log(`[TRACKING] Raw response body (first 500 chars):`, responseText.substring(0, 500));
      
      data = JSON.parse(responseText) as any;
      console.log(`[TRACKING] Full parsed JSON:`, JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.log(`[TRACKING] ❌ Không thể parse JSON: ${parseError}`);
      // Nếu không parse được JSON, check HTTP status
      if (response.status === 403 || response.status === 401 || response.status === 200) {
        console.log(`🔴 HTTP ${response.status} - Cookie hết hạn hoặc DIE (không có JSON)`);
        throw new Error('Cookie hết hạn hoặc DIE!');
      }
      return null;
    }
    
    // ⚠️ QUAN TRỌNG: Check error code từ Shopee API
    // Shopee trả về error !== 0 khi cookie DIE (vd: error 19, 90309999...)
    if (data?.error && data.error !== 0) {
      console.log(`🔍 [TRACKING] Detected error code: ${data.error}, error_msg: "${data.error_msg}"`);
      
      // Bất kỳ error code nào KHÁC 0 đều là cookie DIE hoặc lỗi nghiêm trọng
      // Không cần check error_msg vì Shopee có thể trả về error code mà không có message
      console.log(`🔴 Cookie hết hạn hoặc DIE (error code: ${data.error})`);
      throw new Error('Cookie hết hạn hoặc DIE!');
    }
    
    // Fallback: check error_msg alone (nếu có error_msg nhưng error = 0 hoặc null)
    if (data?.error_msg) {
      const errorMsg = data.error_msg.toLowerCase();
      if (errorMsg.includes('authenticate') || 
          errorMsg.includes('authentication') ||
          errorMsg.includes('invalid cookie') ||
          errorMsg.includes('please log in') ||
          errorMsg.includes('failed')) {
        console.log(`🔴 Cookie hết hạn hoặc DIE (via error_msg): ${data.error_msg}`);
        throw new Error('Cookie hết hạn hoặc DIE!');
      }
    }
    
    // Check HTTP status AFTER checking JSON content
    if (response.status === 403 || response.status === 401) {
      console.log(`🔴 HTTP ${response.status} - Cookie hết hạn hoặc DIE`);
      throw new Error('Cookie hết hạn hoặc DIE!');
    }
    
    if (response.status !== 200) {
      console.log(`[TRACKING] ❌ Lỗi khi lấy danh sách đơn hàng: ${response.status}`);
      return null;
    }
    
    const orders = data?.data?.order_data?.details_list || [];

    
    if (orders.length > 0) {
    }

    const orderMap: { [key: string]: number } = {};
    for (const order of orders) {
      const info = order?.info_card || {};
      const oid = info?.order_id;
      const finalTotal = info?.final_total || 0;
      if (oid) {
        orderMap[oid] = finalTotal;
      }
    }
    

    const results = [];
    for (const orderId of Object.keys(orderMap)) {
      const finalTotal = orderMap[orderId];
      const apiDetailUrl = `https://shopee.vn/api/v4/order/get_order_detail?order_id=${orderId}`;
      
      
      try {
        // Enhanced detail request with better timeout handling
        const detailResponse = await Promise.race([
          fetch(apiDetailUrl, {
            method: 'GET',
            headers: {
              ...headers,
              'X-Order-ID': orderId,
              'X-Detail-Request-ID': `detail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            },
            agent,
            timeout: 10000 // Increased timeout for detail requests
          } as any),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Detail API timeout for order ${orderId} after 10 seconds`)), 10000)
          )
        ]) as NodeResponse;


        if (detailResponse.status !== 200) {
          console.log(`Không lấy được chi tiết đơn hàng ${orderId}, mã lỗi: ${detailResponse.status}`);
          continue;
        }

        const detailData = await detailResponse.json() as any;
        if (detailData?.error !== 0) {
          console.log(`Lỗi API chi tiết đơn hàng ${orderId}: ${detailData?.error_msg}`);
          continue;
        }

        const d = detailData?.data || {};

        // order_time từ processing_info -> info_rows
        let orderTime = "Không có";
        const infoRows = d?.processing_info?.info_rows || [];
        for (const row of infoRows) {
          if (row?.info_label?.text === 'label_odp_order_time') {
            orderTime = row?.info_value?.value || "Không có";
            break;
          }
        }

        const trackingNumber = d?.shipping?.tracking_number || 'Không có mã vận đơn';
        const description = d?.shipping?.tracking_info?.description || 'Không có ghi chú';
        const addressInfo = d?.address || {};
        const shippingName = addressInfo?.shipping_name || 'Không có tên người nhận';
        const shippingPhone = addressInfo?.shipping_phone || 'Không có số điện thoại';
        const shippingAddress = addressInfo?.shipping_address || 'Không có địa chỉ';

        const parcelCards = d?.info_card?.parcel_cards || [];
        let itemId, modelId, shopId, name, image, itemPrice, orderPrice;
        
        if (parcelCards.length > 0) {
          try {
            const firstItem = parcelCards[0]?.product_info?.item_groups?.[0]?.items?.[0];
            itemId = firstItem?.item_id;
            modelId = firstItem?.model_id;
            shopId = firstItem?.shop_id;
            name = firstItem?.name || 'Không có tên';
            image = firstItem?.image || 'Không có hình ảnh';
            itemPrice = firstItem?.item_price || 0;
            orderPrice = firstItem?.order_price || 0;
          } catch (error) {
            itemId = modelId = shopId = null;
            name = "Không có tên";
            image = "Không có hình ảnh";
            itemPrice = orderPrice = 0;
          }
        } else {
          itemId = modelId = shopId = null;
          name = "Không có tên";
          image = "Không có hình ảnh";
          itemPrice = orderPrice = 0;
        }

        const orderResult = {
          order_id: orderId,
          tracking_number: trackingNumber,
          description: description,
          shipping_name: shippingName,
          shipping_phone: shippingPhone,
          shipping_address: shippingAddress,
          item_id: itemId,
          model_id: modelId,
          shop_id: shopId,
          name: name,
          image: image,
          item_price: itemPrice,
          order_price: orderPrice,
          final_total: finalTotal,
          order_time: orderTime
        };
        
        results.push(orderResult);
      } catch (error) {
        console.log(`Lỗi khi kết nối chi tiết đơn hàng qua proxy: ${error}`);
        continue;
      }
    }
    
    
    return results;
  } catch (error) {
    console.log(`Lỗi khi kết nối qua proxy: ${error}`);
    // RE-THROW error để caller có thể xử lý (đặc biệt là "Cookie hết hạn hoặc DIE!")
    throw error;
  }
}

// Function to get rapid order details with proxy retry logic
async function get_rapid_order_details_with_retry(spcSt: string, maxRetries: number = 3) {
  const errors = [];
  
  // Try without proxy first
  console.log(`[COOKIE RAPID RETRY] Attempt 1/${maxRetries + 1}: Trying without proxy`);
  try {
    const result = await get_rapid_order_details(spcSt);
    if (result.success) {
      console.log(`[COOKIE RAPID RETRY] ✅ Success without proxy`);
      return result;
    } else {
      errors.push(`No proxy: ${result.error || result.message || 'Unknown error'}`);
      console.log(`[COOKIE RAPID RETRY] ❌ Failed without proxy: ${result.error || result.message}`);
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    errors.push(`No proxy: ${errorMsg}`);
    console.log(`[COOKIE RAPID RETRY] ❌ Exception without proxy: ${errorMsg}`);
  }

  // Get available proxies from database
  let proxies = [];
  try {
    proxies = await storage.getAllHttpProxies();
    proxies = proxies.filter(p => p.isActive); // Only use active proxies
    console.log(`[COOKIE RAPID RETRY] Found ${proxies.length} active proxies`);
  } catch (error: any) {
    console.log(`[COOKIE RAPID RETRY] Failed to get proxies: ${error.message}`);
    return {
      success: false,
      error: `Failed to get proxies: ${error.message}`,
      allErrors: errors,
      driver_phone: null,
      driver_name: null
    };
  }

  if (proxies.length === 0) {
    console.log(`[COOKIE RAPID RETRY] No active proxies available`);
    return {
      success: false,
      error: 'No active proxies available',
      allErrors: errors,
      driver_phone: null,
      driver_name: null
    };
  }

  // Try with different proxies
  for (let i = 0; i < Math.min(maxRetries, proxies.length); i++) {
    const proxy = proxies[i];
    const attemptNum = i + 2; // +2 because first attempt was without proxy
    console.log(`[COOKIE RAPID RETRY] Attempt ${attemptNum}/${maxRetries + 1}: Trying with proxy ${proxy.ip}:${proxy.port}`);
    
    const proxy_dict = {
      ip: proxy.ip,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      type: 'http'
    };

    try {
      const result = await get_rapid_order_details(spcSt, proxy_dict);
      
      if (result.success) {
        console.log(`[COOKIE RAPID RETRY] ✅ Success with proxy ${proxy.ip}:${proxy.port}`);
        
        // Update proxy usage stats
        try {
          await storage.updateHttpProxy(proxy.id, {
            lastUsed: new Date(),
            totalUsage: proxy.totalUsage + 1
          });
        } catch (updateError) {
          console.log(`[COOKIE RAPID RETRY] Warning: Failed to update proxy stats: ${updateError}`);
        }
        
        return result;
      } else {
        const errorMsg = result.error || result.message || 'Unknown error';
        errors.push(`Proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
        console.log(`[COOKIE RAPID RETRY] ❌ Failed with proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
        
        // If it's a network/connection error, try next proxy
        if (errorMsg.includes('403') || 
            errorMsg.includes('ECONNRESET') || 
            errorMsg.includes('ETIMEDOUT') ||
            errorMsg.includes('ECONNREFUSED') ||
            errorMsg.includes('timeout')) {
          console.log(`[COOKIE RAPID RETRY] Network/Connection error detected, trying next proxy...`);
          continue;
        }
        
        // For other errors (logic/cookie errors), stop retrying as changing proxy won't help
        console.log(`[COOKIE RAPID RETRY] Non-network error detected - stopping retry to avoid wasting resources`);
        break;
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      errors.push(`Proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
      console.log(`[COOKIE RAPID RETRY] ❌ Exception with proxy ${proxy.ip}:${proxy.port}: ${errorMsg}`);
      
      // If it's a network/connection error, try next proxy
      if (errorMsg.includes('timeout') || 
          errorMsg.includes('ECONNRESET') || 
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('403')) {
        console.log(`[COOKIE RAPID RETRY] Network/Connection error detected, trying next proxy...`);
        continue;
      }
      
      // For other errors (logic/cookie errors), stop retrying as changing proxy won't help
      console.log(`[COOKIE RAPID RETRY] Non-network error detected - stopping retry to avoid wasting resources`);
      break;
    }
  }

  // All attempts failed
  console.log(`[COOKIE RAPID RETRY] ❌ All ${maxRetries + 1} attempts failed`);
  return {
    success: false,
    error: `All ${maxRetries + 1} attempts failed`,
    allErrors: errors,
    driver_phone: null,
    driver_name: null
  };
}

// Function to get rapid order details for Cookie_hỏa tốc service - returns full order details when shipper info found
async function get_rapid_order_details(spcSt: string, proxy_dict?: any) {
  let agent = null;
  if (proxy_dict) {
    const { ip, port, type, auth, username, password } = proxy_dict;
    console.log(`Cookie Rapid Proxy dict received:`, { ip, port, type: type || 'http' });
    
    if (type && type.includes('socks')) {
      const proxyUrl = auth 
        ? `${type}://${auth.username}:${auth.password}@${ip}:${port}`
        : username && password
        ? `${type}://${username}:${password}@${ip}:${port}`
        : `${type}://${ip}:${port}`;
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      // For HTTP proxy, use HttpsProxyAgent for HTTPS requests
      if (username && password) {
        const proxyUrl = `http://${username}:${password}@${ip}:${port}`;
        console.log(`Cookie Rapid: Creating HttpsProxyAgent with auth: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (auth && typeof auth === 'string' && auth.includes(':')) {
        // Handle auth string format "username:password"
        const proxyUrl = `http://${auth}@${ip}:${port}`;
        console.log(`Cookie Rapid: Creating HttpsProxyAgent with auth string: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (auth && auth.username && auth.password) {
        const proxyUrl = `http://${auth.username}:${auth.password}@${ip}:${port}`;
        console.log(`Cookie Rapid: Creating HttpsProxyAgent with auth object: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else {
        const proxyUrl = `http://${ip}:${port}`;
        console.log(`Cookie Rapid: Creating HttpsProxyAgent without auth: ${ip}:${port}`);
        agent = new HttpsProxyAgent(proxyUrl);
      }
    }
  }

  const headers = {
    'User-Agent': 'Android app Shopee appver=28320 app_type=1',
    'Cookie': spcSt,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };

  const apiListUrl = `https://shopee.vn/api/v4/order/get_all_order_and_checkout_list?limit=5&offset=0`;
  
  console.log(`[COOKIE RAPID DEBUG] Starting request for cookie: [REDACTED]`);
  console.log(`[COOKIE RAPID DEBUG] Request URL: ${apiListUrl}`);
  console.log(`[COOKIE RAPID DEBUG] Proxy: ${proxy_dict ? `${proxy_dict.ip}:${proxy_dict.port}` : 'no proxy'}`);
  
  try {
    // Enhanced fetch with better timeout handling
    const response = await Promise.race([
      fetch(apiListUrl, {
        method: 'GET',
        headers,
        agent,
        timeout: 10000 // Increased timeout to 10 seconds
      } as any),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cookie Rapid API timeout after 10 seconds')), 10000)
      )
    ]) as NodeResponse;

    console.log(`[COOKIE RAPID DEBUG] Response status: ${response.status}`);
    
    if (response.status !== 200) {
      console.log(`Lỗi khi lấy danh sách đơn hàng (Rapid): ${response.status}`);
      return { 
        success: false, 
        error: `API error: ${response.status}`,
        driver_phone: null,
        driver_name: null
      };
    }

    const data = await response.json() as any;
    const orders = data?.data?.order_data?.details_list || [];

    console.log(`[COOKIE RAPID DEBUG] Cookie [REDACTED] returned ${orders.length} orders`);
    console.log(`[COOKIE RAPID DEBUG] Response data available, ${orders.length} orders found`);
    
    if (orders.length === 0) {
      return {
        success: true,
        driver_phone: null,
        driver_name: null,
        message: "Không có đơn hàng nào",
        orders: []
      };
    }

    const orderMap: { [key: string]: number } = {};
    for (const order of orders) {
      const info = order?.info_card || {};
      const oid = info?.order_id;
      const finalTotal = info?.final_total || 0;
      if (oid) {
        orderMap[oid] = finalTotal;
      }
    }
    

    const results = [];
    let driverPhone = null;
    let driverName = null;
    let vehiclePlate = null; // Biển số xe

    // Process each order to get detailed information
    for (const orderId of Object.keys(orderMap)) {
      const finalTotal = orderMap[orderId];
      const apiDetailUrl = `https://shopee.vn/api/v4/order/get_order_detail?order_id=${orderId}`;
      
      console.log(`[COOKIE RAPID DEBUG] Getting details for order ${orderId}`);
      
      try {
        // Enhanced detail request with better timeout handling
        const detailResponse = await Promise.race([
          fetch(apiDetailUrl, {
            method: 'GET',
            headers: {
              ...headers,
              'X-Order-ID': orderId,
              'X-Detail-Request-ID': `detail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            },
            agent,
            timeout: 10000 // Increased timeout for detail requests
          } as any),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Detail API timeout for order ${orderId} after 10 seconds`)), 10000)
          )
        ]) as NodeResponse;


        if (detailResponse.status !== 200) {
          console.log(`Không lấy được chi tiết đơn hàng ${orderId}, mã lỗi: ${detailResponse.status}`);
          continue;
        }

        const detailData = await detailResponse.json() as any;
        if (detailData?.error !== 0) {
          console.log(`Lỗi API chi tiết đơn hàng ${orderId}: ${detailData?.error_msg}`);
          continue;
        }

        const d = detailData?.data || {};

        // order_time từ processing_info -> info_rows
        let orderTime = "Không có";
        const infoRows = d?.processing_info?.info_rows || [];
        for (const row of infoRows) {
          if (row?.info_label?.text === 'label_odp_order_time') {
            orderTime = row?.info_value?.value || "Không có";
            break;
          }
        }

        const trackingNumber = d?.shipping?.tracking_number || 'Không có mã vận đơn';
        const description = d?.shipping?.tracking_info?.description || 'Không có ghi chú';
        const addressInfo = d?.address || {};
        const shippingName = addressInfo?.shipping_name || 'Không có tên người nhận';
        const shippingPhone = addressInfo?.shipping_phone || 'Không có số điện thoại';
        const shippingAddress = addressInfo?.shipping_address || 'Không có địa chỉ';

        // Look for driver information in various places
        const shipping = d?.shipping || {};
        const tracking = shipping?.tracking_info || {};
        const delivery = shipping?.delivery_info || {};
        
        // Check for driver information
        if (shipping.driver_phone && !driverPhone) {
          driverPhone = shipping.driver_phone;
        }
        if (shipping.driver_name && !driverName) {
          driverName = shipping.driver_name;
        }
        if (tracking.driver_phone && !driverPhone) {
          driverPhone = tracking.driver_phone;
        }
        if (tracking.driver_name && !driverName) {
          driverName = tracking.driver_name;
        }
        if (delivery.driver_phone && !driverPhone) {
          driverPhone = delivery.driver_phone;
        }
        if (delivery.driver_name && !driverName) {
          driverName = delivery.driver_name;
        }

        // Check for vehicle plate information (biển số xe)
        if (shipping.vehicle_plate && !vehiclePlate) {
          vehiclePlate = shipping.vehicle_plate;
        }
        if (shipping.license_plate && !vehiclePlate) {
          vehiclePlate = shipping.license_plate;
        }
        if (shipping.bien_so_xe && !vehiclePlate) {
          vehiclePlate = shipping.bien_so_xe;
        }
        if (tracking.vehicle_plate && !vehiclePlate) {
          vehiclePlate = tracking.vehicle_plate;
        }
        if (tracking.license_plate && !vehiclePlate) {
          vehiclePlate = tracking.license_plate;
        }
        if (tracking.bien_so_xe && !vehiclePlate) {
          vehiclePlate = tracking.bien_so_xe;
        }
        if (delivery.vehicle_plate && !vehiclePlate) {
          vehiclePlate = delivery.vehicle_plate;
        }
        if (delivery.license_plate && !vehiclePlate) {
          vehiclePlate = delivery.license_plate;
        }
        if (delivery.bien_so_xe && !vehiclePlate) {
          vehiclePlate = delivery.bien_so_xe;
        }
        
        // Also check in driver_info nested object if exists
        const driverInfo = shipping?.driver_info || tracking?.driver_info || delivery?.driver_info || {};
        if (driverInfo.vehicle_plate && !vehiclePlate) {
          vehiclePlate = driverInfo.vehicle_plate;
        }
        if (driverInfo.license_plate && !vehiclePlate) {
          vehiclePlate = driverInfo.license_plate;
        }
        if (driverInfo.bien_so_xe && !vehiclePlate) {
          vehiclePlate = driverInfo.bien_so_xe;
        }

        const parcelCards = d?.info_card?.parcel_cards || [];
        let itemId, modelId, shopId, name, image, itemPrice, orderPrice;
        
        if (parcelCards.length > 0) {
          try {
            const firstItem = parcelCards[0]?.product_info?.item_groups?.[0]?.items?.[0];
            itemId = firstItem?.item_id;
            modelId = firstItem?.model_id;
            shopId = firstItem?.shop_id;
            name = firstItem?.name || 'Không có tên';
            image = firstItem?.image || 'Không có hình ảnh';
            itemPrice = firstItem?.item_price || 0;
            orderPrice = firstItem?.order_price || 0;
          } catch (error) {
            itemId = modelId = shopId = null;
            name = "Không có tên";
            image = "Không có hình ảnh";
            itemPrice = orderPrice = 0;
          }
        } else {
          itemId = modelId = shopId = null;
          name = "Không có tên";
          image = "Không có hình ảnh";
          itemPrice = orderPrice = 0;
        }

        const orderResult = {
          order_id: orderId,
          tracking_number: trackingNumber,
          description: description,
          shipping_name: shippingName,
          shipping_phone: shippingPhone,
          shipping_address: shippingAddress,
          item_id: itemId,
          model_id: modelId,
          shop_id: shopId,
          name: name,
          image: image,
          item_price: itemPrice,
          order_price: orderPrice,
          final_total: finalTotal,
          order_time: orderTime
        };
        
        console.log(`[COOKIE RAPID DEBUG] Adding order result for ${orderId}:`, orderResult);
        results.push(orderResult);
      } catch (error) {
        console.log(`Lỗi khi kết nối chi tiết đơn hàng qua proxy: ${error}`);
        continue;
      }
    }
    
    console.log(`[COOKIE RAPID DEBUG] Final results: ${results.length} orders with driver info - Phone: ${driverPhone}, Name: ${driverName}, Vehicle Plate: ${vehiclePlate}`);

    return {
      success: true,
      driver_phone: driverPhone,
      driver_name: driverName,
      vehicle_plate: vehiclePlate,
      has_driver_info: !!driverPhone,
      has_vehicle_plate: !!vehiclePlate,
      message: driverPhone ? "Tìm thấy thông tin shipper" : "Chưa có số shipper",
      orders: results,
      order_count: results.length
    };

  } catch (error) {
    console.log(`[COOKIE RAPID DEBUG] Error: ${error}`);
    return {
      success: false,
      error: `Connection error: ${error}`,
      driver_phone: null,
      driver_name: null,
      vehicle_plate: null,
      orders: []
    };
  }
}

// Function to get account info following your specification
// Helper function to get next available proxy when current one fails
async function getNextAvailableProxy(currentProxy: any, httpProxies: any[], systemProxies: any[], proxyList: any[], currentIndex: number) {
  // Try next HTTP proxy if available
  if (httpProxies && httpProxies.length > 0) {
    const filteredProxies = httpProxies.filter(p => p.isActive && p.id !== currentProxy?.id);
    if (filteredProxies.length > 0) {
      const randomProxy = filteredProxies[Math.floor(Math.random() * filteredProxies.length)];
      return {
        ip: randomProxy.ip,
        port: randomProxy.port,
        username: randomProxy.username,
        password: randomProxy.password,
        type: 'http',
        id: randomProxy.id
      };
    }
  }
  
  // Try next system proxy if available
  if (systemProxies && systemProxies.length > 0 && currentIndex + 1 < systemProxies.length) {
    return systemProxies[currentIndex + 1];
  }
  
  // Try next user proxy if available
  if (proxyList && proxyList.length > 0 && currentIndex + 1 < proxyList.length) {
    return proxyList[currentIndex + 1];
  }
  
  return null;
}

async function get_account_info(spcSt: string, proxy_dict?: any) {
  const result = {
    status: false,
    message: "",
    data: null as any,
    spcF: null as string | null
  };

  let agent = null;
  if (proxy_dict) {
    const { ip, port, type, auth, username, password } = proxy_dict;
    
    if (type && type.includes('socks')) {
      const proxyUrl = auth 
        ? `${type}://${auth.username}:${auth.password}@${ip}:${port}`
        : username && password
        ? `${type}://${username}:${password}@${ip}:${port}`
        : `${type}://${ip}:${port}`;
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      // For HTTP proxy, use HttpsProxyAgent for HTTPS requests
      if (username && password) {
        const proxyUrl = `http://${username}:${password}@${ip}:${port}`;
        console.log(`Account check: Creating HttpsProxyAgent with auth: ${proxyUrl}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else if (auth && auth.username && auth.password) {
        const proxyUrl = `http://${auth.username}:${auth.password}@${ip}:${port}`;
        console.log(`Account check: Creating HttpsProxyAgent with auth object: ${proxyUrl}`);
        agent = new HttpsProxyAgent(proxyUrl);
      } else {
        const proxyUrl = `http://${ip}:${port}`;
        console.log(`Account check: Creating HttpsProxyAgent without auth: ${proxyUrl}`);
        agent = new HttpsProxyAgent(proxyUrl);
      }
    }
  }

  const url = "https://shopee.vn/api/v4/account/basic/get_account_info";
  const headers = {
    "Host": "shopee.vn",
    "Cookie": spcSt
  };

  try {
    console.log(`Account check API: Calling ${url}`);
    console.log(`Account check API: Cookie preview: ${spcSt.substring(0, 50)}...`);
    console.log(`Account check API: Proxy: ${proxy_dict ? `${proxy_dict.ip}:${proxy_dict.port}` : 'no proxy'}`);
    
    // Enhanced fetch with better timeout handling
    const response = await Promise.race([
      fetch(url, {
        method: 'GET',
        headers,
        agent,
        timeout: 15000 // Reduced timeout to 15 seconds for faster retries
      } as any),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout after 15 seconds')), 15000)
      )
    ]) as NodeResponse;

    console.log(`Account check API: Response status: ${response.status}`);
    
    // Extract SPC_F from set-cookie header
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const spcFMatch = setCookieHeader.match(/SPC_F=([^;]+)/);
      if (spcFMatch) {
        result.spcF = spcFMatch[1];
        console.log(`Account check API: Extracted SPC_F: ${result.spcF.substring(0, 20)}...`);
      }
    }
    
    if (response.status === 200) {
      try {
        const data = await response.json() as any;
        console.log(`Account check API: Parsed JSON:`, JSON.stringify(data, null, 2));
        
        if (!data.data) {
          // Check for specific error codes
          if (data.error === 19 || (data.error_msg && data.error_msg.toLowerCase().includes('authenticate'))) {
            result.message = "Cookie hết hạn hoặc DIE!";
          } else {
            result.message = data.error_msg || "Có lỗi, xin vui lòng thử lại sau";
          }
          return result;
        } else {
          const accountInfo = {
            userid: data.data.userid || "",
            username: data.data.username || "",
            nickname: data.data.nickname || "",
            email: data.data.email || "",
            phone: data.data.phone || "",
            shopid: data.data.shopid || "",
            ctime: data.data.ctime ? new Date(data.data.ctime * 1000).toISOString() : ""
          };

          console.log(`Account check API: Success! Username: ${accountInfo.username}`);
          result.status = true;
          result.data = accountInfo;
          result.message = "Success";
        }
      } catch (parseError) {
        console.log(`Account check API: JSON parse error:`, parseError);
        result.message = "Invalid JSON response";
      }
    } else {
      const responseText = await response.text();
      console.log(`Account check API: HTTP Error ${response.status}, Response: ${responseText}`);
      result.message = `HTTP Error: ${response.status}`;
    }
  } catch (error: any) {
    console.log(`Account check API: Request Error: ${error.message}`);
    result.message = `Request Error: ${error.message}`;
  }

  return result;
}

// External API Provider helper functions
async function rentNumberFromProvider(rentalId: number, apiKey: string, provider: string, carrier: string = 'random') {
  const maxAttempts = 10;
  let attempt = 1;
  
  while (attempt <= maxAttempts) {
    console.log(`[EXTERNAL-API] Provider ${provider} - Attempt ${attempt}/${maxAttempts}`);
    
    try {
      // Try to get a phone number from the provider
      const numberResult = await getPhoneNumberFromProvider(provider, apiKey, carrier);
      
      // Check for insufficient balance errors - DỪNG NGAY không retry
      if (!numberResult.success && numberResult.error) {
        const errorMsg = numberResult.error.toLowerCase();
        if (errorMsg.includes('số dư') || 
            errorMsg.includes('balance') || 
            errorMsg.includes('insufficient') ||
            errorMsg.includes('not enough') ||
            errorMsg.includes('không đủ')) {
          console.log(`[EXTERNAL-API] ❌ INSUFFICIENT BALANCE - Provider ${provider}: ${numberResult.error}`);
          return {
            success: false,
            phoneNumber: null,
            formattedPhoneNumber: null,
            carrier: null,
            price: null,
            isShopeeRegistered: null,
            errorMessage: `Số dư API key không đủ để thuê số. Vui lòng nạp thêm số dư cho ${provider}.`,
            attemptNumber: attempt
          };
        }
      }
      
      if (numberResult.success && numberResult.phoneNumber) {
        console.log(`[EXTERNAL-API] Provider ${provider} - Got number: ${numberResult.phoneNumber}`);
        
        // Check if number is registered on Shopee using system's robust method with retry logic
        const shopeeCheckResult = await storage.checkPhoneShopeeRegistration(numberResult.phoneNumber);
        console.log(`[EXTERNAL-API] Shopee check for ${numberResult.phoneNumber}: ${shopeeCheckResult.isRegistered ? 'REGISTERED' : 'NOT REGISTERED'}${shopeeCheckResult.error ? ` (Error: ${shopeeCheckResult.error})` : ''}`);
        
        // QUAN TRỌNG: Chỉ return số khi 200 OK (không có error và chưa đăng ký)
        // Tất cả trường hợp khác (có error hoặc đã đăng ký) đều coi như đã đăng ký
        if (!shopeeCheckResult.isRegistered && !shopeeCheckResult.error) {
          console.log(`[EXTERNAL-API] ✅ Found valid unregistered number (200 OK): ${numberResult.phoneNumber}`);
          return {
            success: true,
            phoneNumber: numberResult.phoneNumber,
            formattedPhoneNumber: formatPhoneNumber(numberResult.phoneNumber),
            carrier: numberResult.carrier || "unknown",
            price: numberResult.price || "0",
            isShopeeRegistered: false,
            providerRequestId: numberResult.requestId,
            attemptNumber: attempt
          };
        } else {
          const reason = shopeeCheckResult.error 
            ? `Error: ${shopeeCheckResult.error}` 
            : 'Already registered on Shopee';
          console.log(`[EXTERNAL-API] ❌ Number ${numberResult.phoneNumber} rejected (${reason}), retrying...`);
        }
      }
      
      // If failed, wait 1 second before retry
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`[EXTERNAL-API] Provider ${provider} - Attempt ${attempt} failed:`, error);
      
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    attempt++;
  }
  
  // All attempts failed
  return {
    success: false,
    phoneNumber: null,
    formattedPhoneNumber: null,
    carrier: null,
    price: null,
    isShopeeRegistered: null,
    errorMessage: `Không thể lấy số điện thoại từ ${provider} sau ${maxAttempts} lần thử. Vui lòng thử lại sau hoặc chọn provider khác.`,
    attemptNumber: maxAttempts
  };
}

async function getPhoneNumberFromProvider(provider: string, apiKey: string, carrier: string = 'random') {
  switch (provider) {
    case "viotp":
      return await getPhoneFromViotp(apiKey, carrier);
    case "chaycodes3":
      return await getPhoneFromChaycodes3(apiKey, carrier);
    case "365otp":
      return await getPhoneFrom365otp(apiKey, carrier);
    case "funotp":
      return await getPhoneFromFunOtp(apiKey, carrier);
    case "ironsim":
      return await getPhoneFromIronSim(apiKey, carrier);
    case "bossotp":
      return await getPhoneFromBossOtp(apiKey, carrier);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function getPhoneFromViotp(apiKey: string, carrier: string = 'random') {
  try {
    // Build network parameter based on carrier selection
    let networkParam;
    const availableNetworks = ['MOBIFONE', 'VINAPHONE', 'VIETTEL', 'VIETNAMOBILE', 'ITELECOM'];
    
    if (carrier === 'random') {
      // Use all networks for random selection
      networkParam = availableNetworks.join('|');
    } else {
      // Use specific carrier or fallback to all if invalid
      if (availableNetworks.includes(carrier.toUpperCase())) {
        networkParam = carrier.toUpperCase();
      } else {
        networkParam = availableNetworks.join('|');
      }
    }
    
    const response = await fetch(`https://api.viotp.com/request/getv2?token=${apiKey}&serviceId=4&network=${networkParam}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json() as any;
      // Response format: {"status_code":200,"success":true,"message":"successful","data":{"phone_number":"987654321","balance":50000,"request_id":"122314","re_phone_number":"84987654321","countryISO":"VN","countryCode":"84"}}
      if (data?.success && data?.data && data?.data?.phone_number) {
        return {
          success: true,
          phoneNumber: data.data.phone_number,
          carrier: "unknown", // Viotp doesn't return carrier in response
          price: "0", // Need to get pricing from another API
          requestId: data.data.request_id
        };
      }
      // If response 200 but data is invalid
      console.error(`[VIOTP] API Error: Invalid response data`, data);
      return { success: false, error: `Invalid response data from API` };
    } else {
      // For non-200 status, read error text
      const errorText = await response.text();
      console.error(`[VIOTP] API Error: ${response.status} - ${errorText}`);
      return { success: false, error: `API Error: ${response.status}` };
    }
  } catch (error: any) {
    console.error('[VIOTP] Request failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

async function getPhoneFromChaycodes3(apiKey: string, carrier: string = 'random') {
  try {
    // Build carrier parameter based on selection
    let carrierParam;
    const availableCarriers = ['Viettel', 'Mobi', 'Vina', 'VNMB', 'ITelecom'];
    
    if (carrier === 'random') {
      // Use all carriers for random selection
      carrierParam = availableCarriers.join(',');
    } else {
      // Map frontend carrier names to Chaycodes3 format
      const carrierMap: Record<string, string> = {
        'VIETTEL': 'Viettel',
        'MOBIFONE': 'Mobi', 
        'VINAPHONE': 'Vina',
        'VIETNAMOBILE': 'VNMB',
        'ITELECOM': 'ITelecom'
      };
      
      const mappedCarrier = carrierMap[carrier.toUpperCase()] || carrier;
      if (availableCarriers.includes(mappedCarrier)) {
        carrierParam = mappedCarrier;
      } else {
        carrierParam = availableCarriers.join(',');
      }
    }
    
    const response = await fetch(`https://chaycodeso3.com/api?act=number&apik=${apiKey}&appId=1002&carrier=${carrierParam}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json() as any;
      // Response format: { "ResponseCode": 0, "Msg": "OK", "Result": { "Id":1010, "Number": "399900112", "App":"Facebook" "Cost": 1000, "Balance": 99000 } }
      if (data?.ResponseCode === 0 && data?.Result && data?.Result?.Number) {
        return {
          success: true,
          phoneNumber: data.Result.Number,
          carrier: "unknown", // Chaycodes3 doesn't return carrier in this response
          price: data.Result.Cost?.toString() || "0",
          requestId: data.Result.Id?.toString()
        };
      }
    }
    
    const errorText = await response.text();
    console.error(`[CHAYCODES3] API Error: ${response.status} - ${errorText}`);
    return { success: false, error: `API Error: ${response.status}` };
  } catch (error: any) {
    console.error('[CHAYCODES3] Request failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

async function getPhoneFrom365otp(apiKey: string, carrier: string = 'random') {
  try {
    // Build networkId parameter based on carrier selection
    let networkIdParam;
    const carrierToNetworkMap: Record<string, string> = {
      '1': '1',      // Viettel
      '2': '2',      // MobiFone  
      '3': '3',      // VinaPhone
      '4': '4',      // Vietnamobile
      '5': '5',      // Itelecom
      'VIETTEL': '1',
      'MOBIFONE': '2', 
      'VINAPHONE': '3',
      'VIETNAMOBILE': '4',
      'ITELECOM': '5',
      'MAIN_3': '1,2,3'  // 3 mạng chính
    };
    
    if (carrier === 'random') {
      // Use all networks for random selection
      networkIdParam = '1,2,3,4,5';
    } else if (carrier === 'main_3') {
      // Use 3 main networks (Viettel, MobiFone, VinaPhone)
      networkIdParam = '1,2,3';
    } else {
      // Map carrier to networkId
      const networkId = carrierToNetworkMap[carrier.toUpperCase()] || carrierToNetworkMap[carrier];
      if (networkId) {
        networkIdParam = networkId;
      } else {
        networkIdParam = '1,2,3,4,5'; // Fallback to all
      }
    }
    
    const response = await fetch(`https://365otp.com/apiv1/orderv2?apikey=${apiKey}&serviceId=270&networkId=${networkIdParam}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json() as any;
      // Response format: {"status":1,"id":38748805,"phone":"0945349341","message":"Yêu cầu giao dịch thành công."}
      if (data?.status === 1 && data?.phone) {
        return {
          success: true,
          phoneNumber: data.phone,
          carrier: "unknown", // 365OTP doesn't return carrier in this response
          price: "0", // Price not in response
          requestId: data.id?.toString()
        };
      }
    }
    
    const errorText = await response.text();
    console.error(`[365OTP] API Error: ${response.status} - ${errorText}`);
    return { success: false, error: `API Error: ${response.status}` };
  } catch (error: any) {
    console.error('[365OTP] Request failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

async function getPhoneFromFunOtp(apiKey: string, carrier: string = 'random') {
  try {
    // Build operator parameter based on carrier selection
    let operatorParam;
    const availableOperators = ['mobifone', 'vinaphone', 'viettel', 'vietnamobile'];
    
    if (carrier === 'random') {
      // Use all operators for random selection
      operatorParam = availableOperators.join('|');
    } else {
      // Map carrier to FunOTP operator format
      const carrierMap: Record<string, string> = {
        'MOBIFONE': 'mobifone',
        'VINAPHONE': 'vinaphone', 
        'VIETTEL': 'viettel',
        'VIETNAMOBILE': 'vietnamobile'
      };
      
      const mappedOperator = carrierMap[carrier.toUpperCase()];
      if (mappedOperator) {
        operatorParam = mappedOperator;
      } else {
        operatorParam = availableOperators.join('|');
      }
    }
    
    const response = await fetch(`https://funotp.com/api?action=number&service=shopee&apikey=${apiKey}&operator=${operatorParam}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json() as any;
      // Response format: {"ResponseCode": 0, "Result": { "number": "84587982403", "id": "62d9ae42fa8c40712a68e8eb", "service": "Facebook", "price": 1000, "balance": 9889875599, "start": "2022-11-30T09:49:45.959Z", "end": "2022-11-30T09:53:45.959Z", "numberno84": "587982403" }}
      if (data?.ResponseCode === 0 && data?.Result && data?.Result?.number) {
        return {
          success: true,
          phoneNumber: data.Result.numberno84 || data.Result.number.replace('84', ''), // Use numberno84 (without +84) or fallback
          carrier: "unknown", // FunOTP doesn't return carrier in response
          price: data.Result.price?.toString() || "0",
          requestId: data.Result.id
        };
      }
      // If response 200 but data is invalid
      console.error(`[FUNOTP] API Error: Invalid response data`, data);
      return { success: false, error: `Invalid response data from API` };
    } else {
      // For non-200 status, read error text
      const errorText = await response.text();
      console.error(`[FUNOTP] API Error: ${response.status} - ${errorText}`);
      return { success: false, error: `API Error: ${response.status}` };
    }
  } catch (error: any) {
    console.error('[FUNOTP] Request failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

async function getPhoneFromIronSim(apiKey: string, carrier: string = 'random') {
  try {
    // Build network parameter based on carrier selection
    let networkParam;
    const carrierToNetworkMap: Record<string, string> = {
      'VIETTEL': '3',
      'MOBIFONE': '1', 
      'VINAPHONE': '2',
      'VIETNAMOBILE': '4',
      'ITELECOM': '6'
    };
    
    if (carrier === 'random') {
      // Use all networks for random selection
      networkParam = '1,2,3,4,6';
    } else {
      // Map carrier to network ID
      const networkId = carrierToNetworkMap[carrier.toUpperCase()];
      if (networkId) {
        networkParam = networkId;
      } else {
        networkParam = '1,2,3,4,6'; // Fallback to all
      }
    }
    
    const response = await fetch(`https://ironsim.com/api/phone/new-session?token=${apiKey}&service=422&network=${networkParam}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json() as any;
      // Response format: {"status_code":200,"success":true,"message":"successful","data":{"phone_number":"987654321","network":3,"session":"b4f71cb62c2a77e13937c00fd0548e1b"}}
      if (data?.status_code === 200 && data?.success && data?.data && data?.data?.phone_number) {
        // Map network ID back to carrier name
        const networkToCarrierMap: Record<string, string> = {
          '1': 'MOBIFONE',
          '2': 'VINAPHONE',
          '3': 'VIETTEL',
          '4': 'VIETNAMOBILE',
          '6': 'ITELECOM'
        };
        
        return {
          success: true,
          phoneNumber: data.data.phone_number,
          carrier: networkToCarrierMap[data.data.network?.toString()] || "unknown",
          price: "0", // Price not in response
          requestId: data.data.session
        };
      }
      // If response 200 but data is invalid
      console.error(`[IRONSIM] API Error: Invalid response data`, data);
      return { success: false, error: `Invalid response data from API` };
    } else {
      // For non-200 status, read error text
      const errorText = await response.text();
      console.error(`[IRONSIM] API Error: ${response.status} - ${errorText}`);
      return { success: false, error: `API Error: ${response.status}` };
    }
  } catch (error: any) {
    console.error('[IRONSIM] Request failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

async function getPhoneFromBossOtp(apiKey: string, carrier: string = 'random') {
  try {
    // Build network parameter based on carrier selection for Shopee service
    let networkParam;
    const availableNetworks = ['VIETTEL', 'MOBIFONE', 'VINAPHONE', 'VIETNAMOBILE'];
    
    if (carrier === 'random') {
      // BossOTP doesn't support multiple networks, pick one randomly
      const randomIndex = Math.floor(Math.random() * availableNetworks.length);
      networkParam = availableNetworks[randomIndex];
    } else {
      // Use specific carrier or fallback to random selection if invalid
      if (availableNetworks.includes(carrier.toUpperCase())) {
        networkParam = carrier.toUpperCase();
      } else {
        // Fallback to random selection for invalid carrier
        const randomIndex = Math.floor(Math.random() * availableNetworks.length);
        networkParam = availableNetworks[randomIndex];
      }
    }
    
    const response = await fetch(`https://bossotp.net/api/v4/rents/create?service_id=662bc7fc6acaf2d182ee938c&network=${encodeURIComponent(networkParam)}&language=vn&api_token=${apiKey}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json() as any;
      // Response format: {"number":"344379832","rent_id":"195410817103953920","now_balance":163417}
      if (data?.number && data?.rent_id) {
        return {
          success: true,
          phoneNumber: data.number,
          carrier: "unknown", // BossOTP doesn't return carrier in response
          price: "0", // Price not in this response
          requestId: data.rent_id
        };
      }
      // If response 200 but data is invalid
      console.error(`[BOSSOTP] API Error: Invalid response data`, data);
      return { success: false, error: `Invalid response data from API` };
    } else {
      // For non-200 status, read error text
      const errorText = await response.text();
      console.error(`[BOSSOTP] API Error: ${response.status} - ${errorText}`);
      return { success: false, error: `API Error: ${response.status}` };
    }
  } catch (error: any) {
    console.error('[BOSSOTP] Request failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

// Poll OTP from external providers
async function pollOtpFromProvider(provider: string, apiKey: string, requestId: string) {
  switch (provider) {
    case "viotp":
      return await pollOtpFromViotp(apiKey, requestId);
    case "chaycodes3":
      return await pollOtpFromChaycodes3(apiKey, requestId);
    case "365otp":
      return await pollOtpFrom365otp(apiKey, requestId);
    case "funotp":
      return await pollOtpFromFunOtp(apiKey, requestId);
    case "ironsim":
      return await pollOtpFromIronSim(apiKey, requestId);
    case "bossotp":
      return await pollOtpFromBossOtp(apiKey, requestId);
    default:
      return { success: false, error: `Unsupported provider: ${provider}` };
  }
}

async function pollOtpFromViotp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://api.viotp.com/session/getv2?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[VIOTP OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      // CRITICAL: Validate response structure first
      const typedData = data as any;
      if (typeof typedData !== 'object' || typedData === null || typeof typedData.status_code !== 'number' || typeof typedData.success !== 'boolean' || !typedData.data || typeof typedData.data !== 'object') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      // Check main status first
      if (typedData.status_code !== 200 || !typedData.success) {
        return {
          success: false,
          state: 'error',
          error: `API Error: ${typedData.message || 'Unknown error'} (status_code: ${typedData.status_code})`
        };
      }
      
      // CRITICAL: Check Status field first, not Code presence
      const status = typedData.data.Status;
      
      if (status === 1) {
        // Status 1: Hoàn thành - return success regardless of Code presence
        return {
          success: true,
          state: 'completed',
          otpCode: typedData.data.Code || null,
          smsContent: typedData.data.SmsContent || null,
          providerStatus: status
        };
      } else if (status === 0) {
        // Status 0: Đợi tin nhắn
        return {
          success: false,
          state: 'waiting',
          error: "Chưa có OTP, vui lòng thử lại sau",
          providerStatus: status
        };
      } else if (status === 2) {
        // Status 2: Hết hạn - terminal state, stop retries
        return {
          success: false,
          state: 'expired',
          expired: true,
          error: "Phiên thuê đã hết hạn",
          providerStatus: status
        };
      } else {
        // Unknown Status - treat as error
        return {
          success: false,
          state: 'error',
          error: `Unknown Status: ${status}`,
          providerStatus: status
        };
      }
    } else {
      const errorText = await response.text();
      console.error(`[VIOTP OTP] HTTP Error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        state: 'error',
        error: `HTTP Error: ${response.status}` 
      };
    }
  } catch (error: any) {
    console.error('[VIOTP OTP] Request failed:', error);
    return { 
      success: false, 
      state: 'error',
      error: error?.message || 'Unknown error' 
    };
  }
}

async function pollOtpFromChaycodes3(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://chaycodeso3.com/api?act=code&apik=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(requestId)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[CHAYCODES3 OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      // CRITICAL: Validate response structure first
      const typedData = data as any;
      if (typeof typedData !== 'object' || typedData === null || typeof typedData.ResponseCode !== 'number') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      // Map ResponseCode: 0=completed, 1=waiting, 2=expired
      if (typedData.ResponseCode === 0) {
        // ResponseCode 0 = Hoàn thành - return success regardless of Result presence
        return {
          success: true,
          state: 'completed',
          otpCode: (typedData.Result && typedData.Result.Code) || null,
          smsContent: (typedData.Result && typedData.Result.SMS) || null,
          providerStatus: typedData.ResponseCode,
          // V3-specific enhanced response data
          v3Response: typedData,
          isCall: (typedData.Result && typedData.Result.IsCall) || false,
          callFileUrl: (typedData.Result && typedData.Result.CallFile) || null
        };
      } else if (typedData.ResponseCode === 1) {
        // ResponseCode 1 = Đợi tin nhắn
        return {
          success: false,
          state: 'waiting',
          error: "Chưa có OTP, vui lòng thử lại sau",
          providerStatus: typedData.ResponseCode
        };
      } else if (typedData.ResponseCode === 2) {
        // ResponseCode 2 = Hết hạn - terminal state, stop retries
        return {
          success: false,
          state: 'expired',
          expired: true,
          error: "Phiên thuê đã hết hạn",
          providerStatus: typedData.ResponseCode
        };
      } else {
        // Unknown ResponseCode or error - treat as terminal to prevent infinite retries
        return {
          success: false,
          state: 'error',
          error: `Lỗi API: ${typedData.Msg || 'Unknown error'} (Code: ${typedData.ResponseCode})`,
          providerStatus: typedData.ResponseCode
        };
      }
    } else {
      const errorText = await response.text();
      console.error(`[CHAYCODES3 OTP] HTTP Error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        state: 'error',
        error: `HTTP Error: ${response.status}` 
      };
    }
  } catch (error: any) {
    console.error('[CHAYCODES3 OTP] Request failed:', error);
    return { 
      success: false, 
      state: 'error',
      error: error?.message || 'Unknown error' 
    };
  }
}

async function pollOtpFrom365otp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://365otp.com/apiv1/ordercheck?apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(requestId)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[365OTP OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      // CRITICAL: Check response structure first
      const typedData = data as any;
      if (typeof typedData !== 'object' || typedData === null || typeof typedData.status !== 'number' || !typedData.data || typeof typedData.data !== 'object') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      // Check main status first
      if (typedData.status !== 1) {
        return {
          success: false,
          state: 'error',
          error: `API Error: ${typedData.message || 'Unknown error'} (status: ${typedData.status})`
        };
      }
      
      // CRITICAL: ALWAYS prioritize statusOrder over code presence
      const statusOrder = typedData.data.statusOrder;
      
      if (statusOrder === 1) {
        // statusOrder 1 = Hoàn thành - return success regardless of code presence
        return {
          success: true,
          state: 'completed',
          otpCode: typedData.data.code || null,
          smsContent: typedData.data.message || null,
          providerStatus: statusOrder
        };
      } else if (statusOrder === 0) {
        // statusOrder 0 = Đợi tin nhắn - ALWAYS waiting regardless of code
        return {
          success: false,
          state: 'waiting', 
          error: "Chưa có OTP, vui lòng thử lại sau",
          providerStatus: statusOrder
        };
      } else if (statusOrder === -1) {
        // statusOrder -1 = Hết hạn - terminal state, stop retries
        return {
          success: false,
          state: 'expired',
          expired: true,
          error: "Phiên thuê đã hết hạn",
          providerStatus: statusOrder
        };
      } else {
        // Unknown statusOrder - treat as error
        return {
          success: false,
          state: 'error',
          error: `Unknown statusOrder: ${statusOrder}`,
          providerStatus: statusOrder
        };
      }
    } else {
      const errorText = await response.text();
      console.error(`[365OTP OTP] HTTP Error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        state: 'error',
        error: `HTTP Error: ${response.status}` 
      };
    }
  } catch (error: any) {
    console.error('[365OTP OTP] Request failed:', error);
    return { 
      success: false, 
      state: 'error',
      error: error?.message || 'Unknown error' 
    };
  }
}

async function pollOtpFromFunOtp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://funotp.com/api?action=code&id=${encodeURIComponent(requestId)}&apikey=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[FUNOTP OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      // CRITICAL: Check response structure first
      const typedData = data as any;
      if (typeof typedData !== 'object' || typedData === null || typeof typedData.ResponseCode !== 'number') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (typedData.ResponseCode === 0 && typedData.Result) {
        // ResponseCode 0 = Complete - OTP received
        return {
          success: true,
          state: 'completed',
          otpCode: typedData.Result.otp || null,
          smsContent: typedData.Result.SMS || null,
          providerStatus: typedData.ResponseCode
        };
      } else if (typedData.ResponseCode === 1) {
        // ResponseCode 1 = Waiting for message
        return {
          success: false,
          state: 'waiting',
          error: "Chưa có OTP, vui lòng thử lại sau",
          providerStatus: typedData.ResponseCode
        };
      } else if (typedData.ResponseCode === 2) {
        // ResponseCode 2 = Expired
        return {
          success: false,
          state: 'expired',
          expired: true,
          error: "Phiên thuê đã hết hạn",
          providerStatus: typedData.ResponseCode
        };
      } else {
        // Unknown ResponseCode
        return {
          success: false,
          state: 'error',
          error: `Unknown ResponseCode: ${typedData.ResponseCode}`,
          providerStatus: typedData.ResponseCode
        };
      }
    } else {
      const errorText = await response.text();
      console.error(`[FUNOTP OTP] HTTP Error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        state: 'error',
        error: `HTTP Error: ${response.status}` 
      };
    }
  } catch (error: any) {
    console.error('[FUNOTP OTP] Request failed:', error);
    return { 
      success: false, 
      state: 'error',
      error: error?.message || 'Unknown error' 
    };
  }
}

async function pollOtpFromIronSim(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://ironsim.com/api/session/${encodeURIComponent(requestId)}/get-otp?token=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[IRONSIM OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      // CRITICAL: Check response structure first
      const typedData = data as any;
      if (typeof typedData !== 'object' || typedData === null || typeof typedData.status_code !== 'number' || typeof typedData.success !== 'boolean') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      // Check main status first
      if (typedData.status_code !== 200 || !typedData.success) {
        return {
          success: false,
          state: 'error',
          error: `API Error: ${typedData.message || 'Unknown error'} (status_code: ${typedData.status_code})`
        };
      }
      
      // Check if we have data and messages
      if (typedData.data && typedData.data.messages && Array.isArray(typedData.data.messages) && typedData.data.messages.length > 0) {
        // Found messages - extract OTP from first message
        const firstMessage = typedData.data.messages[0];
        return {
          success: true,
          state: 'completed',
          otpCode: firstMessage.otp || null,
          smsContent: firstMessage.sms_content || null,
          providerStatus: typedData.data.status
        };
      } else {
        // No messages yet - still waiting
        return {
          success: false,
          state: 'waiting',
          error: "Chưa có OTP, vui lòng thử lại sau",
          providerStatus: typedData.data?.status || 0
        };
      }
    } else {
      const errorText = await response.text();
      console.error(`[IRONSIM OTP] HTTP Error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        state: 'error',
        error: `HTTP Error: ${response.status}` 
      };
    }
  } catch (error: any) {
    console.error('[IRONSIM OTP] Request failed:', error);
    return { 
      success: false, 
      state: 'error',
      error: error?.message || 'Unknown error' 
    };
  }
}

async function pollOtpFromBossOtp(apiKey: string, requestId: string) {
  try {
    const response = await fetch(`https://bossotp.net/api/v4/rents/check?_id=${encodeURIComponent(requestId)}&api_token=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
      timeout: 15000
    } as any);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`[BOSSOTP OTP] Response for requestId ${requestId}:`, JSON.stringify(data));
      
      // CRITICAL: Check response structure first
      const typedData = data as any;
      if (typeof typedData !== 'object' || typedData === null || typeof typedData.status !== 'string') {
        return {
          success: false,
          state: 'error',
          error: `Malformed response structure`
        };
      }
      
      if (typedData.status === 'SUCCESS') {
        // SUCCESS = Complete - OTP received
        return {
          success: true,
          state: 'completed',
          otpCode: typedData.otp || null,
          smsContent: typedData.sms_content || null,
          providerStatus: typedData.status
        };
      } else if (typedData.status === 'PENDING') {
        // PENDING = Waiting for message
        return {
          success: false,
          state: 'waiting',
          error: "Chưa có OTP, vui lòng thử lại sau",
          providerStatus: typedData.status
        };
      } else if (typedData.status === 'FAILED') {
        // FAILED = Expired
        return {
          success: false,
          state: 'expired',
          expired: true,
          error: "Phiên thuê đã hết hạn",
          providerStatus: typedData.status
        };
      } else {
        // Unknown status
        return {
          success: false,
          state: 'error',
          error: `Unknown status: ${typedData.status}`,
          providerStatus: typedData.status
        };
      }
    } else {
      const errorText = await response.text();
      console.error(`[BOSSOTP OTP] HTTP Error: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        state: 'error',
        error: `HTTP Error: ${response.status}` 
      };
    }
  } catch (error: any) {
    console.error('[BOSSOTP OTP] Request failed:', error);
    return { 
      success: false, 
      state: 'error',
      error: error?.message || 'Unknown error' 
    };
  }
}

// Removed old checkShopeeRegistration function - now using storage.checkPhoneShopeeRegistration

function formatPhoneNumber(phoneNumber: string) {
  // Remove any non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Add +84 prefix if it's a Vietnamese number starting with 0
  if (digits.startsWith('0') && digits.length === 10) {
    return `+84${digits.substring(1)}`;
  }
  
  // If already has country code
  if (digits.startsWith('84') && digits.length === 11) {
    return `+${digits}`;
  }
  
  // Return as is for other formats
  return phoneNumber;
}


// Email validation function
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Function to add email to Shopee account
async function addMailingAddress(spcSt: string, email: string, proxyDict?: any) {
  if (!isValidEmail(email)) {
    return {
      status: false,
      message: "Email không hợp lệ",
    };
  }
  
  if (!spcSt) {
    return {
      status: false,
      message: "SPC_ST không hợp lệ",
    };
  }

  const url = "https://banhang.shopee.vn/?is_from_login=true";
  const result = {
    status: false,
    message: "",
  };

  let agent = null;
  if (proxyDict) {
    const { ip, port, type, auth } = proxyDict;
    const proxyUrl = auth 
      ? `${type}://${auth.username}:${auth.password}@${ip}:${port}`
      : `${type}://${ip}:${port}`;
    
    if (type.includes('socks')) {
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      agent = new HttpsProxyAgent(proxyUrl);
    }
  }

  // Headers for initial request
  const headers = {
    "Host": "banhang.shopee.vn",
    "Cookie": spcSt,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "Referer": "https://banhang.shopee.vn/portal-cache-sw.js?sw_config=%7B%22offResourcesCache%22%3A1%7D",
    "Accept-Encoding": "gzip, deflate, br",
    "If-None-Match": "W/\"c0d0b3a608fe59e42611adb83c573d98\"",
    "Priority": "u=0, i"
  };

  try {
    let spcScSessionValue = null;
    
    // First request to get SPC_SC_SESSION
    const response1 = await fetch(url, {
      method: 'GET',
      headers,
      agent,
      timeout: 30000
    } as any);

    if (response1.status === 200) {
      const setCookieHeader = response1.headers.get('set-cookie');
      if (setCookieHeader) {
        const cookies = setCookieHeader.split(',');
        for (const cookie of cookies) {
          if (cookie.includes('SPC_SC_SESSION=')) {
            const match = cookie.match(/SPC_SC_SESSION=([^;]+)/);
            if (match) {
              spcScSessionValue = match[1];
              break;
            }
          }
        }
      }
    }

    if (!spcScSessionValue) {
      result.message = "Không lấy được SPC_SC_SESSION từ cookie";
      return result;
    }

    // Update headers with SPC_SC_SESSION
    headers["Cookie"] = spcSt + "; SPC_SC_SESSION=" + spcScSessionValue;

    // Second request to add email
    const apiUrl = "https://banhang.shopee.vn/api/onboarding/local_onboard/v1/vn_onboard/save/?SPC_CDS=6e943fae-a70c-4fea-b48d-da6c8baefb45&SPC_CDS_VER=2";
    const payload = {
      "check": false,
      "lang": "vi",
      "step": {
        "step_id": 291100,
        "form": {
          "form_version": 1,
          "save_version": 0,
          "form_id": 291100,
          "components": [
            {
              "component_id_str": "form_0_component_291101_c",
              "component_value": ""
            },
            {
              "component_id_str": "form_0_component_291102_c",
              "component_value": null
            },
            {
              "component_id_str": "form_0_component_291103_c",
              "component_value": email,
            },
            {
              "component_id_str": "form_0_component_291104_c",
              "component_value": ""
            }
          ]
        }
      }
    };

    const response2 = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      agent,
      timeout: 30000
    } as any);

    if (response2.status === 200) {
      const data = await response2.text();
      if (data.toLowerCase().includes("ok")) {
        result.status = true;
        result.message = "Thêm mail thành công";
      } else {
        result.status = false;
        result.message = "Thêm mail không thành công";
      }
    } else {
      result.status = false;
      result.message = `Error: ${response2.status}`;
    }

  } catch (error) {
    console.log(`Error during email addition request: ${error}`);
    result.message = "Lỗi kết nối";
  }

  return result;
}

// Middleware to verify JWT token (JWT only, used for specific endpoints)
const authenticateTokenOnly = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token không được cung cấp' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Người dùng không tồn tại' });
    }

    // Check if account is still active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ admin để được hỗ trợ.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token không hợp lệ' });
  }
}

// Middleware to verify JWT token (for backward compatibility)
const authenticateToken = authenticateTokenOnly;;

// Alias for consistency with existing routes
const requireAuth = authenticateToken;

// Audit logging middleware - only for admin actions
const auditLog = (action: string, description: string) => {
  return async (req: any, res: any, next: any) => {
    // Only log if user is admin or superadmin
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
      await storage.logUserAction(
        req.user.id,
        action,
        description,
        req.ip || req.connection.remoteAddress || 'unknown'
      );
    }
    next();
  };
};

// Middleware to check admin role (admin + superadmin)
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({ message: 'Yêu cầu quyền quản trị viên' });
  }
  next();
};

// Middleware to check superadmin role only
const requireSuperadmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Yêu cầu quyền super admin' });
  }
  next();
};

// Check if admin can modify target user
const canModifyUser = async (adminRole: string, targetUserId: number): Promise<boolean> => {
  const targetUser = await storage.getUser(targetUserId);
  if (!targetUser) return false;
  
  // Superadmin can modify anyone
  if (adminRole === 'superadmin') return true;
  
  // Admin can only modify users with 'user' role
  if (adminRole === 'admin') {
    return targetUser.role === 'user';
  }
  
  return false;
};

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ============================================================================
  // APPLY GLOBAL MIDDLEWARES - Tối ưu cho máy 2 cores, 4GB RAM
  // ============================================================================
  
  // 1. Concurrent request limiter - Giới hạn 50 requests đồng thời
  app.use('/api', concurrentRequestLimiter);
  
  // 2. Global rate limiter - Giới hạn 20 requests/phút/user
  app.use('/api', globalRateLimiter);
  
  // Global rate limiter for HEAD /api health checks - chỉ cho phép 5 phút 1 lần toàn bộ hệ thống
  let lastSuccessfulHealthCheck = 0;
  const clientRequestTimes = new Map<string, number>(); // Cleanup memory periodically
  const HEALTH_CHECK_INTERVAL = 300000; // 5 phút
  
  // Cleanup old entries mỗi giờ
  setInterval(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [clientId, timestamp] of Array.from(clientRequestTimes.entries())) {
      if (timestamp < oneDayAgo) {
        clientRequestTimes.delete(clientId);
      }
    }
  }, 60 * 60 * 1000); // Chạy mỗi giờ
  
  // Lightweight health check endpoint cho monitoring systems
  app.head("/healthz", (req, res) => {
    res.set('Cache-Control', 'public, max-age=60'); // Cache 1 phút
    res.status(200).end();
  });
  
  app.head("/api", (req, res) => {
    const clientId = getClientIP(req); // Sử dụng hàm getClientIP có sẵn
    const now = Date.now();
    const currentETag = `"health-${Math.floor(now / HEALTH_CHECK_INTERVAL)}"`;
    const lastModified = new Date(Math.floor(now / HEALTH_CHECK_INTERVAL) * HEALTH_CHECK_INTERVAL);
    
    // Log chi tiết để xác định nguồn gốc requests
    const userAgent = req.get('User-Agent') || 'unknown';
    const xForwardedFor = req.get('X-Forwarded-For') || 'none';
    const sentryTrace = req.get('sentry-trace') || 'none';  
    const traceParent = req.get('traceparent') || 'none';
    const referer = req.get('Referer') || 'none';
    
    console.log(`[HEAD /api] IP: ${clientId}, UA: ${userAgent}, XFF: ${xForwardedFor}, Sentry: ${sentryTrace}, TraceParent: ${traceParent}, Referer: ${referer}`);
    
    // Kiểm tra If-None-Match cho 304 response
    const ifNoneMatch = req.get('If-None-Match');
    const ifModifiedSince = req.get('If-Modified-Since');
    
    if (ifNoneMatch === currentETag || (ifModifiedSince && new Date(ifModifiedSince) >= lastModified)) {
      res.set('Cache-Control', 'public, max-age=300, must-revalidate');
      res.set('ETag', currentETag);
      res.set('Last-Modified', lastModified.toUTCString());
      return res.status(304).end();
    }
    
    // Global rate limiting - chỉ 1 success mỗi 5 phút cho toàn bộ hệ thống
    if (now - lastSuccessfulHealthCheck < HEALTH_CHECK_INTERVAL) {
      const remainingTime = Math.ceil((HEALTH_CHECK_INTERVAL - (now - lastSuccessfulHealthCheck)) / 1000);
      res.set('Retry-After', remainingTime.toString());
      res.set('Cache-Control', 'public, max-age=300');
      res.set('ETag', currentETag);
      return res.status(429).end();
    }
    
    // Update thời gian thành công và client tracking
    lastSuccessfulHealthCheck = now;
    clientRequestTimes.set(clientId, now);
    
    // Return successful response with cache headers
    res.set('Cache-Control', 'public, max-age=300, must-revalidate');
    res.set('Last-Modified', lastModified.toUTCString());
    res.set('ETag', currentETag);
    res.status(200).end();
  });
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const registerData = registerSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingUsername = await storage.getUserByUsername(registerData.username);
      if (existingUsername) {
        return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
      }

      const existingEmail = await storage.getUserByEmail(registerData.email);
      if (existingEmail) {
        return res.status(400).json({ message: 'Email đã được sử dụng' });
      }

      // Create new user
      const user = await storage.createUser({
        username: registerData.username,
        email: registerData.email,
        password: registerData.password,
        fullName: registerData.fullName,
        phone: registerData.phone || null,
        role: "user"
      });

      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

      // Log registration
      await storage.createAuditLog({
        userId: user.id,
        action: 'REGISTER',
        description: `Đăng ký tài khoản mới`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      await storage.createActivity({
        description: `${user.fullName} đã đăng ký tài khoản mới`,
        type: 'success'
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role
        }
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(400).json({ message: error.message || 'Dữ liệu không hợp lệ' });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log('🔐 Login request received:', { body: req.body });
      
      const { username, password } = loginSchema.parse(req.body);
      console.log('✅ Schema validation passed');
      
      const user = await storage.getUserByUsername(username);
      console.log('🔍 User lookup result:', user ? `Found user: ${user.username}` : 'No user found');
      
      if (!user) {
        return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      console.log('🔑 Password validation:', isValidPassword ? 'Valid' : 'Invalid');
      
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
      }

      // Check if account is active BEFORE creating token
      if (!user.isActive) {
        return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ admin để được hỗ trợ.' });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

      // Only log login for admin users
      if (user.role === 'admin' || user.role === 'superadmin') {
        await storage.logUserAction(
          user.id,
          'login',
          `Đăng nhập thành công`,
          req.ip || req.connection.remoteAddress || 'unknown'
        );
      }

      await storage.createActivity({
        description: `${user.fullName} đã đăng nhập vào hệ thống`,
        type: 'info'
      });

      console.log('✅ Login successful for user:', username);
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role
        }
      });
    } catch (error) {
      console.error('❌ Login error:', error);
      res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }
  });

  app.get("/api/auth/me", authenticateToken, (req: any, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      fullName: req.user.fullName,
      role: req.user.role
    });
  });

  app.post("/api/auth/logout", authenticateToken, async (req: any, res) => {
    try {
      // Only log logout for admin users
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        await storage.logUserAction(
          req.user.id,
          'logout',
          `Đăng xuất khỏi hệ thống`,
          req.ip || req.connection.remoteAddress || 'unknown'
        );
      }

      res.json({ message: 'Đăng xuất thành công' });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi đăng xuất' });
    }
  });

  // Admin force logout all users (JWT secret change automatically invalidates all tokens)
  app.post("/api/admin/force-logout-all", authenticateToken, async (req: any, res) => {
    try {
      // Only superadmin can force logout all users
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Chỉ superadmin mới có quyền thực hiện hành động này' });
      }

      // Log the force logout action
      await storage.logUserAction(
        req.user.id,
        'force_logout_all',
        `Force logout tất cả người dùng (thay đổi JWT secret)`,
        req.ip || req.connection.remoteAddress || 'unknown'
      );

      await storage.createActivity({
        description: `${req.user.fullName} đã force logout tất cả người dùng (JWT secret thay đổi)`,
        type: 'warning'
      });

      res.json({ 
        message: 'Đã force logout tất cả người dùng thành công. Tất cả token hiện tại đã bị vô hiệu hóa.',
        note: 'Người dùng cần đăng nhập lại để tiếp tục sử dụng hệ thống.' 
      });
    } catch (error) {
      console.error('Error in force logout all:', error);
      res.status(500).json({ message: 'Lỗi khi force logout tất cả người dùng' });
    }
  });

  // User balance
  app.get("/api/user/balance", authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const balance = await storage.getUserBalance(req.user.id);
      res.json(balance);
    } catch (error) {
      console.error("Error fetching user balance:", error);
      res.status(500).json({ message: "Lỗi khi lấy số dư tài khoản" });
    }
  });

  // Change password endpoint
  app.put("/api/user/password", authenticateToken, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc' });
      }

      // Get current user to verify current password
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update password in database
      await storage.updateUserPassword(req.user.id, hashedNewPassword);

      // Log password change for admin/superadmin users
      if (user.role === 'admin' || user.role === 'superadmin') {
        await storage.logUserAction(
          req.user.id,
          'password_change',
          'Thay đổi mật khẩu thành công',
          req.ip || 'unknown'
        );
      }

      res.json({ message: 'Mật khẩu đã được thay đổi thành công' });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Lỗi khi thay đổi mật khẩu" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
    res.json({
      totalBalance: "1,250",
      activeRentals: 12,
      pendingOrders: 3,
      successRate: 98
    });
  });

  // Projects routes
  app.get("/api/projects", authenticateToken, async (req, res) => {
    const projects = await storage.getAllProjects();
    res.json(projects);
  });

  app.post("/api/projects", authenticateToken, auditLog('PROJECT_CREATE', 'Tạo dự án mới'), async (req: any, res) => {
    try {
      const projectData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(projectData);
      
      await storage.createActivity({
        description: `Dự án "${project.name}" đã được tạo bởi ${req.user.fullName}`,
        type: 'success'
      });

      res.json(project);
    } catch (error) {
      res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }
  });

  app.put("/api/projects/:id", authenticateToken, auditLog('PROJECT_UPDATE', 'Cập nhật dự án'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const project = await storage.updateProject(id, updates);
      
      if (!project) {
        return res.status(404).json({ message: 'Không tìm thấy dự án' });
      }

      await storage.createActivity({
        description: `Dự án "${project.name}" đã được cập nhật bởi ${req.user.fullName}`,
        type: 'info'
      });

      res.json(project);
    } catch (error) {
      res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }
  });

  // Resources routes
  app.get("/api/resources", authenticateToken, async (req, res) => {
    const resources = await storage.getAllResources();
    res.json(resources);
  });

  app.get("/api/resources/project/:projectId", authenticateToken, async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const resources = await storage.getResourcesByProject(projectId);
    res.json(resources);
  });

  // Activities routes
  app.get("/api/activities", authenticateToken, async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const activities = await storage.getRecentActivities(limit);
    res.json(activities);
  });



  // Shopee Services API Routes
  
  // Phone rental routes
  app.get("/api/phone-rentals", authenticateToken, async (req: any, res) => {
    const rentals = await storage.getPhoneRentalsByUser(req.user.id);
    res.json(rentals);
  });

  app.post("/api/phone-rentals", authenticateToken, strictRateLimiter, phoneRentalRequestLimiter, async (req: any, res) => {
    try {
      const rental = await storage.createPhoneRental({
        ...req.body,
        userId: req.user.id
      });
      
      await storage.createActivity({
        description: `${req.user.fullName} đã thuê số điện thoại ${rental.phoneNumber}`,
        type: 'success'
      });

      res.json(rental);
    } catch (error) {
      res.status(400).json({ message: 'Không thể tạo yêu cầu thuê số' });
    }
  });

  // Phone check routes
  app.get("/api/phone-checks", authenticateToken, async (req: any, res) => {
    const checks = await storage.getPhoneChecksByUser(req.user.id);
    res.json(checks);
  });

  // Bulk phone check endpoint
  const bulkPhoneCheckSchema = z.object({
    phoneNumbers: z.array(z.string())
      .min(1, "Ít nhất phải có 1 số điện thoại")
      .max(50, "Tối đa 50 số điện thoại mỗi lần kiểm tra")
  });

  app.post("/api/phone-checks/bulk", authenticateTokenOrApiKey, checkApiKeyPermission('phone_check'), async (req: any, res) => {
    try {
      console.log("Bulk phone check request received:", req.body);
      
      const result = bulkPhoneCheckSchema.safeParse(req.body);
      if (!result.success) {
        console.log("Validation failed:", result.error.issues);
        return res.status(400).json({ 
          message: "Dữ liệu không hợp lệ", 
          errors: result.error.issues 
        });
      }

      const { phoneNumbers } = result.data;
      const userIP = getUserIP(req);
      
      console.log("Processing phone numbers:", phoneNumbers);
      const results = await storage.checkPhoneNumbers(phoneNumbers, req.user.id, userIP);
      console.log("Phone check results:", results);

      const response = {
        success: true,
        results,
        totalChecked: results.length,
        totalCost: results.reduce((sum, r) => sum + r.cost, 0)
      };
      
      console.log("Sending response:", response);
      res.json(response);
    } catch (error: any) {
      console.error("Error bulk checking phones:", error);
      console.error("Error stack:", error?.stack);
      res.status(500).json({ message: "Lỗi hệ thống", error: error?.message || "Unknown error" });
    }
  });

  app.post("/api/phone-checks", authenticateToken, async (req: any, res) => {
    try {
      const check = await storage.createPhoneCheck({
        ...req.body,
        userId: req.user.id
      });
      
      await storage.createActivity({
        description: `${req.user.fullName} đã kiểm tra số điện thoại ${check.phoneNumber}`,
        type: 'info'
      });

      res.json(check);
    } catch (error) {
      res.status(400).json({ message: 'Không thể kiểm tra số điện thoại' });
    }
  });

  // Shopee cookies routes
  app.get("/api/shopee-cookies", authenticateToken, async (req: any, res) => {
    try {
      const cookies = await storage.getShopeeCookiesByUser(req.user.id);
      const cookiesWithoutValue = cookies.map(cookie => ({
        id: cookie.id,
        userId: cookie.userId,
        cookieType: cookie.cookieType,
        cookiePreview: cookie.cookieValue.substring(0, 50),
        shopeeRegion: cookie.shopeeRegion,
        createdAt: cookie.createdAt
      }));
      res.json(cookiesWithoutValue);
    } catch (error) {
      console.error('Error fetching cookies:', error);
      res.status(500).json({ message: 'Không thể tải danh sách cookie' });
    }
  });

  // Get single cookie by ID
  app.get("/api/shopee-cookies/:id", authenticateToken, async (req: any, res) => {
    try {
      const cookies = await storage.getShopeeCookiesByUser(req.user.id);
      const cookie = cookies.find(c => c.id === req.params.id);
      
      if (!cookie) {
        return res.status(404).json({ message: 'Cookie không tồn tại' });
      }
      
      res.json(cookie);
    } catch (error) {
      console.error('Error fetching cookie:', error);
      res.status(500).json({ message: 'Không thể tải cookie' });
    }
  });

  app.post("/api/shopee-cookies", authenticateToken, async (req: any, res) => {
    try {
      const cookie = await storage.createShopeeCookie({
        ...req.body,
        userId: req.user.id
      });
      
      await storage.createActivity({
        description: `${req.user.fullName} đã lưu cookie Shopee`,
        type: 'success'
      });

      res.json(cookie);
    } catch (error) {
      res.status(400).json({ message: 'Không thể lưu cookie Shopee' });
    }
  });

  app.delete("/api/shopee-cookies/:id", authenticateToken, async (req: any, res) => {
    try {
      const id = req.params.id;
      const deleted = await storage.deleteShopeeCookie(id, req.user.id);
      
      if (!deleted) {
        return res.status(404).json({ message: 'Cookie không tồn tại hoặc bạn không có quyền xóa' });
      }
      
      await storage.createActivity({
        description: `${req.user.fullName} đã xóa cookie Shopee #${id}`,
        type: 'warning'
      });

      res.json({ message: 'Đã xóa cookie thành công' });
    } catch (error) {
      res.status(400).json({ message: 'Không thể xóa cookie' });
    }
  });

  // Tracking check routes
  app.get("/api/tracking-checks", authenticateToken, async (req: any, res) => {
    const checks = await storage.getTrackingChecksByUser(req.user.id);
    res.json(checks);
  });

  // Express tracking check routes
  app.get("/api/express-tracking-checks", authenticateToken, async (req: any, res) => {
    const checks = await storage.getExpressTrackingChecksByUser(req.user.id);
    res.json(checks);
  });

  app.post("/api/express-tracking-checks", authenticateToken, async (req: any, res) => {
    try {
      // Validate request body using Zod schema
      const validation = insertExpressTrackingCheckSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Dữ liệu không hợp lệ', 
          errors: validation.error.issues 
        });
      }

      // Get user and check balance
      const user = await storage.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Người dùng không tồn tại' });
      }

      // Get service pricing
      const serviceCost = await storage.requireServicePrice('express_tracking_check');

      // Check sufficient balance
      const currentBalance = parseFloat(user.balance);
      if (currentBalance < serviceCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${serviceCost.toLocaleString('vi-VN')} VND để sử dụng dịch vụ kiểm tra mã vận đơn hỏa tốc` 
        });
      }

      // Create the actual service record first (before deducting balance)
      const expressCheck = await storage.createExpressTrackingCheck({
        ...validation.data,
        userId: req.user.id
      });

      // Only proceed with financial transactions if service record creation succeeds
      try {
        // Deduct balance
        const newBalance = currentBalance - serviceCost;
        await storage.updateUserBalance(req.user.id, newBalance);

        // Create transaction record
        await storage.createTransaction({
          userId: req.user.id,
          type: 'service_usage',
          amount: (-serviceCost).toString(),
          description: `Kiểm tra mã vận đơn hỏa tốc: ${validation.data.trackingNumber}`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: newBalance.toString(),
          metadata: JSON.stringify({
            service: 'express_tracking_check',
            trackingNumber: validation.data.trackingNumber,
            serviceCost: serviceCost,
            expressCheckId: expressCheck.id
          })
        });

        // Create service usage history entry
        await storage.createServiceUsage({
          userId: req.user.id,
          serviceName: 'express_tracking_check',
          serviceType: 'Express Tracking Check',
          cost: serviceCost.toString(),
          status: 'success',
          description: `Kiểm tra mã vận đơn hỏa tốc: ${validation.data.trackingNumber}`,
          metadata: JSON.stringify({
            trackingNumber: validation.data.trackingNumber,
            serviceCost: serviceCost,
            expressCheckId: expressCheck.id
          })
        });
      } catch (financialError) {
        console.error('Financial transaction failed for express tracking check:', financialError);
        // Attempt to rollback service record creation
        try {
          await storage.deleteExpressTrackingCheck(expressCheck.id);
          console.log(`Rolled back express tracking check record ${expressCheck.id}`);
        } catch (rollbackError) {
          console.error('Rollback failed for express tracking check:', rollbackError);
        }
        throw new Error('Financial transaction failed. Service record has been rolled back.');
      }
      
      await storage.createActivity({
        description: `${req.user.fullName} đã kiểm tra mã vận đơn hỏa tốc: ${expressCheck.trackingNumber} (Trừ ${serviceCost.toLocaleString('vi-VN')} VND)`,
        type: 'success'
      });

      res.json({
        ...expressCheck,
        serviceCost,
        balanceAfter: currentBalance - serviceCost,
        message: `Kiểm tra thành công. Đã trừ ${serviceCost.toLocaleString('vi-VN')} VND từ tài khoản.`
      });
    } catch (error) {
      console.error('Express tracking check error:', error);
      res.status(400).json({ message: 'Không thể tạo kiểm tra mã vận đơn hỏa tốc' });
    }
  });

  // Freeship voucher routes
  app.get("/api/freeship-vouchers", authenticateToken, async (req: any, res) => {
    const vouchers = await storage.getFreeshipVouchersByUser(req.user.id);
    res.json(vouchers);
  });

  app.get("/api/freeship-vouchers/active", authenticateToken, async (req: any, res) => {
    const vouchers = await storage.getActiveFreeshipVouchers(req.user.id);
    res.json(vouchers);
  });

  app.post("/api/freeship-vouchers", authenticateToken, async (req: any, res) => {
    try {
      // Validate request body using Zod schema
      const validation = insertFreeshipVoucherSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Dữ liệu không hợp lệ', 
          errors: validation.error.issues 
        });
      }

      const voucher = await storage.createFreeshipVoucher({
        ...validation.data,
        userId: req.user.id
      });
      
      await storage.createActivity({
        description: `${req.user.fullName} đã lưu voucher freeship: ${voucher.voucherCode}`,
        type: 'success'
      });

      res.json(voucher);
    } catch (error) {
      res.status(400).json({ message: 'Không thể lưu voucher freeship' });
    }
  });

  app.put("/api/freeship-vouchers/:id", authenticateToken, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate request body using Zod schema
      const validation = insertFreeshipVoucherSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Dữ liệu không hợp lệ', 
          errors: validation.error.issues 
        });
      }
      
      // Check ownership first - verify voucher belongs to the user
      const existingVoucher = await storage.getFreeshipVoucherByIdAndUser(id, req.user.id);
      if (!existingVoucher) {
        return res.status(404).json({ message: 'Không tìm thấy voucher' });
      }
      
      // Update voucher with ownership already verified
      const voucher = await storage.updateFreeshipVoucher(id, validation.data);
      
      if (!voucher) {
        return res.status(404).json({ message: 'Không tìm thấy voucher' });
      }

      // Log activity
      await storage.createActivity({
        description: `${req.user.fullName} đã cập nhật voucher freeship: ${voucher.voucherCode}`,
        type: 'info'
      });

      res.json(voucher);
    } catch (error) {
      res.status(400).json({ message: 'Không thể cập nhật voucher' });
    }
  });

  app.delete("/api/freeship-vouchers/:id", authenticateToken, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check ownership first - verify voucher belongs to the user
      const existingVoucher = await storage.getFreeshipVoucherByIdAndUser(id, req.user.id);
      if (!existingVoucher) {
        return res.status(404).json({ message: 'Không tìm thấy voucher' });
      }
      
      // Delete voucher with ownership already verified
      const success = await storage.deleteFreeshipVoucher(id);
      
      if (!success) {
        return res.status(404).json({ message: 'Không tìm thấy voucher' });
      }

      // Log activity
      await storage.createActivity({
        description: `${req.user.fullName} đã xóa voucher freeship: ${existingVoucher.voucherCode}`,
        type: 'warning'
      });

      res.json({ message: 'Đã xóa voucher thành công' });
    } catch (error) {
      res.status(400).json({ message: 'Không thể xóa voucher' });
    }
  });

  // Freeship voucher usage tracking routes
  app.get("/api/freeship-voucher-usage", authenticateToken, async (req: any, res) => {
    const usage = await storage.getFreeshipVoucherUsageByUser(req.user.id);
    res.json(usage);
  });

  app.post("/api/freeship-voucher-usage", authenticateToken, async (req: any, res) => {
    try {
      // Validate request body using Zod schema
      const validation = insertFreeshipVoucherUsageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Dữ liệu không hợp lệ', 
          errors: validation.error.issues 
        });
      }

      // Get service pricing
      const serviceCost = await storage.requireServicePrice('freeship_voucher_usage');

      // Get voucher information to access voucherCode
      const voucher = await storage.getFreeshipVoucherById(validation.data.voucherId);
      if (!voucher) {
        return res.status(404).json({ message: 'Không tìm thấy voucher' });
      }

      // 🔒 Generate idempotency key for this request
      const idempotencyKey = `${req.user.id}-${validation.data.voucherId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // 🔒 Use ATOMIC transaction method for financial safety
      const result = await storage.atomicFreeshipVoucherUsage({
        userId: req.user.id,
        voucherId: validation.data.voucherId,
        orderId: validation.data.orderId ?? undefined,
        orderValue: validation.data.orderValue ?? undefined,
        discountApplied: validation.data.discountApplied ?? undefined,
        serviceCost,
        idempotencyKey,
        voucherCode: voucher.voucherCode,
        userFullName: req.user.fullName
      });

      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      // Log successful voucher usage activity
      await storage.createActivity({
        description: `${req.user.fullName} đã sử dụng voucher freeship: ${voucher.voucherCode} (Trừ ${serviceCost.toLocaleString('vi-VN')} VND)`,
        type: 'success'
      });

      res.json({
        ...result.usage,
        serviceCost,
        balanceAfter: result.balanceAfter,
        message: result.message
      });
    } catch (error) {
      console.error('Freeship voucher usage error:', error);
      res.status(400).json({ message: 'Không thể ghi nhận việc sử dụng voucher' });
    }
  });

  app.post("/api/tracking-checks", authenticateToken, async (req: any, res) => {
    try {
      const check = await storage.createTrackingCheck({
        ...req.body,
        userId: req.user.id
      });
      
      await storage.createActivity({
        description: `${req.user.fullName} đã kiểm tra đơn hàng`,
        type: 'info'
      });

      res.json(check);
    } catch (error) {
      res.status(400).json({ message: 'Không thể kiểm tra mã vận đơn' });
    }
  });

  // Cookie rapid check routes
  app.get("/api/cookie-rapid-checks", authenticateToken, async (req: any, res) => {
    const checks = await storage.getCookieRapidChecksByUser(req.user.id);
    res.json(checks);
  });

  app.post("/api/cookie-rapid-checks", authenticateToken, async (req: any, res) => {
    console.log(`[COOKIE RAPID] Starting rapid check for user ${req.user.id}`);
    
    try {
      const { cookieId, cookie: cookieString } = req.body;
      
      // Require exactly one: cookieId OR cookie string
      if (!cookieId && !cookieString) {
        return res.status(400).json({ message: 'Either cookieId or cookie string is required' });
      }
      if (cookieId && cookieString) {
        return res.status(400).json({ message: 'Provide either cookieId or cookie string, not both' });
      }

      let cookieValue: string;
      let actualCookieId: string;

      if (cookieId) {
        // Get cookie from storage using DB ID
        const userCookies = await storage.getShopeeCookiesByUser(req.user.id);
        const cookie = userCookies.find(c => c.id === cookieId);
        if (!cookie) {
          return res.status(404).json({ message: 'Cookie không tồn tại' });
        }
        cookieValue = cookie.cookieValue;
        actualCookieId = cookieId;
      } else {
        // Use provided cookie string directly
        cookieValue = cookieString;
        actualCookieId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // Generate temp ID for bulk
      }

      console.log(`[COOKIE RAPID] Using cookie: [REDACTED]`);

      // Generate idempotency key for this request
      const idempotencyKey = `cookie_rapid_${req.user.id}_${actualCookieId}_${Date.now()}`;

      // Step 1: Check if there's a recent successful check within 3 days (atomic phase 1)
      const recentCheckResult = await storage.atomicCookieRapidCheck({
        userId: req.user.id,
        cookieId: actualCookieId,
        cookiePreview: cookieValue.substring(0, 50), // First 50 chars for preview
        userIp: req.ip || null,
        idempotencyKey
      });

      if (!recentCheckResult.success) {
        return res.status(400).json({ 
          message: recentCheckResult.message 
        });
      }

      // If we found a recent successful check, return it
      if (recentCheckResult.foundRecentCheck) {
        console.log(`[COOKIE RAPID] Found recent successful check within 3 days for user ${req.user.id}`);
        
        const recentCheck = recentCheckResult.recentCheck!;
        
        // Create activity log for free re-check
        await storage.createActivity({
          description: `${req.user.fullName} đã thực hiện Cookie hỏa tốc (Miễn phí trong 3 ngày)`,
          type: 'info'
        });

        return res.json({
          ...recentCheck,
          message: 'Sử dụng kết quả kiểm tra trong vòng 3 ngày (miễn phí)',
          charged: false,
          amount_charged: 0,
          isFromHistory: true,
          orders: [], // Empty orders array for history checks
          orderCount: recentCheck.orderCount || 0
        });
      }

      // Step 2: No recent check found, proceed with new check (atomic phase 2)
      console.log(`[COOKIE RAPID] No recent check found, proceeding with new API call`);
      
      // Get service pricing
      const rapidCheckPrice = await storage.requireServicePrice('cookie_rapid_check');
      
      // Call the rapid order details function with proxy retry
      const rapidResult = await get_rapid_order_details_with_retry(cookieValue, 3);
      console.log(`[COOKIE RAPID] API result - Success: ${rapidResult.success}, Has driver: ${!!rapidResult.driver_phone}`);
      
      const finalResult = await storage.finalizeAtomicCookieRapidCheck({
        userId: req.user.id,
        cookieId: actualCookieId,
        cookieValue: cookieValue,
        cookiePreview: cookieValue.substring(0, 50),
        serviceCost: rapidCheckPrice,
        userIp: req.ip || null,
        userFullName: req.user.fullName || req.user.username || 'Unknown User',
        idempotencyKey,
        rapidResult: rapidResult
      });

      if (!finalResult.success) {
        return res.status(400).json({ 
          message: finalResult.message 
        });
      }

      const checkRecord = finalResult.checkRecord!;
      const shouldCharge = finalResult.charged;
      const amountCharged = finalResult.amount_charged;

      console.log(`[COOKIE RAPID] ${shouldCharge ? `Charged ${amountCharged}đ` : 'No charge'} for user ${req.user.id}`);

      // Create activity log
      await storage.createActivity({
        description: `${req.user.fullName} đã thực hiện Cookie hỏa tốc ${shouldCharge ? `(Tìm thấy shipper, trừ ${amountCharged}đ)` : '(Chưa có số shipper, không trừ tiền)'}`,
        type: shouldCharge ? 'info' : 'warning'
      });

      // Parse orders from metadata for response
      const metadata = typeof checkRecord.metadata === 'string' 
        ? JSON.parse(checkRecord.metadata || '{}') 
        : (checkRecord.metadata || {});
      const orders = metadata.orders || [];

      res.json({
        ...checkRecord,
        message: checkRecord.message,
        driverPhone: checkRecord.driverPhone || null,
        driverName: checkRecord.driverName || null,
        charged: shouldCharge,
        amount_charged: amountCharged,
        balanceAfter: finalResult.balanceAfter,
        isFromHistory: false,
        orders: orders,
        orderCount: checkRecord.orderCount || 0
      });

    } catch (error) {
      console.error(`[COOKIE RAPID] Error:`, error);
      res.status(500).json({ message: 'Lỗi khi thực hiện Cookie hỏa tốc' });
    }
  });

  // Voucher cache service
  class VoucherCacheService {
    private static readonly CACHE_KEY = 'voucher_data_cache';
    private static readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

    static async getCachedVouchers(): Promise<any[] | null> {
      try {
        const cacheConfig = await storage.getSystemConfig(this.CACHE_KEY);
        if (!cacheConfig) return null;

        const cacheData = JSON.parse(cacheConfig.configValue);
        const now = Date.now();
        
        // Check if cache is still valid (within 30 minutes)
        if (now - cacheData.timestamp < this.CACHE_DURATION_MS) {
          console.log(`[VOUCHER CACHE] Using cached data from ${new Date(cacheData.timestamp).toISOString()}`);
          return cacheData.vouchers;
        }

        console.log(`[VOUCHER CACHE] Cache expired, needs refresh`);
        return null;
      } catch (error) {
        console.error(`[VOUCHER CACHE] Error reading cache:`, error);
        return null;
      }
    }

    static async setCachedVouchers(vouchers: any[]): Promise<void> {
      try {
        const cacheData = {
          vouchers,
          timestamp: Date.now()
        };

        const existingCache = await storage.getSystemConfig(this.CACHE_KEY);
        
        if (existingCache) {
          await storage.updateSystemConfig(existingCache.id, {
            configValue: JSON.stringify(cacheData),
            updatedAt: new Date()
          });
        } else {
          await storage.createSystemConfig({
            configKey: this.CACHE_KEY,
            configValue: JSON.stringify(cacheData),
            configType: 'voucher_cache',
            description: 'Cache for voucher data from external API',
            isActive: true
          });
        }

        console.log(`[VOUCHER CACHE] Cached ${vouchers.length} vouchers at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`[VOUCHER CACHE] Error setting cache:`, error);
      }
    }

    static async fetchFreshVouchers(proxy?: any): Promise<any[] | null> {
      try {
        console.log(`[VOUCHER CACHE] Fetching fresh vouchers from external API`);
        
        const fetchOptions: any = {
          method: 'GET',
          headers: {
            'Host': 'us-central1-get-feedback-a0119.cloudfunctions.net',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'application/json, text/plain, */*',
            'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Sec-Ch-Ua-Mobile': '?0',
            'Origin': 'https://autopee.vercel.app',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Referer': 'https://autopee.vercel.app/',
            'Accept-Encoding': 'gzip, deflate, br',
            'If-None-Match': 'W/"606-zflTcSFJnoZfSaJb7v0rNyAQLy4"',
            'Priority': 'u=1, i'
          }
        };

        // Add proxy if provided
        if (proxy) {
          const { HttpProxyAgent } = await import('http-proxy-agent');
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          
          const proxyUrl = proxy.username && proxy.password
            ? `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.ip}:${proxy.port}`
            : `http://${proxy.ip}:${proxy.port}`;
          
          fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
          console.log(`[VOUCHER CACHE] Using proxy: ${proxy.ip}:${proxy.port}`);
        }

        const response = await fetch('https://us-central1-get-feedback-a0119.cloudfunctions.net/app/api/shopee/getFreeship', fetchOptions);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch vouchers: ${response.status}`);
        }

        const vouchers = await response.json();
        
        if (!Array.isArray(vouchers)) {
          throw new Error('Invalid voucher data format');
        }

        // Cache the fresh data
        await this.setCachedVouchers(vouchers);
        
        console.log(`[VOUCHER CACHE] Fetched ${vouchers.length} fresh vouchers`);
        return vouchers;
      } catch (error) {
        console.error(`[VOUCHER CACHE] Error fetching fresh vouchers:`, error);
        return null;
      }
    }

    static async getVouchers(forceFresh: boolean = false, useProxy: boolean = false): Promise<any[] | null> {
      if (forceFresh) {
        // Force fresh fetch
        let proxy = null;
        if (useProxy) {
          proxy = await storage.getRandomHttpProxy();
        }
        return await this.fetchFreshVouchers(proxy);
      }

      // Try to get cached vouchers first
      let vouchers = await this.getCachedVouchers();
      
      if (vouchers) {
        return vouchers;
      }

      // Cache miss or expired, fetch fresh data
      let proxy = null;
      if (useProxy) {
        proxy = await storage.getRandomHttpProxy();
      }

      return await this.fetchFreshVouchers(proxy);
    }
  }

  // Voucher saving routes
  app.get("/api/voucher-saving", authenticateToken, async (req: any, res) => {
    try {
      const operations = await storage.getVoucherSavingOperationsByUser(req.user.id);
      res.json(operations);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải lịch sử lưu voucher' });
    }
  });

  app.get("/api/voucher-saving-price", async (req, res) => {
    try {
      const price = await storage.requireServicePrice('voucher_saving');
      res.json({ price });
    } catch (error) {
      console.error('[VOUCHER PRICING ERROR]', error);
      res.status(500).json({ error: 'Unable to get voucher saving pricing. Please configure service pricing in database.' });
    }
  });

  // Removed generateRandomPromotionId function - always use original promotionId + signature pair

  // Function to attempt voucher saving with sequential testing (max 7 vouchers, one at a time)
  async function attemptVoucherSaving(vouchersToSave: any[], cookieValue: string): Promise<{ successfulSaves: number; failedSaves: number; saveResults: any[] }> {
    const startTime = Date.now();
    const MAX_VOUCHERS_TO_TRY = 7;
    
    // Filter chỉ voucher bắt đầu bằng FSV-
    const fsvVouchers = vouchersToSave.filter(voucher => 
      voucher?.voucherCode && voucher.voucherCode.startsWith('FSV-')
    );
    const vouchersToTry = fsvVouchers.slice(0, MAX_VOUCHERS_TO_TRY);
    
    console.log(`[VOUCHER SAVING] Starting sequential voucher testing - max ${MAX_VOUCHERS_TO_TRY} vouchers`);
    console.log(`[VOUCHER SAVING] Available vouchers: ${vouchersToSave.length}, FSV- vouchers: ${fsvVouchers.length}, will try: ${vouchersToTry.length}`);
    
    const results: any[] = [];
    let successfulSaves = 0;
    let failedSaves = 0;

    // Sequential testing: try each voucher one by one until success or max 7 vouchers
    for (let voucherIndex = 0; voucherIndex < vouchersToTry.length; voucherIndex++) {
      const voucher = vouchersToTry[voucherIndex];
      console.log(`[VOUCHER SAVING] Testing voucher ${voucherIndex + 1}/${vouchersToTry.length}: ${voucher?.voucherCode || 'UNKNOWN'}`);
      
      // DEBUG: Log full voucher data structure
      console.log(`[DEBUG] Voucher ${voucherIndex + 1} data:`, {
        voucherCode: voucher?.voucherCode,
        voucherName: voucher?.voucherName,
        promotionId: voucher?.promotionId,
        signature: voucher?.signature?.substring(0, 50) + '...',
        fullData: JSON.stringify(voucher).substring(0, 200) + '...'
      });
      
      let isSuccess = false;
      let saveData: any = null;
      let errorMessage = '';
      const maxAttempts = 3;

      // Only apply retry logic for target vouchers "MPVC giảm tối đa 300k từ 0k"
      const isTargetVoucher = voucher.voucherName && voucher.voucherName.includes('MPVC giảm tối đa 300k từ 0k');
      const attemptsToMake = isTargetVoucher ? maxAttempts : 1; // Target vouchers get 3 attempts, others get 1

      // Try this voucher with retry logic - ALWAYS use original promotionId + signature pair
      for (let attempt = 1; attempt <= attemptsToMake; attempt++) {
        try {
          // FIXED: Always use original promotionId + signature pair to avoid mismatch
          const promotionIdToUse = parseInt(voucher.promotionId);
          const signatureToUse = voucher.signature;
          
          console.log(`[DEBUG] Voucher ${voucherIndex + 1} attempt ${attempt} - Using promotionId: ${promotionIdToUse} (from voucher.promotionId: ${voucher.promotionId})`);
          
          if (attempt > 1) {
            console.log(`[VOUCHER SAVING] Voucher ${voucherIndex + 1} attempt ${attempt}/${attemptsToMake} with original promotionId: ${promotionIdToUse}`);
          }

          const saveResponse = await fetch('https://mall.shopee.vn/api/v2/voucher_wallet/save_voucher', {
            method: 'POST',
            headers: {
              'Cookie': cookieValue,
              'User-Agent': 'Android app Shopee appver=28320 app_type=1',
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              voucher_promotionid: promotionIdToUse,
              signature: signatureToUse,
              security_device_fingerprint: "jW0eSoyBy/A9jx8p6qZEkQ==|Kn8mQLzsfazeQO/HkWUkowXyKnzYCRrpDzrY9L5I7qIhtkFLBSvGQnEANyiV35Rj5Ra2dpIAY7epgEw1ofqPjg==|3ScuPqJgABhbu9m4|08|2",
              signature_source: "0"
            })
          });

          saveData = await saveResponse.json() as any;
          
          // Success condition: HTTP OK + error code 0 ONLY (error: 5 không được coi là thành công)
          const basicSuccess = saveResponse.ok && saveData.error === 0;
          
          // Both target and regular vouchers use the same success criteria
          // If error === 0 or error === 5 (already saved), it's success
          isSuccess = basicSuccess;
          
          // DEBUG: Log success logic
          console.log(`[DEBUG] Voucher ${voucherIndex + 1} attempt ${attempt} - Success logic:`, {
            status: saveResponse.status,
            ok: saveResponse.ok,
            error: saveData?.error,
            error_msg: saveData?.error_msg,
            basicSuccess,
            isSuccess
          });

          if (isSuccess) {
            console.log(`[VOUCHER SAVING] ✅ SUCCESS! Voucher ${voucherIndex + 1} saved successfully on attempt ${attempt}`);
            break; // Success, exit retry loop for this voucher
          } else {
            errorMessage = saveData?.error_msg || 'Lỗi không xác định';
            console.log(`[DEBUG] Voucher ${voucherIndex + 1} attempt ${attempt} FAILED - Error: ${saveData?.error}, Msg: ${saveData?.error_msg}`);
            if (attempt < attemptsToMake) {
              console.log(`[VOUCHER SAVING] Voucher ${voucherIndex + 1} attempt ${attempt} failed: ${errorMessage}, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 300)); // Small delay between retries
            }
          }
        } catch (attemptError: any) {
          errorMessage = attemptError.message;
          if (attempt < attemptsToMake) {
            console.log(`[VOUCHER SAVING] Voucher ${voucherIndex + 1} attempt ${attempt} error: ${errorMessage}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }

      // Record result for this voucher
      const voucherResult = {
        voucher,
        isSuccess,
        saveData,
        errorMessage: isSuccess ? null : errorMessage
      };
      
      results.push(voucherResult);

      if (isSuccess) {
        successfulSaves++;
        console.log(`[VOUCHER SAVING] 🎉 Voucher saved successfully! Stopping sequential test.`);
        break; // SUCCESS - stop trying more vouchers
      } else {
        failedSaves++;
        console.log(`[VOUCHER SAVING] ❌ Voucher ${voucherIndex + 1} failed: ${errorMessage}`);
        
        // Add delay before trying next voucher
        if (voucherIndex < vouchersToTry.length - 1) {
          console.log(`[VOUCHER SAVING] Trying next voucher in 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    // Final statistics and summary
    const duration = Date.now() - startTime;
    console.log(`[VOUCHER SAVING] Sequential testing completed in ${duration}ms: ${successfulSaves} successful, ${failedSaves} failed`);
    
    if (successfulSaves > 0) {
      console.log(`[VOUCHER SAVING] 🎉 Final result: Successfully saved ${successfulSaves} voucher(s)!`);
    } else {
      console.log(`[VOUCHER SAVING] ❌ Final result: No vouchers could be saved after trying ${results.length} voucher(s)`);
    }
    
    return { successfulSaves, failedSaves, saveResults: results };
  }

  app.post("/api/voucher-saving", authenticateToken, async (req: any, res) => {
    console.log(`[VOUCHER SAVING] Starting voucher saving for user ${req.user.id}`);
    
    try {
      // Validate request body using Zod schema
      const validation = voucherSavingRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const errors = validation.error.errors.map(err => err.message).join(', ');
        return res.status(400).json({ message: `Dữ liệu không hợp lệ: ${errors}` });
      }
      
      const { cookies } = validation.data;

      // Get service pricing
      const voucherSavingPrice = await storage.requireServicePrice('voucher_saving');
      
      // Calculate total cost for all cookies
      const totalCookies = cookies.length;
      const totalCost = totalCookies * voucherSavingPrice;
      
      // Early balance check to prevent processing if user doesn't have enough funds for all cookies
      const currentBalance = await storage.getUserBalance(req.user.id);
      if (currentBalance < totalCost) {
        console.log(`[VOUCHER SAVING] Early balance check failed: User ${req.user.id} has ${currentBalance.toLocaleString('vi-VN')} VND, needs ${totalCost.toLocaleString('vi-VN')} VND for ${totalCookies} cookie(s)`);
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND để sử dụng dịch vụ lưu voucher hỏa tốc cho ${totalCookies} cookie. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND` 
        });
      }
      
      const sessionId = `voucher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const userIp = getUserIP(req);
      
      const results = [];

      for (const cookieInput of cookies) {
        let cookieValue: string;
        let cookieId: string;
        let cookiePreview: string;

        // Handle different input formats
        if (typeof cookieInput === 'string') {
          cookieValue = cookieInput;
          cookieId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          cookiePreview = cookieInput; // Store full cookie for bulk operations
        } else if (typeof cookieInput === 'object' && 'id' in cookieInput && cookieInput.id) {
          // Get cookie from storage
          const userCookies = await storage.getShopeeCookiesByUser(req.user.id);
          const cookie = userCookies.find(c => c.id === cookieInput.id);
          if (!cookie) {
            results.push({
              cookieId: cookieInput.id,
              status: 'failed',
              message: 'Cookie không tồn tại',
              successfulSaves: 0,
              totalVouchersFound: 0
            });
            continue;
          }
          cookieValue = cookie.cookieValue;
          cookieId = cookieInput.id;
          cookiePreview = cookie.cookieValue.substring(0, 50) + '...'; // Keep preview for saved cookies
        } else if (typeof cookieInput === 'object' && 'cookie' in cookieInput && cookieInput.cookie) {
          cookieValue = cookieInput.cookie;
          cookieId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          cookiePreview = cookieInput.cookie; // Store full cookie for bulk operations
        } else {
          results.push({
            cookieId: 'unknown',
            status: 'failed',
            message: 'Định dạng cookie không hợp lệ',
            successfulSaves: 0,
            totalVouchersFound: 0
          });
          continue;
        }

        try {
          console.log(`[VOUCHER SAVING] Starting atomic processing for cookie: ${cookiePreview}`);
          
          // Generate deterministic idempotency key to prevent double processing
          const idempotencyKey = `${req.user.id}-${sessionId}-${cookieId}`;
          
          // Step 1: Atomic charge and operation creation
          const atomicResult = await storage.atomicVoucherSaving({
            userId: req.user.id,
            cookieId,
            cookieValue,
            cookiePreview,
            sessionId,
            serviceCost: voucherSavingPrice,
            idempotencyKey,
            userIp,
            userFullName: req.user.fullName
          });

          if (!atomicResult.success || !atomicResult.operation) {
            // Atomic charge failed (insufficient balance)
            results.push({
              cookieId,
              cookiePreview,
              status: 'failed',
              message: atomicResult.message,
              successfulSaves: 0,
              failedSaves: 0,
              totalVouchersFound: 0,
              charged: false,
              amountCharged: 0
            });
            continue;
          }

          console.log(`[VOUCHER SAVING] Atomic charge successful. Now attempting voucher saving...`);
          
          // Step 2: Now that payment is secured, attempt voucher saving
          let finalSuccessfulSaves = 0;
          let finalFailedSaves = 0;
          let finalTotalVouchers = 0;
          let isOperationSuccess = false;
          
          let retryCount = 0;
          const maxRetries = 2;

          // Retry logic for voucher saving
          while (retryCount < maxRetries) {
            try {
              // Get vouchers from cache or fresh API call
              let vouchers: any[] | null = null;
              if (retryCount === 0) {
                vouchers = await VoucherCacheService.getVouchers(false, false);
              } else {
                console.log(`[VOUCHER SAVING] Retry attempt ${retryCount}/${maxRetries - 1} - fetching fresh vouchers`);
                vouchers = await VoucherCacheService.getVouchers(true, true);
              }

              if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {
                throw new Error('No vouchers found in response');
              }

              finalTotalVouchers = vouchers.length;
              console.log(`[VOUCHER SAVING] Found ${vouchers.length} vouchers for ${cookiePreview} (attempt ${retryCount + 1})`);

              // Filter target vouchers
              const targetVouchers = vouchers.filter(v => 
                v.voucherName && v.voucherName.includes('MPVC giảm tối đa 300k từ 0k')
              );

              // Try to save vouchers
              const { successfulSaves, failedSaves, saveResults } = await attemptVoucherSaving(vouchers, cookieValue);

              finalSuccessfulSaves = successfulSaves;
              finalFailedSaves = failedSaves;

              // Store individual save results in database
              for (const result of saveResults) {
                await storage.createVoucherSaveResult({
                  operationId: atomicResult.operation.id,
                  voucherCode: result.voucher?.voucherCode || 'UNKNOWN',
                  promotionId: result.voucher?.promotionId || 'UNKNOWN',
                  signature: result.voucher?.signature || 'UNKNOWN',
                  voucherName: result.voucher?.voucherName || 'Unknown voucher',
                  status: !!result.isSuccess,
                  saveResponse: result.saveData,
                  errorMessage: result.errorMessage
                });
              }

              // Check success condition
              const targetSavedCount = targetVouchers.length > 0 ? 
                Math.min(successfulSaves, targetVouchers.length) : 0;
              isOperationSuccess = targetSavedCount > 0;

              // If we successfully saved vouchers or reached max retries, break
              if (successfulSaves > 0 || retryCount >= maxRetries - 1) {
                console.log(`[VOUCHER SAVING] Voucher saving completed with ${successfulSaves} successful saves on attempt ${retryCount + 1}`);
                break;
              }

              console.log(`[VOUCHER SAVING] No vouchers saved on attempt ${retryCount + 1}, retrying...`);
              retryCount++;

            } catch (voucherError) {
              console.error(`[VOUCHER SAVING] Error saving vouchers on attempt ${retryCount + 1}:`, voucherError);
              
              if (retryCount >= maxRetries - 1) {
                // Final failure
                break;
              }
              retryCount++;
            }
          }

          // Step 3: Update operation with final results
          const finalStatus = isOperationSuccess ? 'success' : 'failed';
          let finalMessage = isOperationSuccess ? 
            `Lưu thành công ${finalSuccessfulSaves} voucher - Đã trừ ${voucherSavingPrice}₫` : 
            `Thất bại - Đã trừ ${voucherSavingPrice}₫ nhưng không lưu được voucher thành công`;

          // Step 3.1: If voucher saving failed, automatically refund the money
          let refundResult = null;
          if (!isOperationSuccess) {
            // Critical: Ensure refund happens or mark for retry
            let refundAttempts = 0;
            const maxRefundAttempts = 3;
            
            while (!refundResult?.success && refundAttempts < maxRefundAttempts) {
              try {
                refundAttempts++;
                console.log(`[REFUND] Voucher saving failed for operation ${atomicResult.operation.id}, initiating automatic refund (attempt ${refundAttempts}/${maxRefundAttempts})...`);
                
                refundResult = await storage.refundFailedVoucherSaving({
                  userId: req.user.id,
                  operationId: atomicResult.operation.id,
                  originalTransactionId: atomicResult.transaction!.id,
                  serviceCost: voucherSavingPrice,
                  sessionId,
                  cookieId,
                  reason: `Không lưu được voucher sau ${maxRetries} lần thử`,
                  idempotencyKey: `refund-${idempotencyKey}`
                });

                if (refundResult.success) {
                  finalMessage = `Thất bại - Đã hoàn ${voucherSavingPrice.toLocaleString('vi-VN')}₫ vào tài khoản do không lưu được voucher`;
                  console.log(`[REFUND] Successfully refunded ${voucherSavingPrice}₫ for failed voucher saving operation ${atomicResult.operation.id} on attempt ${refundAttempts}`);
                  
                  // Create audit log for successful refund
                  await storage.createActivity({
                    description: `[AUTO-REFUND] Đã hoàn ${voucherSavingPrice.toLocaleString('vi-VN')}₫ cho ${req.user.fullName} do lưu voucher thất bại (Operation: ${atomicResult.operation.id})`,
                    type: 'info'
                  });
                  break;
                } else {
                  console.error(`[REFUND] Failed to refund money for operation ${atomicResult.operation.id} on attempt ${refundAttempts}`);
                  if (refundAttempts < maxRefundAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * refundAttempts)); // Exponential backoff
                  }
                }
              } catch (refundError) {
                console.error(`[REFUND] Error during automatic refund for operation ${atomicResult.operation.id} (attempt ${refundAttempts}):`, refundError);
                if (refundAttempts < maxRefundAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 1000 * refundAttempts)); // Exponential backoff
                }
              }
            }

            // If all refund attempts failed, create urgent audit log and alert
            if (!refundResult?.success) {
              const alertMessage = `🚨 URGENT: Refund failed after ${maxRefundAttempts} attempts for operation ${atomicResult.operation.id}. User ${req.user.fullName} (ID: ${req.user.id}) lost ${voucherSavingPrice}₫. Manual intervention required!`;
              console.error(`[REFUND] ${alertMessage}`);
              
              // Create urgent audit log
              await storage.createActivity({
                description: `[REFUND-FAILED] ${alertMessage}`,
                type: 'error'
              });
              
              finalMessage = `Thất bại - Không lưu được voucher và lỗi hoàn tiền. Đã ghi nhận vào hệ thống, bạn sẽ được hoàn tiền thủ công sớm nhất.`;
            }
          }

          await storage.updateVoucherSavingOperation(atomicResult.operation.id, {
            status: finalStatus,
            successfulSaves: finalSuccessfulSaves,
            failedSaves: finalFailedSaves,
            totalVouchersFound: finalTotalVouchers,
            message: finalMessage,
            completedAt: new Date()
          });

          results.push({
            cookieId,
            cookiePreview,
            operationId: atomicResult.operation.id,
            status: finalStatus,
            message: finalMessage,
            totalVouchersFound: finalTotalVouchers,
            successfulSaves: finalSuccessfulSaves,
            failedSaves: finalFailedSaves,
            charged: true, // Always charged in atomic approach
            amountCharged: voucherSavingPrice,
            balanceAfter: refundResult ? refundResult.balanceAfter : atomicResult.balanceAfter,
            refunded: !!refundResult?.success, // Include refund status
            refundAmount: refundResult?.success ? voucherSavingPrice : 0
          });

        } catch (error) {
          console.error(`[VOUCHER SAVING] Error processing cookie ${cookiePreview}:`, error);
          
          results.push({
            cookieId,
            cookiePreview,
            status: 'failed',
            message: `Lỗi: ${(error as Error).message || 'Unknown error'}`,
            successfulSaves: 0,
            failedSaves: 0,
            totalVouchersFound: 0,
            charged: false,
            amountCharged: 0
          });
        }
      }

      // Create activity log
      const totalSuccess = results.filter(r => r.status === 'success').length;
      const totalCharged = results.reduce((sum, r) => sum + (r.amountCharged || 0), 0);
      
      await storage.createActivity({
        description: `${req.user.fullName} đã thực hiện lưu voucher cho ${cookies.length} cookie - ${totalSuccess} thành công${totalCharged > 0 ? ` (Tổng trừ: ${totalCharged}₫)` : ''}`,
        type: totalSuccess > 0 ? 'success' : 'warning'
      });

      res.json({
        sessionId,
        totalCookies: cookies.length,
        successfulOperations: totalSuccess,
        totalAmountCharged: totalCharged,
        results
      });

    } catch (error) {
      console.error(`[VOUCHER SAVING] Error:`, error);
      res.status(500).json({ message: 'Lỗi khi thực hiện lưu voucher' });
    }
  });

  // Transaction routes
  app.get("/api/transactions", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === 'admin') {
        // Check if pagination requested
        const isPaginationRequested = req.query.page || req.query.limit;
        
        if (isPaginationRequested) {
          // New paginated API - explicit pagination requested
          const page = parseInt(req.query.page as string) || 1;
          const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
          const offset = (page - 1) * limit;
          
          const transactions = await storage.getTransactionsWithFilter({ 
            limit, 
            offset,
            types: req.query.type ? [req.query.type as string] : undefined
          });
          
          res.json({
            transactions,
            pagination: { page, limit, hasMore: transactions.length === limit }
          });
        } else {
          // EGRESS OPTIMIZATION: Default pagination to prevent loading 4.8M+ rows
          // Use sensible defaults instead of loading ALL transactions
          const defaultLimit = 1000; // Maximum reasonable size for UI
          const transactions = await storage.getTransactionsWithFilter({ 
            limit: defaultLimit, 
            offset: 0,
            types: req.query.type ? [req.query.type as string] : undefined
          });
          
          res.json(transactions); // Raw array for backward compatibility
        }
      } else {
        // Regular users: get their transactions (raw array for compatibility)
        const transactions = await storage.getTransactionsByUser(req.user.id);
        res.json(transactions);
      }
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải lịch sử giao dịch' });
    }
  });

  app.post("/api/transactions", authenticateToken, async (req: any, res) => {
    try {
      const transaction = await storage.createTransaction({
        ...req.body,
        userId: req.user.id
        // skipBalanceUpdate: false - Let createTransaction handle automatic balance update
      });
      
      // Note: Balance update is now handled automatically by createTransaction method
      // for completed top_up transactions, so we removed the manual update here
      
      await storage.createActivity({
        description: `${req.user.fullName} đã ${req.body.type === 'top_up' ? 'nạp tiền' : 'sử dụng dịch vụ'} ${new Intl.NumberFormat('vi-VN').format(req.body.amount)}đ`,
        type: 'info'
      });

      res.json(transaction);
    } catch (error) {
      res.status(400).json({ message: 'Không thể tạo giao dịch' });
    }
  });

  // Service usage routes
  app.get("/api/service-usage", authenticateToken, async (req: any, res) => {
    try {
      const usage = req.user.role === 'admin' ? 
        await storage.getAllServiceUsage() : 
        await storage.getServiceUsageByUser(req.user.id);
      res.json(usage);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải lịch sử sử dụng dịch vụ' });
    }
  });

  app.post("/api/service-usage", authenticateToken, async (req: any, res) => {
    try {
      const usage = await storage.createServiceUsage({
        ...req.body,
        userId: req.user.id
      });
      
      // Deduct cost from user balance if specified
      if (req.body.cost && req.body.cost > 0) {
        const currentBalance = await storage.getUserBalance(req.user.id);
        const newBalance = Math.max(0, currentBalance - parseFloat(req.body.cost));
        await storage.updateUserBalance(req.user.id, newBalance);
        
        // Create transaction record for the service usage
        await storage.createTransaction({
          type: req.body.serviceType || 'service_usage',
          amount: (-parseFloat(req.body.cost)).toString(),
          description: req.body.description,
          status: 'completed',
          userId: req.user.id
        });
      }
      
      await storage.createActivity({
        description: `${req.user.fullName} đã sử dụng dịch vụ ${req.body.serviceName}`,
        type: 'info'
      });

      res.json(usage);
    } catch (error) {
      res.status(400).json({ message: 'Không thể ghi nhận sử dụng dịch vụ' });
    }
  });

  // User management routes (Admin only)
  app.get("/api/users", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải danh sách người dùng' });
    }
  });

  // Get user history (Admin and superadmin only)
  app.get("/api/users/:userId/history", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // EGRESS OPTIMIZATION: Add pagination limits to prevent loading massive datasets
      const limit = parseInt(req.query.limit as string) || 100; // Default reasonable limit
      const offset = parseInt(req.query.offset as string) || 0;
      
      // Get service history for the user with limits to prevent database egress
      const [
        transactions,
        phoneChecks,
        accountChecks,
        trackingChecks,
        emailAdditions,
        cookieExtractions,
        phoneRentals,
        tiktokRentals
      ] = await Promise.all([
        storage.getTransactionsByUser(userId, limit, offset),
        storage.getPhoneChecksByUser(userId), // Note: No pagination yet, should be added
        storage.getAccountChecksByUser(userId), // Note: No pagination yet, should be added 
        storage.getTrackingChecksByUser(userId), // Note: No pagination yet, should be added
        storage.getEmailAdditionsByUser(userId), // Note: No pagination yet, should be added
        storage.getCookieExtractionsByUser(userId), // Note: No pagination yet, should be added
        storage.getPhoneRentalHistoryByUser(userId, limit, offset),
        storage.getTiktokRentalsByUserId(userId) // Note: No pagination yet, should be added
      ]);

      // Combine all history with consistent format
      const history = [
        ...transactions.map((t: any) => {
          // Extract session ID from reference or description for phone rental related transactions
          let sessionId = null;
          let phoneNumber = null;
          
          // Check if this is a phone rental related transaction
          if (t.type?.includes('otissim') || t.type?.includes('tiktok') || 
              t.reference?.includes('charge_') || t.reference?.includes('refund_') ||
              t.description?.includes('Phone rental') || t.description?.includes('TikTok')) {
            
            // Try to extract session ID from reference (e.g., "charge_abc123", "otissim_v1_refund_123_abc123")
            if (t.reference) {
              const chargeMatch = t.reference.match(/charge_([a-z0-9]+)/);
              const refundMatch = t.reference.match(/_refund_\d+_([a-z0-9]+)/);
              sessionId = chargeMatch?.[1] || refundMatch?.[1] || null;
            }
            
            // If no session ID found in reference, try description
            if (!sessionId && t.description) {
              const descMatch = t.description.match(/session[:\s]+([a-z0-9]+)/i);
              sessionId = descMatch?.[1] || null;
            }
            
            // Try to extract phone number from description
            const phoneMatch = t.description?.match(/(\d{10,11})/);
            phoneNumber = phoneMatch?.[1] || null;
          }
          
          return {
            id: t.id,
            createdAt: t.createdAt,
            service: 'transaction',
            type: t.type,
            amount: t.amount,
            description: t.description,
            phoneNumber: phoneNumber,
            sessionId: sessionId,
            status: 'completed'
          };
        }),
        ...phoneChecks.map((p: any) => ({
          id: p.id,
          createdAt: p.checkedAt,
          service: 'phone_check',
          cost: p.cost,
          description: p.phoneNumber,
          phoneNumber: p.phoneNumber,
          sessionId: null,
          isRegistered: p.isRegistered,
          status: p.isRegistered ? 'registered' : 'not_registered'
        })),
        ...accountChecks.map((a: any) => ({
          id: a.id,
          createdAt: a.createdAt,
          service: 'account_check',
          cost: 100,
          description: `Cookie check - ${a.status === true ? 'Success' : 'Failed'}`,
          phoneNumber: null,
          sessionId: null,
          status: a.status
        })),
        ...trackingChecks.map((t: any) => ({
          id: t.id,
          createdAt: t.createdAt,
          service: 'tracking_check',
          cost: 100,
          description: `Order tracking - ${t.orderCount} orders`,
          phoneNumber: null,
          sessionId: null,
          status: t.status
        })),
        ...emailAdditions.map((e: any) => ({
          id: e.id,
          createdAt: e.createdAt,
          service: 'email_addition',
          cost: 100,
          description: `Email: ${e.email}`,
          phoneNumber: null,
          sessionId: null,
          status: e.status
        })),
        ...cookieExtractions.map((c: any) => ({
          id: c.id,
          createdAt: c.createdAt,
          service: 'cookie_extraction',
          cost: 100,
          description: `Cookie extraction - ${c.method}`,
          phoneNumber: null,
          sessionId: null,
          status: c.status
        })),
        ...phoneRentals.map((p: any) => ({
          id: p.id,
          createdAt: p.createdAt,
          service: p.service || p.serviceType || 'phone_rental',
          cost: p.cost || (p.serviceType === 'otissim_v3' ? 2000 : 2100),
          description: `Phone: ${p.phoneNumber || 'Unknown'} - ${p.serviceType || p.service}`,
          phoneNumber: p.phoneNumber,
          sessionId: p.sessionId || p.id,
          status: p.status
        })),
        ...tiktokRentals.map((t: any) => ({
          id: t.id,
          createdAt: t.createdAt,
          service: 'tiktok_rental',
          cost: t.cost || 1200,
          description: `TikTok Phone: ${t.phoneNumber || 'Unknown'}`,
          phoneNumber: t.phoneNumber,
          sessionId: t.sessionId || t.id,
          status: t.status
        }))
      ];

      // Sort by creation date (newest first)
      history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(history);
    } catch (error) {
      console.error('Error fetching user history:', error);
      res.status(500).json({ message: 'Không thể tải lịch sử sử dụng' });
    }
  });

  // Get user top-up history (Admin and superadmin only)
  app.get("/api/users/:userId/topup-history", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Get top-up history for the user
      const topupHistory = await storage.getTopupHistoryByUser(userId);
      
      res.json(topupHistory);
    } catch (error) {
      console.error('Error fetching user top-up history:', error);
      res.status(500).json({ message: 'Không thể tải lịch sử nạp tiền' });
    }
  });

  // Get activity statistics for multiple users (Admin and superadmin only)
  app.post("/api/users/activity-stats", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const { userIds } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'Vui lòng cung cấp danh sách user IDs' });
      }

      const stats = [];

      for (const userId of userIds) {
        const userIdNum = parseInt(userId);
        
        // Get user info
        const users = await storage.getAllUsers();
        const user = users.find((u: any) => u.id === userIdNum);
        
        if (!user) continue;

        // Get service history for the user
        const [
          phoneChecks,
          accountChecks,
          trackingChecks,
          emailAdditions,
          cookieExtractions,
          phoneRentals,
          tiktokRentals
        ] = await Promise.all([
          storage.getPhoneChecksByUser(userIdNum),
          storage.getAccountChecksByUser(userIdNum),
          storage.getTrackingChecksByUser(userIdNum),
          storage.getEmailAdditionsByUser(userIdNum),
          storage.getCookieExtractionsByUser(userIdNum),
          storage.getPhoneRentalHistoryByUser(userIdNum, 10000, 0),
          storage.getTiktokRentalsByUserId(userIdNum)
        ]);

        // Calculate statistics for each service
        const serviceStats: any = {};

        // Phone checks
        if (phoneChecks.length > 0) {
          serviceStats.phone_check = {
            total: phoneChecks.length,
            success: phoneChecks.filter((p: any) => p.isRegistered).length,
            failed: phoneChecks.filter((p: any) => !p.isRegistered).length
          };
        }

        // Account checks
        if (accountChecks.length > 0) {
          serviceStats.account_check = {
            total: accountChecks.length,
            success: accountChecks.filter((a: any) => a.status === true).length,
            failed: accountChecks.filter((a: any) => a.status === false).length
          };
        }

        // Tracking checks
        if (trackingChecks.length > 0) {
          serviceStats.tracking_check = {
            total: trackingChecks.length,
            success: trackingChecks.filter((t: any) => t.status === true).length,
            failed: trackingChecks.filter((t: any) => t.status === false).length
          };
        }

        // Email additions
        if (emailAdditions.length > 0) {
          serviceStats.email_addition = {
            total: emailAdditions.length,
            success: emailAdditions.filter((e: any) => e.status === 'success').length,
            failed: emailAdditions.filter((e: any) => e.status !== 'success').length
          };
        }

        // Cookie extractions
        if (cookieExtractions.length > 0) {
          serviceStats.cookie_extraction = {
            total: cookieExtractions.length,
            success: cookieExtractions.filter((c: any) => c.status === 'success').length,
            failed: cookieExtractions.filter((c: any) => c.status !== 'success').length
          };
        }

        // Phone rentals by service type
        const otissimV1 = phoneRentals.filter((p: any) => p.service === 'otissim_v1');
        const otissimV2 = phoneRentals.filter((p: any) => p.service === 'otissim_v2');
        const otissimV3 = phoneRentals.filter((p: any) => p.service === 'otissim_v3');

        if (otissimV1.length > 0) {
          serviceStats.otissim_v1 = {
            total: otissimV1.length,
            success: otissimV1.filter((p: any) => p.status === 'completed').length,
            failed: otissimV1.filter((p: any) => p.status === 'failed' || p.status === 'expired').length
          };
        }

        if (otissimV2.length > 0) {
          serviceStats.otissim_v2 = {
            total: otissimV2.length,
            success: otissimV2.filter((p: any) => p.status === 'completed').length,
            failed: otissimV2.filter((p: any) => p.status === 'failed' || p.status === 'expired').length
          };
        }

        if (otissimV3.length > 0) {
          serviceStats.otissim_v3 = {
            total: otissimV3.length,
            success: otissimV3.filter((p: any) => p.status === 'completed').length,
            failed: otissimV3.filter((p: any) => p.status === 'failed' || p.status === 'expired').length
          };
        }

        // TikTok rentals
        if (tiktokRentals.length > 0) {
          serviceStats.tiktok_rental = {
            total: tiktokRentals.length,
            success: tiktokRentals.filter((t: any) => t.status === 'completed').length,
            failed: tiktokRentals.filter((t: any) => t.status === 'failed' || t.status === 'expired').length
          };
        }

        stats.push({
          userId: userIdNum,
          username: user.username,
          fullName: user.fullName,
          services: serviceStats
        });
      }

      res.json(stats);
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      res.status(500).json({ message: 'Không thể tải thống kê hoạt động' });
    }
  });

  app.post("/api/users", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userData = req.body;
      
      // Admin users can only create users with 'user' role - override any role specification
      if (req.user.role === 'admin') {
        userData.role = 'user';
      }
      
      const user = await storage.createUser(userData);
      
      // Log user creation
      await storage.logUserAction(
        req.user.id,
        'user_create',
        `Tạo người dùng mới: ${user.username}`,
        req.ip || 'unknown',
        user.id,
        null,
        { username: user.username, email: user.email, role: user.role }
      );

      await storage.createActivity({
        description: `${req.user.fullName} đã tạo người dùng mới: ${user.username}`,
        type: 'success'
      });

      res.json(user);
    } catch (error) {
      console.error('Create user error:', error);
      res.status(400).json({ message: 'Không thể tạo người dùng' });
    }
  });

  app.put("/api/users/:id", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      let updates = req.body;
      
      // Check if admin can modify this user
      const canModify = await canModifyUser(req.user.role, userId);
      if (!canModify) {
        return res.status(403).json({ message: 'Không có quyền chỉnh sửa người dùng này' });
      }
      
      // Admin cannot update role - only superadmin can
      if (req.user.role === 'admin' && updates.role) {
        delete updates.role;
      }
      
      const user = await storage.updateUser(userId, updates, req.user.id, req.ip || 'unknown');
      
      if (!user) {
        return res.status(404).json({ message: 'Người dùng không tồn tại' });
      }

      await storage.createActivity({
        description: `${req.user.fullName} đã cập nhật thông tin người dùng: ${user.username}`,
        type: 'info'
      });

      res.json(user);
    } catch (error) {
      res.status(400).json({ message: 'Không thể cập nhật người dùng' });
    }
  });

  app.delete("/api/users/:id", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      const userToDelete = await storage.getUser(userId);
      
      if (!userToDelete) {
        return res.status(404).json({ message: 'Người dùng không tồn tại' });
      }

      // Check if admin can modify this user
      const canModify = await canModifyUser(req.user.role, userId);
      if (!canModify) {
        return res.status(403).json({ message: 'Không có quyền xóa người dùng này' });
      }

      // Prevent deleting yourself
      if (userId === req.user.id) {
        return res.status(400).json({ message: 'Không thể xóa chính mình' });
      }

      const success = await storage.deleteUser(userId);
      
      if (success) {
        // Log user deletion
        await storage.logUserAction(
          req.user.id,
          'user_delete',
          `Xóa người dùng: ${userToDelete.username}`,
          req.ip || 'unknown',
          userId,
          { username: userToDelete.username, email: userToDelete.email, role: userToDelete.role },
          null
        );

        await storage.createActivity({
          description: `${req.user.fullName} đã xóa người dùng: ${userToDelete.username}`,
          type: 'warning'
        });

        res.json({ message: 'Vô hiệu hóa tài khoản thành công' });
      } else {
        res.status(400).json({ message: 'Không thể xóa người dùng - có thể do ràng buộc dữ liệu' });
      }
    } catch (error) {
      console.error('Delete user error:', error);
      // Check if it's a foreign key constraint error
      if (error instanceof Error && error.message.includes('foreign key')) {
        res.status(400).json({ message: 'Không thể xóa người dùng do có dữ liệu liên quan' });
      } else {
        res.status(500).json({ message: 'Lỗi hệ thống khi xóa người dùng' });
      }
    }
  });

  // Update user balance endpoint
  app.put("/api/users/:id/balance", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { balance } = req.body;

      if (typeof balance !== 'number' || balance < 0) {
        return res.status(400).json({ message: 'Số dư phải là một số không âm' });
      }

      // Check if admin can modify this user
      const canModify = await canModifyUser(req.user.role, userId);
      if (!canModify) {
        return res.status(403).json({ message: 'Không có quyền cập nhật số dư người dùng này' });
      }

      // Get current user data for validation
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }

      // Update balance with logging
      await storage.updateUserBalance(userId, balance, req.user.id, req.ip || 'unknown');

      // Create activity log
      await storage.createActivity({
        description: `${req.user.fullName} đã cập nhật số dư cho ${currentUser.fullName} từ ${Number(currentUser.balance).toLocaleString('vi-VN')} ₫ thành ${balance.toLocaleString('vi-VN')} ₫`,
        type: 'info'
      });

      res.json({ message: 'Cập nhật số dư thành công', balance });
    } catch (error) {
      console.error('Update balance error:', error);
      res.status(500).json({ message: 'Không thể cập nhật số dư' });
    }
  });

  // Toggle account status endpoint
  app.put("/api/users/:id/toggle-status", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: 'Trạng thái tài khoản phải là true hoặc false' });
      }

      // Check if admin can modify this user
      const canModify = await canModifyUser(req.user.role, userId);
      if (!canModify) {
        return res.status(403).json({ message: 'Không có quyền thay đổi trạng thái tài khoản này' });
      }

      // Get current user data
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }

      // Prevent self-locking
      if (userId === req.user.id && !isActive) {
        return res.status(400).json({ message: 'Không thể khóa tài khoản của chính mình' });
      }

      // Update user status
      await storage.updateUser(userId, { isActive });

      // Log the action for audit
      await storage.logUserAction(
        req.user.id,
        'account_status_toggle',
        `${isActive ? 'Mở khóa' : 'Khóa'} tài khoản ${currentUser.username} (${currentUser.fullName})`,
        req.ip || req.connection.remoteAddress || 'unknown'
      );

      // Create activity log
      await storage.createActivity({
        description: `${req.user.fullName} đã ${isActive ? 'mở khóa' : 'khóa'} tài khoản ${currentUser.fullName}`,
        type: isActive ? 'success' : 'warning'
      });

      res.json({ 
        message: `${isActive ? 'Mở khóa' : 'Khóa'} tài khoản thành công`,
        user: {
          id: currentUser.id,
          username: currentUser.username,
          fullName: currentUser.fullName,
          isActive
        }
      });
    } catch (error) {
      console.error('Toggle account status error:', error);
      res.status(500).json({ message: 'Không thể thay đổi trạng thái tài khoản' });
    }
  });

  // Public endpoint for cookie rapid check pricing
  app.get("/api/cookie-rapid-price", async (req: any, res) => {
    try {
      const pricing = await storage.getServicePricing('cookie_rapid_check');
      if (!pricing) {
        return res.json({ price: 500 }); // Fallback to 500
      }
      res.json({ price: parseFloat(pricing.price) });
    } catch (error) {
      console.error('Error fetching cookie rapid price:', error);
      res.json({ price: 500 }); // Fallback to 500
    }
  });

  // Service pricing configuration routes (Read access for all authenticated users, modify access for Super Admin only)
  app.get("/api/service-pricing", authenticateToken, async (req: any, res) => {
    try {
      const pricing = await storage.getAllServicePricing();
      res.json(pricing);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải cấu hình giá dịch vụ' });
    }
  });

  // Initialize default service pricing
  app.post("/api/service-pricing/initialize", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const defaultServices = [
        { serviceType: "otissim_v1", serviceName: "Otissim_v1", price: "2100", description: "số/ngày", isActive: true },
        { serviceType: "otissim_v2", serviceName: "Otissim_v2", price: "2000", description: "số/ngày", isActive: true },
        { serviceType: "otissim_v3", serviceName: "Otissim_v3", price: "2000", description: "số/ngày", isActive: true },
        { serviceType: "phone_check", serviceName: "Kiểm tra số", price: "100", description: "số chưa đăng ký", isActive: true },
        { serviceType: "account_check", serviceName: "Kiểm tra tài khoản", price: "100", description: "lần thành công", isActive: true },
        { serviceType: "tracking_check", serviceName: "Mã vận đơn", price: "100", description: "lần thành công", isActive: true },
        { serviceType: "email_addition", serviceName: "Thêm email", price: "100", description: "lần thành công", isActive: true },
        { serviceType: "cookie_qr", serviceName: "Lấy cookie SPC_ST và SPC_F bằng quét QR", price: "100", description: "lần thành công", isActive: true },
        { serviceType: "cookie_spcf", serviceName: "Lấy cookie SPC_ST bằng cookie SPC_F", price: "100", description: "lần thành công", isActive: true },
        { serviceType: "cookie_rapid_check", serviceName: "cookie_rapid_check", price: "500", description: "lần thành công", isActive: true }
      ];

      const existingServices = await storage.getAllServicePricing();
      const existingServiceTypes = existingServices.map(s => s.serviceType);

      let createdCount = 0;
      for (const service of defaultServices) {
        if (!existingServiceTypes.includes(service.serviceType)) {
          await storage.createServicePricing(service);
          createdCount++;
        }
      }

      await storage.createAuditLog({
        userId: req.user.id,
        action: 'PRICING_INITIALIZE',
        description: `Khởi tạo ${createdCount} dịch vụ mặc định`,
        ipAddress: req.ip || 'unknown'
      });

      res.json({ message: `Khởi tạo thành công ${createdCount} dịch vụ mặc định`, createdCount });
    } catch (error) {
      res.status(500).json({ message: 'Không thể khởi tạo dịch vụ mặc định' });
    }
  });

  app.post("/api/service-pricing", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const pricingData = req.body;
      const pricing = await storage.createServicePricing(pricingData);
      
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'PRICING_CREATE',
        description: `Tạo cấu hình giá mới cho dịch vụ: ${pricing.serviceName}`,
        ipAddress: req.ip || 'unknown'
      });

      res.json(pricing);
    } catch (error) {
      res.status(400).json({ message: 'Không thể tạo cấu hình giá dịch vụ' });
    }
  });

  app.put("/api/service-pricing/:id", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const pricing = await storage.updateServicePricing(id, updates);
      
      if (!pricing) {
        return res.status(404).json({ message: 'Cấu hình giá không tồn tại' });
      }

      await storage.createAuditLog({
        userId: req.user.id,
        action: 'PRICING_UPDATE',
        description: `Cập nhật cấu hình giá dịch vụ: ${pricing.serviceName}`,
        ipAddress: req.ip || 'unknown'
      });

      res.json(pricing);
    } catch (error) {
      res.status(400).json({ message: 'Không thể cập nhật cấu hình giá dịch vụ' });
    }
  });

  app.delete("/api/service-pricing/:id", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteServicePricing(id);
      
      if (success) {
        await storage.createAuditLog({
          userId: req.user.id,
          action: 'PRICING_DELETE',
          description: `Xóa cấu hình giá dịch vụ`,
          ipAddress: req.ip || 'unknown'
        });

        res.json({ message: 'Xóa cấu hình giá thành công' });
      } else {
        res.status(400).json({ message: 'Không thể xóa cấu hình giá' });
      }
    } catch (error) {
      res.status(400).json({ message: 'Không thể xóa cấu hình giá' });
    }
  });

  // System configuration routes (Super Admin only)
  app.get("/api/system-config", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const configType = req.query.type as string;
      const configs = configType 
        ? await storage.getSystemConfigByType(configType)
        : await storage.getAllSystemConfig();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải cấu hình hệ thống' });
    }
  });

  // Validate proxy key endpoint
  app.post("/api/system-config/validate-proxy", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const { apiKey, provider } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({ message: 'API key là bắt buộc' });
      }

      if (!provider) {
        return res.status(400).json({ message: 'Provider là bắt buộc' });
      }

      let proxyResponse, proxyData: any;

      if (provider === 'fproxy') {
        // Call fproxy.me API to validate
        proxyResponse = await fetch(`https://fproxy.me/api/getnew?api_key=${apiKey}&location=&ip_allow=`);
        proxyData = await proxyResponse.json();

        if ((proxyData.success && proxyData.data && proxyData.data.ip) || 
            (!proxyData.success && proxyData.data && proxyData.data.ip && proxyData.message && proxyData.message.includes('Vui lòng chờ'))) {
          // Valid if success=true OR if rate limited but has IP data
          res.json({ 
            valid: true, 
            message: proxyData.success ? 'Key fproxy hợp lệ' : `Key fproxy hợp lệ (${proxyData.message})`,
            proxyInfo: {
              ip: proxyData.data.ip,
              location: proxyData.data.location || 'Không xác định',
              provider: 'fproxy'
            }
          });
        } else {
          res.json({ 
            valid: false, 
            message: proxyData.message || 'Key fproxy không hợp lệ' 
          });
        }
      } else if (provider === 'wwproxy') {
        // Call wwproxy.com API to validate
        proxyResponse = await fetch(`https://wwproxy.com/api/client/proxy/available?key=${apiKey}&provinceId=-1`);
        proxyData = await proxyResponse.json();

        if (proxyData.status === 'OK' && proxyData.data && proxyData.data.ipAddress) {
          res.json({ 
            valid: true, 
            message: 'Key wwproxy hợp lệ',
            proxyInfo: {
              ip: proxyData.data.ipAddress,
              port: proxyData.data.port,
              proxy: proxyData.data.proxy,
              expiredTime: proxyData.data.expiredTime,
              provider: 'wwproxy'
            }
          });
        } else if (proxyData.status === 'BAD_REQUEST' && proxyData.message && proxyData.message.includes('Thời gian giữa hai lần')) {
          // Rate limited but key is valid
          res.json({ 
            valid: true, 
            message: 'Key wwproxy hợp lệ (rate limited nhưng key đúng)',
            proxyInfo: {
              provider: 'wwproxy',
              note: 'Rate limited'
            }
          });
        } else if (proxyData.status === 'BAD_REQUEST' && proxyData.message && proxyData.message.includes('không tồn tại')) {
          res.json({ 
            valid: false, 
            message: proxyData.message
          });
        } else {
          res.json({ 
            valid: false, 
            message: proxyData.message || 'Key wwproxy không hợp lệ' 
          });
        }
      } else {
        res.status(400).json({ message: 'Provider không được hỗ trợ' });
      }
    } catch (error) {
      console.error('Proxy validation error:', error);
      res.status(500).json({ 
        valid: false, 
        message: 'Không thể kiểm tra key proxy' 
      });
    }
  });

  app.post("/api/system-config", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const configData = req.body;
      
      // Validate proxy key only if it's a proxy_key config
      if (configData.configType === 'proxy_key') {
        const provider = configData.configKey.includes('fproxy') ? 'fproxy' : 
                        configData.configKey.includes('wwproxy') ? 'wwproxy' : null;
        
        if (!provider) {
          return res.status(400).json({ 
            message: 'Key phải chứa tên provider (fproxy hoặc wwproxy)' 
          });
        }

        try {
          let proxyResponse, proxyData: any;
          
          if (provider === 'fproxy') {
            proxyResponse = await fetch(`https://fproxy.me/api/getnew?api_key=${configData.configValue}&location=&ip_allow=`);
            proxyData = await proxyResponse.json() as any;
            
            // Valid if success=true OR if rate limited but has IP data
            if (!((proxyData.success && proxyData.data && proxyData.data.ip) || 
                  (!proxyData.success && proxyData.data && proxyData.data.ip && proxyData.message && proxyData.message.includes('Vui lòng chờ')))) {
              return res.status(400).json({ 
                message: proxyData.message || 'Key fproxy không hợp lệ' 
              });
            }
          } else if (provider === 'wwproxy') {
            proxyResponse = await fetch(`https://wwproxy.com/api/client/proxy/available?key=${configData.configValue}&provinceId=-1`);
            proxyData = await proxyResponse.json() as any;
            
            if (proxyData.status === 'BAD_REQUEST' && proxyData.message && proxyData.message.includes('không tồn tại')) {
              return res.status(400).json({ 
                message: proxyData.message 
              });
            }
            // For wwproxy, both OK and rate limit responses mean key is valid
            if (!(proxyData.status === 'OK' || (proxyData.status === 'BAD_REQUEST' && proxyData.message && proxyData.message.includes('Thời gian giữa hai lần')))) {
              return res.status(400).json({ 
                message: proxyData.message || 'Key wwproxy không hợp lệ' 
              });
            }
          }
        } catch (error) {
          return res.status(400).json({ 
            message: 'Không thể kiểm tra key proxy' 
          });
        }
      }
      
      const config = await storage.createSystemConfig(configData);
      
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'CONFIG_CREATE',
        description: `Tạo cấu hình hệ thống: ${config.configKey}`,
        ipAddress: req.ip || 'unknown'
      });

      res.json(config);
    } catch (error) {
      res.status(400).json({ message: 'Không thể tạo cấu hình hệ thống' });
    }
  });

  app.put("/api/system-config/:id", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      // Get current config to check if it's a proxy_key
      const currentConfig = await storage.getSystemConfigById(id);
      if (!currentConfig) {
        return res.status(404).json({ message: 'Cấu hình không tồn tại' });
      }

      // Don't allow editing proxy_key configs
      if (currentConfig.configType === 'proxy_key') {
        return res.status(400).json({ message: 'Không thể chỉnh sửa cấu hình proxy key. Vui lòng xóa và tạo mới.' });
      }

      const config = await storage.updateSystemConfig(id, updates);
      
      if (!config) {
        return res.status(404).json({ message: 'Cấu hình không tồn tại' });
      }

      await storage.createAuditLog({
        userId: req.user.id,
        action: 'CONFIG_UPDATE',
        description: `Cập nhật cấu hình hệ thống: ${config.configKey}`,
        ipAddress: req.ip || 'unknown'
      });

      res.json(config);
    } catch (error) {
      res.status(400).json({ message: 'Không thể cập nhật cấu hình hệ thống' });
    }
  });

  app.delete("/api/system-config/:id", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteSystemConfig(id);
      
      if (success) {
        await storage.createAuditLog({
          userId: req.user.id,
          action: 'CONFIG_DELETE',
          description: `Xóa cấu hình hệ thống`,
          ipAddress: req.ip || 'unknown'
        });

        res.json({ message: 'Xóa cấu hình thành công' });
      } else {
        res.status(400).json({ message: 'Không thể xóa cấu hình' });
      }
    } catch (error) {
      res.status(400).json({ message: 'Không thể xóa cấu hình' });
    }
  });

  // Shopee Cookie Pairs routes (Super Admin only)
  app.get("/api/cookie-pairs", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const isValid = req.query.isValid !== undefined ? req.query.isValid === 'true' : undefined;
      const pairs = await storage.getCookiePairs(isValid);
      res.json(pairs);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải cookie pairs' });
    }
  });

  app.post("/api/cookie-pairs", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const { spcSt, spcScSession } = req.body;
      
      if (!spcSt || !spcScSession) {
        return res.status(400).json({ message: 'SPC_ST và SPC_SC_SESSION là bắt buộc' });
      }

      const pair = await storage.createCookiePair({
        spcSt,
        spcScSession,
        source: 'manual',
        isValid: true,
      });

      await storage.createAuditLog({
        userId: req.user.id,
        action: 'COOKIE_PAIR_CREATE',
        description: `Tạo cookie pair mới (manual)`,
        ipAddress: req.ip || 'unknown'
      });

      res.json(pair);
    } catch (error) {
      console.error('Error creating cookie pair:', error);
      res.status(400).json({ message: 'Không thể tạo cookie pair. Cookie có thể đã tồn tại.' });
    }
  });

  app.post("/api/cookie-pairs/auto-fetch", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      console.log(`[API] Auto-fetch cookie pairs triggered by user ${req.user.id}`);
      
      // Run auto-fetch in background
      const result = await storage.autoFetchCookiePairsFromDatabase();

      await storage.createAuditLog({
        userId: req.user.id,
        action: 'COOKIE_PAIR_AUTO_FETCH',
        description: `Auto-fetch cookie pairs: ${result.success} thành công, ${result.failed} thất bại, ${result.skipped} bỏ qua`,
        ipAddress: req.ip || 'unknown'
      });

      res.json({
        message: 'Auto-fetch hoàn tất',
        ...result
      });
    } catch (error) {
      console.error('Error auto-fetching cookie pairs:', error);
      res.status(500).json({ message: 'Không thể auto-fetch cookie pairs' });
    }
  });

  app.delete("/api/cookie-pairs/:id", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCookiePair(id);

      await storage.createAuditLog({
        userId: req.user.id,
        action: 'COOKIE_PAIR_DELETE',
        description: `Xóa cookie pair #${id}`,
        ipAddress: req.ip || 'unknown'
      });

      res.json({ message: 'Xóa cookie pair thành công' });
    } catch (error) {
      res.status(400).json({ message: 'Không thể xóa cookie pair' });
    }
  });

  // Email addition routes
  app.get("/api/email-additions", authenticateToken, async (req: any, res) => {
    try {
      const emailAdditions = await storage.getEmailAdditionsByUser(req.user.id);
      res.json(emailAdditions);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải lịch sử thêm email' });
    }
  });

  app.post("/api/email-additions/bulk", authenticateTokenOrApiKey, checkApiKeyPermission('email_service'), async (req: any, res) => {
    try {
      const { entries } = req.body;
      const userIP = getUserIP(req);
      
      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: 'Dữ liệu đầu vào không hợp lệ' });
      }

      // Check service pricing for email addition
      const emailServicePricing = await storage.getServicePricing('email_addition');
      const emailServiceCost = emailServicePricing ? parseFloat(emailServicePricing.price) : 100;

      // TRỪ TIỀN TRƯỚC - Charge upfront for email addition
      const totalCost = entries.length * emailServiceCost;
      const userBalance = await storage.getUserBalance(req.user.id);

      if (userBalance < totalCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND, có ${userBalance.toLocaleString('vi-VN')} VND` 
        });
      }

      // Deduct balance upfront
      await storage.updateUserBalance(req.user.id, userBalance - totalCost);

      // Create upfront transaction
      await storage.createTransaction({
        userId: req.user.id,
        type: 'email_service',
        amount: (-totalCost).toString(),
        description: `Thêm ${entries.length} email vào tài khoản Shopee (trừ tiền trước)`,
        status: 'completed'
      });

      // Get active HTTP proxies for rotation
      const httpProxies = await storage.getAllHttpProxies();
      const activeHttpProxies = httpProxies.filter(proxy => proxy.isActive);
      
      // Proxy rotation counter for better distribution
      let proxyCounter = 0;
      
      // Dedup map for cookie values in this request to prevent DB races
      const cookieIdMap = new Map<string, string>();
      
      // Parse entries first
      const processedEntries = [];
      for (const entry of entries) {
        let cookie, email, proxy;
        
        // Handle both string and object formats
        if (typeof entry === 'string') {
          const parts = entry.split('|');
          cookie = parts[0];
          email = parts[1];
          proxy = parts[2] || null;
        } else {
          cookie = entry.cookie;
          email = entry.email;
          proxy = entry.proxy || null;
        }
        
        processedEntries.push({ cookie, email, proxy });
      }

      // Helper function to process a single entry
      const processEntry = async (processedEntry: any, index: number) => {
        const { cookie, email, proxy } = processedEntry;
        
        let proxyDict = null;
        let usedProxy = '';

        // Use provided proxy first
        if (proxy) {
          const parsedProxy = parseProxy(proxy);
          if (parsedProxy) {
            proxyDict = {
              ip: parsedProxy.host,
              port: parsedProxy.port,
              type: parsedProxy.protocol,
              auth: parsedProxy.auth
            };
            usedProxy = proxy;
          }
        }
        
        // Fallback to HTTP proxy rotation if no proxy provided
        if (!proxyDict && activeHttpProxies.length > 0) {
          const selectedProxy = activeHttpProxies[proxyCounter % activeHttpProxies.length];
          proxyCounter++;
          
          proxyDict = {
            ip: selectedProxy.ip,
            port: selectedProxy.port.toString(),
            type: 'http',
            auth: {
              username: selectedProxy.username,
              password: selectedProxy.password
            }
          };
          usedProxy = `http://${selectedProxy.ip}:${selectedProxy.port}`;
          
          // Update proxy usage (non-blocking)
          storage.updateHttpProxyUsage(selectedProxy.id).catch(e => 
            console.error('Proxy usage update error:', e)
          );
        }

        // Generate cookie ID and preview
        const cookieId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const cookiePreview = cookie;

        try {
          // Call email addition function
          const result = await addMailingAddress(cookie, email, proxyDict);
          
          // Save result to database
          await storage.createEmailAddition({
            userId: req.user.id,
            cookieId,
            cookiePreview,
            email,
            status: result.status,
            message: result.message,
            proxy: usedProxy || undefined,
            userIp: userIP
          });

          // Auto-add successful cookie to cookie manager (with dedup)
          if (result.status) {
            try {
              // Check in-request dedup map first to prevent DB races
              if (cookieIdMap.has(cookie)) {
                console.log(`Using cached cookie ID from request: ${cookieIdMap.get(cookie)}`);
              } else {
                // Check if cookie already exists in DB
                const existingCookies = await storage.getShopeeCookiesByUser(req.user.id);
                const existingCookie = existingCookies.find(c => c.cookieValue === cookie);
                
                if (existingCookie) {
                  cookieIdMap.set(cookie, existingCookie.id);
                } else {
                  // Determine cookie type based on content
                  let cookieType: 'SPC_F' | 'SPC_ST' = 'SPC_ST';
                  if (cookie.includes('SPC_F=')) {
                    cookieType = 'SPC_F';
                  }

                  // Add cookie to manager
                  const newCookie = await storage.createShopeeCookie({
                    userId: req.user.id,
                    cookieType,
                    cookieValue: cookie,
                    shopeeRegion: 'VN'
                  });
                  
                  cookieIdMap.set(cookie, newCookie.id);
                  console.log(`Auto-added cookie ${cookieId} to cookie manager`);
                }
              }
            } catch (error) {
              console.log(`Error auto-adding cookie to manager: ${error}`);
              // Don't fail the entire process if cookie addition fails
            }
          }

          return {
            cookieId,
            email,
            status: result.status,
            message: result.message,
            proxy: usedProxy
          };

        } catch (error) {
          // Save failed result
          await storage.createEmailAddition({
            userId: req.user.id,
            cookieId,
            cookiePreview,
            email,
            status: false,
            message: `Lỗi xử lý: ${error}`,
            proxy: usedProxy || undefined,
            userIp: userIP
          });

          return {
            cookieId,
            email,
            status: false,
            message: `Lỗi xử lý: ${error}`,
            proxy: usedProxy
          };
        }
      };

      // PARALLEL PROCESSING WITH BATCHING
      // Process in batches of 10 to avoid overwhelming the server
      const BATCH_SIZE = 10;
      const results: any[] = [];
      
      console.log(`[EMAIL-PARALLEL] Processing ${processedEntries.length} entries in batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < processedEntries.length; i += BATCH_SIZE) {
        const batch = processedEntries.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map((entry: any, batchIndex: number) => 
          processEntry(entry, i + batchIndex)
        );
        
        console.log(`[EMAIL-PARALLEL] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, entries ${i + 1}-${Math.min(i + BATCH_SIZE, processedEntries.length)}`);
        
        // Wait for all promises in this batch to settle
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results
        batchResults.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            console.error(`Batch entry ${i + idx + 1} failed:`, result.reason);
            results.push({
              cookieId: `EMAIL_${Date.now()}_${i + idx}`,
              email: batch[idx]?.email || 'unknown',
              status: false,
              message: result.reason?.message || 'Lỗi không xác định',
              proxy: ''
            });
          }
        });
        
        console.log(`[EMAIL-PARALLEL] Batch complete. Total results so far: ${results.length}/${processedEntries.length}`);
      }

      const successfulEntries = results.filter(r => r.status).length;
      const failedCount = entries.length - successfulEntries;

      console.log(`[EMAIL-ADDITION] Results - Total: ${entries.length}, Success: ${successfulEntries}, Failed: ${failedCount}`);

      // HOÀN TIỀN CHO CÁC ENTRY THẤT BẠI - Refund for failed entries
      if (failedCount > 0) {
        const refundAmount = failedCount * emailServiceCost;
        const currentBalance = await storage.getUserBalance(req.user.id);
        const newBalance = currentBalance + refundAmount;
        
        console.log(`[EMAIL-ADDITION-REFUND] Refunding ${failedCount} failed entries: ${refundAmount.toLocaleString('vi-VN')} VND`);
        console.log(`[EMAIL-ADDITION-REFUND] Balance: ${currentBalance.toLocaleString('vi-VN')} → ${newBalance.toLocaleString('vi-VN')} VND`);
        
        await storage.updateUserBalance(req.user.id, newBalance);
        
        // Create refund transaction with balance tracking
        await storage.createTransaction({
          userId: req.user.id,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền thêm email (${failedCount}/${entries.length} entry thất bại)`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: newBalance.toString()
        });
        
        console.log(`[EMAIL-ADDITION-REFUND] ✓ Refund completed successfully`);
      } else {
        console.log(`[EMAIL-ADDITION] ✓ All ${entries.length} entries successful - no refund needed`);
      }

      // Create service usage for successful entries only
      if (successfulEntries > 0) {
        await storage.createServiceUsage({
          userId: req.user.id,
          serviceType: 'email_addition',
          serviceName: 'Thêm Email Shopee',
          description: `Thêm ${successfulEntries} email thành công`,
          status: 'success',
          cost: (successfulEntries * emailServiceCost).toString()
        });
      }

      res.json(results);
    } catch (error) {
      console.error('[EMAIL-ADDITION-ERROR] System error occurred:', error);
      
      // HOÀN TIỀN TOÀN BỘ KHI LỖI HỆ THỐNG - Full refund on system error
      try {
        console.log(`[EMAIL-ADDITION-ERROR] Initiating full refund for system error...`);
        
        // Get service pricing for refund calculation
        const emailServicePricing = await storage.getServicePricing('email_addition');
        const emailServiceCost = emailServicePricing ? parseFloat(emailServicePricing.price) : 100;
        
        const entries = req.body.entries || [];
        const refundAmount = entries.length * emailServiceCost;
        const currentBalance = await storage.getUserBalance(req.user.id);
        const refundBalance = currentBalance + refundAmount;
        
        console.log(`[EMAIL-ADDITION-ERROR] Refunding all ${entries.length} entries: ${refundAmount.toLocaleString('vi-VN')} VND`);
        console.log(`[EMAIL-ADDITION-ERROR] Balance: ${currentBalance.toLocaleString('vi-VN')} → ${refundBalance.toLocaleString('vi-VN')} VND`);
        
        await storage.updateUserBalance(req.user.id, refundBalance);
        
        // QUAN TRỌNG: Cung cấp balance manually để tránh cộng tiền 2 lần
        await storage.createTransaction({
          userId: req.user.id,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền thêm email - lỗi hệ thống (${entries.length} entries)`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: refundBalance.toString(),
          reference: `email_system_error_refund_${Date.now()}`
        });
        
        console.log(`[EMAIL-ADDITION-ERROR] ✓ Full refund completed successfully`);
      } catch (refundError) {
        console.error('[EMAIL-ADDITION-ERROR] ❌ CRITICAL: Refund failed!', refundError);
        console.error('[EMAIL-ADDITION-ERROR] Manual intervention required for user:', req.user.id);
      }
      
      res.status(500).json({ 
        message: 'Lỗi hệ thống. Toàn bộ số tiền đã được hoàn lại vào tài khoản của bạn.',
        refunded: true
      });
    }
  });

  // Analytics routes (Admin and Superadmin only)
  app.get("/api/analytics/revenue", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Getting revenue data...');
      
      // Get all transactions from the last 30 days
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const allTransactions = await storage.getTransactionsByDateRange(startDate, endDate);
      
      // Group transactions by date and calculate REAL revenue/expense
      const revenueMap = new Map();
      
      allTransactions.forEach(transaction => {
        const date = transaction.createdAt.toISOString().split('T')[0];
        if (!revenueMap.has(date)) {
          revenueMap.set(date, {
            date,
            revenue: 0,
            expense: 0,
            transaction_count: 0
          });
        }
        
        const dayData = revenueMap.get(date);
        const amount = parseFloat(transaction.amount);
        
        // DOANH THU THỰC: tiền user trả cho dịch vụ thành công (trừ hoàn tiền)
        if (amount < 0 && transaction.type && !transaction.type.includes('refund') && !transaction.type.includes('admin')) {
          // Dịch vụ thực tế user trả = doanh thu
          dayData.revenue += Math.abs(amount);
        } else if (transaction.type && transaction.type.includes('refund') && amount > 0) {
          // Hoàn tiền = giảm doanh thu thực tế (không cho phép âm)
          dayData.revenue = Math.max(0, dayData.revenue - amount);
        }
        
        // CHI TIÊU: không cần tính vì expense = revenue trong context này
        
        dayData.transaction_count += 1;
      });
      
      const revenueData = Array.from(revenueMap.values())
        .sort((a, b) => b.date.localeCompare(a.date));
      
      console.log('[Analytics] Revenue data:', revenueData.length, 'records');
      res.json(revenueData);
    } catch (error) {
      console.error('Revenue analytics error:', error);
      res.status(500).json({ message: 'Không thể tải dữ liệu doanh thu' });
    }
  });

  app.get("/api/analytics/topup-history", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Getting top-up history...');
      
      // Get all top-up requests from the last 30 days
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const allTopupRequests = await storage.getTopupRequestsByDateRange(startDate, endDate);
      
      // Group by date and calculate statistics
      const topupMap = new Map();
      
      allTopupRequests.forEach(request => {
        const date = request.createdAt.toISOString().split('T')[0];
        if (!topupMap.has(date)) {
          topupMap.set(date, {
            date,
            total_amount: 0,
            completed_amount: 0, // Thêm completed_amount
            completed_count: 0,
            pending_count: 0,
            cancelled_count: 0,
            total_count: 0
          });
        }
        
        const dayData = topupMap.get(date);
        dayData.total_amount += request.amount; // Tổng tất cả
        dayData.total_count += 1;
        
        switch (request.status) {
          case 'completed':
            dayData.completed_count += 1;
            dayData.completed_amount += request.amount; // Chỉ tính completed
            break;
          case 'pending':
            dayData.pending_count += 1;
            break;
          case 'cancelled':
            dayData.cancelled_count += 1;
            break;
        }
      });
      
      const topupHistory = Array.from(topupMap.values())
        .sort((a, b) => b.date.localeCompare(a.date));
      
      console.log('[Analytics] Top-up history:', topupHistory.length, 'records');
      res.json(topupHistory);
    } catch (error) {
      console.error('Top-up analytics error:', error);
      res.status(500).json({ message: 'Không thể tải dữ liệu nạp tiền' });
    }
  });

  // Export analytics data to CSV
  app.get("/api/analytics/export", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Exporting analytics data to CSV...');
      
      // Get date range from query parameters or default to last 30 days
      const { startDate: startDateParam, endDate: endDateParam } = req.query;
      
      let startDate: Date, endDate: Date;
      
      if (startDateParam && endDateParam) {
        startDate = new Date(startDateParam as string);
        endDate = new Date(endDateParam as string);
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
        console.log(`[Analytics] Using custom date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      } else {
        endDate = new Date();
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        console.log(`[Analytics] Using default date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      }
      
      // Get detailed transaction data
      const allTransactions = await storage.getTransactionsByDateRange(startDate, endDate);
      const allTopupRequests = await storage.getTopupRequestsByDateRange(startDate, endDate);
      
      // Get all users for username mapping
      const allUsers = await storage.getAllUsers();
      const userMap = new Map();
      allUsers.forEach(user => {
        userMap.set(user.id, user.username);
      });
      
      // 🚀 OPTIMIZED: Query only data within date range (no filter needed)
      console.log('[Analytics] Fetching data directly by date range...');
      const phoneChecks = await storage.getPhoneChecksByDateRange(startDate, endDate);
      const accountChecks = await storage.getAccountChecksByDateRange(startDate, endDate);
      const trackingChecks = await storage.getTrackingChecksByDateRange(startDate, endDate);
      const cookieExtractions = await storage.getCookieExtractionsByDateRange(startDate, endDate);
      const phoneRentals = await storage.getPhoneRentalHistoryWithFilter({ 
        limit: 50000, 
        startDate: startDate, 
        endDate: endDate 
      });
      const tiktokRentals = await storage.getTiktokRentalsWithFilter({ 
        limit: 50000,
        startDate: startDate,
        endDate: endDate
      });
      const emailAdditions = await storage.getEmailAdditionsByDateRange(startDate, endDate);
      const expressTrackingChecks = await storage.getExpressTrackingChecksByDateRange(startDate, endDate);
      const freeshipVoucherUsage = await storage.getFreeshipVoucherUsageByDateRange(startDate, endDate);
      const voucherSavingOperations = await storage.getVoucherSavingOperationsByDateRange(startDate, endDate);
      const cookieRapidChecks = await storage.getCookieRapidChecksByDateRange(startDate, endDate);
      console.log('[Analytics] Data fetched:', {
        phoneChecks: phoneChecks.length,
        accountChecks: accountChecks.length,
        trackingChecks: trackingChecks.length,
        phoneRentals: phoneRentals.length,
        tiktokRentals: tiktokRentals.length
      });
      
      // Helper function to get unique first-time successful cookie rapid checks from ALL data
      const getUniqueFirstSuccessfulCookieChecks = (allChecks: any[]) => {
        // UPDATED: Filter userId khác 3 và có shipping_phone
        const successfulChecks = allChecks.filter(c => 
          c.userId !== 3 && 
          (c.shippingPhone || c.shipping_phone)
        );
        
        // Group by order_id, chỉ lấy lần đầu tiên của mỗi order_id
        const seenOrderIds = new Set();
        const uniqueChecks: any[] = [];
        
        successfulChecks.forEach(check => {
          const orderId = check.orderId || check.order_id;
          if (orderId && !seenOrderIds.has(orderId)) {
            seenOrderIds.add(orderId);
            uniqueChecks.push(check);
          }
        });
        
        return uniqueChecks;
      };
      
      // Get unique first successes from ALL cookie rapid checks (for accurate stats)
      const allCookieRapidChecks = await storage.getAllCookieRapidChecks();
      const allUniqueFirstSuccesses = getUniqueFirstSuccessfulCookieChecks(allCookieRapidChecks);
      
      // 🚀 NO FILTERING NEEDED - Data already filtered by date range at query time
      const periodPhoneChecks = phoneChecks;
      const periodAccountChecks = accountChecks;
      const periodTrackingChecks = trackingChecks;
      const periodCookieExtractions = cookieExtractions;
      const periodPhoneRentals = phoneRentals;
      const periodTiktokRentals = tiktokRentals;
      const periodEmailAdditions = emailAdditions;
      const periodExpressTrackingChecks = expressTrackingChecks;
      const periodFreeshipVoucherUsage = freeshipVoucherUsage;
      const periodVoucherSavingOperations = voucherSavingOperations;
      const periodCookieRapidChecks = cookieRapidChecks;
      
      // Calculate profit for each service (only successful operations) for CSV - APPLY NEW SUCCESS CRITERIA
      // Kiểm tra số điện thoại: user_id khác 3, 2650, 2603 VÀ cost = 100
      const csvSuccessfulPhoneChecks = periodPhoneChecks.filter(p => 
        p.userId !== 3 && p.userId !== 2650 && p.userId !== 2603 && p.cost === 100
      );
      
      // Kiểm tra tài khoản: user_id khác 3 VÀ status = TRUE
      const csvSuccessfulAccountChecks = periodAccountChecks.filter(a => 
        a.userId !== 3 && a.status === true
      );
      
      // Theo dõi đơn hàng: user_id khác 3 VÀ status = TRUE
      const csvSuccessfulTrackingChecks = periodTrackingChecks.filter(t => 
        t.userId !== 3 && t.status === true
      );
      
      // Lấy Cookie SPC_ST: user_id khác 3 VÀ status = 'success'
      const csvSuccessfulCookieExtractions = periodCookieExtractions.filter(c => 
        c.userId !== 3 && c.status === 'success'
      );
      
      // Thêm Email: user_id khác 3 VÀ status = TRUE
      const csvSuccessfulEmailAdditions = periodEmailAdditions.filter(e => 
        e.userId !== 3 && e.status === true
      );
      
      // Lưu Voucher Freeship: user_id khác 3 VÀ successful_saves >= 1
      const csvSuccessfulVoucherSavingOperations = periodVoucherSavingOperations.filter(v => 
        v.userId !== 3 && v.successfulSaves >= 1
      );
      
      // Check Voucher Hỏa Tốc: user_id khác 3, shipping_phone khác NULL, chỉ tính order_id đầu tiên
      const cookieRapidWithShipping = periodCookieRapidChecks.filter(c => 
        c.userId !== 3 && (c.shippingPhone || c.shipping_phone)
      );
      // Loại bỏ các order_id trùng lặp, chỉ giữ lại lần đầu tiên
      const seenOrderIds = new Set();
      const csvSuccessfulCookieRapidChecks = cookieRapidWithShipping.filter(c => {
        const orderId = c.orderId || c.order_id;
        if (!orderId || seenOrderIds.has(orderId)) {
          return false;
        }
        seenOrderIds.add(orderId);
        return true;
      });
      
      // Thuê số TikTok: user_id khác 3 VÀ otp_code khác NULL
      const csvSuccessfulTiktokRentals = periodTiktokRentals.filter(r => 
        r.userId !== 3 && r.otpCode
      );
      
      // Thuê số Shopee: otp_code khác NULL (phân chia theo version)
      const csvSuccessfulPhoneRentals = periodPhoneRentals.filter(r => r.otpCode);
      
      const csvSuccessfulExpressTrackingChecks = periodExpressTrackingChecks.filter(e => e.status === 'success' || e.status === 'completed');
      const csvSuccessfulFreeshipVoucherUsage = periodFreeshipVoucherUsage.filter(f => f.status === 'used');
      
      // Calculate successful topups
      const successfulTopups = allTopupRequests.filter(request => request.status === 'completed');
      const totalSuccessfulAmount = successfulTopups.reduce((sum, request) => sum + (parseFloat(request.amount.toString()) || 0), 0);
      const successfulTopupCount = successfulTopups.length;
      
      // Create CSV data array with all 4 sheets
      const csvData = [];
      
      // ============== SHEET 1: NẠP TIỀN ==============
      csvData.push('SHEET 1: NẠP TIỀN');
      csvData.push('');
      csvData.push('Ngày giờ nạp,ID khách hàng / username,Phương thức thanh toán,Số tiền nạp (VND),Mã giao dịch / ref code,Tình trạng,Ghi chú');
      
      allTopupRequests.forEach(request => {
        const username = userMap.get(request.userId) || `ID-${request.userId}`;
        const datetime = new Date(request.createdAt).toLocaleString('vi-VN');
        const paymentMethod = 'QR Code - MB Bank';
        const status = request.status === 'completed' ? 'Thành công' : 
                      request.status === 'pending' ? 'Chờ xác nhận' : 'Lỗi';
        const note = request.description || (request.status === 'completed' ? 'Nạp tiền thành công' : 'Hết hạn hoặc bị hủy');
        
        csvData.push(`"${datetime}","${username}","${paymentMethod}","${request.amount}","${request.id || ''}","${status}","${note}"`);
      });
      
      csvData.push('');
      csvData.push('');
      
      // ============== SHEET 2: DỊCH VỤ ==============
      csvData.push('SHEET 2: DỊCH VỤ');
      csvData.push('');
      csvData.push('Ngày giờ sử dụng,ID khách hàng / username,Tên dịch vụ,Số lượng thao tác,Giá/lượt (VND),Tổng chi phí dịch vụ,Kết quả,Ghi chú');
      
      // UPDATED: Add phone rental services - Apply new success criteria and pricing
      // Shopee rentals: chỉ tính nếu có otpCode
      periodPhoneRentals.forEach(rental => {
        // Skip if no OTP code (not successful)
        if (!rental.otpCode) return;
        
        const username = userMap.get(rental.userId) || `ID-${rental.userId}`;
        const datetime = new Date(rental.createdAt).toLocaleString('vi-VN');
        const actualService = rental.service || rental.serviceType || 'otissim_v1';
        const serviceName = actualService === 'otissim_v1' ? 'Thuê số Shopee V1' :
                           actualService === 'otissim_v2' ? 'Thuê số Shopee V2' :
                           actualService === 'otissim_v3' ? 'Thuê số Shopee V3' : 'Thuê số Shopee';
        // UPDATED PRICES: v1/v2 = 400đ, v3 = 200đ
        const price = actualService === 'otissim_v3' ? '200' : '400';
        const result = 'Thành công';
        const note = `Số thuê: ${rental.phoneNumber}, OTP: ${rental.otpCode}`;
        
        csvData.push(`"${datetime}","${username}","${serviceName}","1","${price}","${price}","${result}","${note}"`);
      });
      
      // TikTok rentals: userId khác 3 VÀ có otpCode
      periodTiktokRentals.forEach(rental => {
        // Skip if userId = 3 or no OTP code
        if (rental.userId === 3 || !rental.otpCode) return;
        
        const username = userMap.get(rental.userId) || `ID-${rental.userId}`;
        const datetime = new Date(rental.createdAt).toLocaleString('vi-VN');
        const serviceName = 'Thuê số TikTok';
        const price = '100'; // UPDATED PRICE: 100đ
        const result = 'Thành công';
        const note = `Số thuê: ${rental.phoneNumber}, OTP: ${rental.otpCode}`;
        
        csvData.push(`"${datetime}","${username}","${serviceName}","1","${price}","${price}","${result}","${note}"`);
      });
      
      // UPDATED: Add other services - Apply new success criteria, only successful operations
      // 1. Kiểm tra số điện thoại: userId khác 3, 2650, 2603 VÀ cost = 100
      csvSuccessfulPhoneChecks.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const quantity = item.phoneNumbers ? item.phoneNumbers.length : 1;
        const totalCost = quantity * 100;
        const note = item.result || item.description || 'Kiểm tra thành công';
        
        csvData.push(`"${datetime}","${username}","Kiểm tra số điện thoại","${quantity}","100","${totalCost}","Thành công","${note}"`);
      });
      
      // 2. Kiểm tra tài khoản: userId khác 3 VÀ status = TRUE
      csvSuccessfulAccountChecks.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Kiểm tra thành công';
        
        csvData.push(`"${datetime}","${username}","Kiểm tra tài khoản","1","100","100","Thành công","${note}"`);
      });
      
      // 3. Theo dõi đơn hàng: userId khác 3 VÀ status = TRUE
      csvSuccessfulTrackingChecks.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Theo dõi thành công';
        
        csvData.push(`"${datetime}","${username}","Kiểm tra vận đơn","1","100","100","Thành công","${note}"`);
      });
      
      // 4. Lấy Cookie SPC_ST: userId khác 3 VÀ status = 'success'
      csvSuccessfulCookieExtractions.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Lấy cookie thành công';
        
        csvData.push(`"${datetime}","${username}","Lấy Cookie SPC_ST","1","100","100","Thành công","${note}"`);
      });
      
      // 5. Thêm Email: userId khác 3 VÀ status = TRUE
      csvSuccessfulEmailAdditions.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Thêm email thành công';
        
        csvData.push(`"${datetime}","${username}","Thêm Email","1","100","100","Thành công","${note}"`);
      });
      
      // 6. Check Cookie Hỏa Tốc
      csvSuccessfulExpressTrackingChecks.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Check thành công';
        
        csvData.push(`"${datetime}","${username}","Check Cookie Hỏa Tốc","1","500","500","Thành công","${note}"`);
      });
      
      // 7. Lấy Mã Freeship (Cũ): status = 'used'
      csvSuccessfulFreeshipVoucherUsage.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Lấy voucher thành công';
        
        csvData.push(`"${datetime}","${username}","Lấy Mã Freeship (Cũ)","1","2000","2000","Thành công","${note}"`);
      });
      
      // 8. Lưu Voucher Freeship: userId khác 3 VÀ successSaves = 1
      csvSuccessfulVoucherSavingOperations.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Lưu voucher thành công';
        
        csvData.push(`"${datetime}","${username}","Lưu Voucher Freeship","1","2000","2000","Thành công","${note}"`);
      });
      
      // 9. Check Voucher Hỏa Tốc: userId khác 3, shipping_phone khác NULL, chỉ order_id đầu tiên
      csvSuccessfulCookieRapidChecks.forEach(item => {
        const username = userMap.get(item.userId) || `ID-${item.userId}`;
        const datetime = new Date(item.createdAt || item.checkedAt).toLocaleString('vi-VN');
        const note = item.result || item.description || 'Check voucher thành công';
        
        csvData.push(`"${datetime}","${username}","Check Voucher Hỏa Tốc","1","500","500","Thành công","${note}"`);
      });
      
      csvData.push('');
      csvData.push('');
      
      // ============== SHEET 3: TỔNG HỢP ==============
      csvData.push('SHEET 3: TỔNG HỢP');
      csvData.push('');
      csvData.push('Chỉ số,Giá trị');
      
      // UPDATED: Calculate totals using NEW SUCCESS CRITERIA
      const totalServiceRevenue = allTransactions
        .filter(t => t.amount && parseFloat(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
      
      // Build service stats from successful operations counts
      const serviceStats = new Map();
      serviceStats.set('Kiểm tra số điện thoại', { count: csvSuccessfulPhoneChecks.length, revenue: csvSuccessfulPhoneChecks.length * 100 });
      serviceStats.set('Kiểm tra tài khoản', { count: csvSuccessfulAccountChecks.length, revenue: csvSuccessfulAccountChecks.length * 100 });
      serviceStats.set('Theo dõi đơn hàng', { count: csvSuccessfulTrackingChecks.length, revenue: csvSuccessfulTrackingChecks.length * 100 });
      serviceStats.set('Lấy Cookie SPC_ST', { count: csvSuccessfulCookieExtractions.length, revenue: csvSuccessfulCookieExtractions.length * 100 });
      serviceStats.set('Thêm Email', { count: csvSuccessfulEmailAdditions.length, revenue: csvSuccessfulEmailAdditions.length * 100 });
      serviceStats.set('Check Cookie Hỏa Tốc', { count: csvSuccessfulExpressTrackingChecks.length, revenue: csvSuccessfulExpressTrackingChecks.length * 500 });
      serviceStats.set('Lấy Mã Freeship (Cũ)', { count: csvSuccessfulFreeshipVoucherUsage.length, revenue: csvSuccessfulFreeshipVoucherUsage.length * 2000 });
      serviceStats.set('Lưu Voucher Freeship', { count: csvSuccessfulVoucherSavingOperations.length, revenue: csvSuccessfulVoucherSavingOperations.length * 2000 });
      serviceStats.set('Check Voucher Hỏa Tốc', { count: csvSuccessfulCookieRapidChecks.length, revenue: csvSuccessfulCookieRapidChecks.length * 500 });
      serviceStats.set('Thuê số TikTok', { count: csvSuccessfulTiktokRentals.length, revenue: csvSuccessfulTiktokRentals.length * 100 });
      
      // Add Shopee rentals by version
      const v1Count = csvSuccessfulPhoneRentals.filter(r => (r.service || r.serviceType || 'otissim_v1') === 'otissim_v1').length;
      const v2Count = csvSuccessfulPhoneRentals.filter(r => (r.service || r.serviceType) === 'otissim_v2').length;
      const v3Count = csvSuccessfulPhoneRentals.filter(r => (r.service || r.serviceType) === 'otissim_v3').length;
      serviceStats.set('Thuê số Shopee v1', { count: v1Count, revenue: v1Count * 400 });
      serviceStats.set('Thuê số Shopee v2', { count: v2Count, revenue: v2Count * 400 });
      serviceStats.set('Thuê số Shopee v3', { count: v3Count, revenue: v3Count * 200 });
      
      // Find most used service
      const mostUsedService = Array.from(serviceStats.entries())
        .sort((a, b) => b[1].count - a[1].count)[0];
      
      // Find top user by deposits
      const userDeposits = new Map();
      successfulTopups.forEach(topup => {
        const username = userMap.get(topup.userId) || `ID-${topup.userId}`;
        const current = userDeposits.get(username) || 0;
        userDeposits.set(username, current + parseFloat(topup.amount.toString()));
      });
      const topUser = Array.from(userDeposits.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      // Calculate error rate (based on all operations vs successful)
      const totalServiceUsage = Array.from(serviceStats.values()).reduce((sum, s) => sum + s.count, 0);
      const allOperations = periodPhoneRentals.length + periodTiktokRentals.length + periodPhoneChecks.length + 
                           periodAccountChecks.length + periodTrackingChecks.length + periodCookieExtractions.length + 
                           periodEmailAdditions.length + periodExpressTrackingChecks.length + periodFreeshipVoucherUsage.length +
                           periodVoucherSavingOperations.length + periodCookieRapidChecks.length;
      const errorCount = allOperations - totalServiceUsage;
      const errorRate = allOperations > 0 ? ((errorCount / allOperations) * 100).toFixed(2) : '0';
      
      // Calculate profit by service type (only for successful operations)
      const csvServiceProfits = {
        'Kiểm tra số điện thoại': csvSuccessfulPhoneChecks.length * 100,
        'Kiểm tra tài khoản': csvSuccessfulAccountChecks.length * 100,
        'Theo dõi đơn hàng': csvSuccessfulTrackingChecks.length * 100,
        'Lấy Cookie SPC_ST': csvSuccessfulCookieExtractions.length * 100,
        'Thêm Email': csvSuccessfulEmailAdditions.length * 100,
        'Check Cookie Hỏa Tốc': csvSuccessfulExpressTrackingChecks.length * 500,
        'Lấy Mã Freeship (Cũ)': csvSuccessfulFreeshipVoucherUsage.length * 2000,
        'Lưu Voucher Freeship': csvSuccessfulVoucherSavingOperations.length * 2000,
        'Check Voucher Hỏa Tốc': csvSuccessfulCookieRapidChecks.length * 500,
        'Thuê số TikTok': csvSuccessfulTiktokRentals.length * 100,
        'Thuê số Shopee v1': 0,
        'Thuê số Shopee v2': 0,
        'Thuê số Shopee v3': 0
      };
      
      // Calculate phone rental profits by version for CSV - UPDATED PRICES
      csvSuccessfulPhoneRentals.forEach(rental => {
        const actualService = rental.service || rental.serviceType || 'otissim_v1';
        if (actualService === 'otissim_v1') {
          csvServiceProfits['Thuê số Shopee v1'] += 400;
        } else if (actualService === 'otissim_v2') {
          csvServiceProfits['Thuê số Shopee v2'] += 400;
        } else if (actualService === 'otissim_v3') {
          csvServiceProfits['Thuê số Shopee v3'] += 200;
        }
      });
      
      const csvTotalProfit = Object.values(csvServiceProfits).reduce((sum, profit) => sum + profit, 0);
      
      csvData.push(`"Tổng tiền nạp","${totalSuccessfulAmount.toLocaleString('vi-VN')} VND"`);
      csvData.push(`"Tổng tiền sử dụng dịch vụ","${totalServiceRevenue.toLocaleString('vi-VN')} VND"`);
      csvData.push(`"Lợi nhuận ròng","${(totalSuccessfulAmount - totalServiceRevenue).toLocaleString('vi-VN')} VND"`);
      csvData.push(`"",""`); // Empty row separator
      csvData.push(`"LỢI NHUẬN TỪNG DỊCH VỤ (chỉ tính thành công)",""`);
      csvData.push(`"Kiểm tra số điện thoại","${csvServiceProfits['Kiểm tra số điện thoại'].toLocaleString('vi-VN')} VND (${csvSuccessfulPhoneChecks.length} lần × 100đ)"`);
      csvData.push(`"Kiểm tra tài khoản","${csvServiceProfits['Kiểm tra tài khoản'].toLocaleString('vi-VN')} VND (${csvSuccessfulAccountChecks.length} lần × 100đ)"`);
      csvData.push(`"Theo dõi đơn hàng","${csvServiceProfits['Theo dõi đơn hàng'].toLocaleString('vi-VN')} VND (${csvSuccessfulTrackingChecks.length} lần × 100đ)"`);
      csvData.push(`"Lấy Cookie SPC_ST","${csvServiceProfits['Lấy Cookie SPC_ST'].toLocaleString('vi-VN')} VND (${csvSuccessfulCookieExtractions.length} lần × 100đ)"`);
      csvData.push(`"Thêm Email","${csvServiceProfits['Thêm Email'].toLocaleString('vi-VN')} VND (${csvSuccessfulEmailAdditions.length} lần × 100đ)"`);
      csvData.push(`"Check Cookie Hỏa Tốc","${csvServiceProfits['Check Cookie Hỏa Tốc'].toLocaleString('vi-VN')} VND (${csvSuccessfulExpressTrackingChecks.length} lần × 500đ)"`);
      csvData.push(`"Lấy Mã Freeship (Cũ)","${csvServiceProfits['Lấy Mã Freeship (Cũ)'].toLocaleString('vi-VN')} VND (${csvSuccessfulFreeshipVoucherUsage.length} lần × 2000đ)"`);
      csvData.push(`"Lưu Voucher Freeship","${(csvServiceProfits['Lưu Voucher Freeship'] || 0).toLocaleString('vi-VN')} VND (${csvSuccessfulVoucherSavingOperations.length} lần × 2000đ)"`);
      csvData.push(`"Check Voucher Hỏa Tốc","${csvServiceProfits['Check Voucher Hỏa Tốc'].toLocaleString('vi-VN')} VND (${csvSuccessfulCookieRapidChecks.length} lần × 500đ)"`);
      csvData.push(`"Thuê số TikTok","${csvServiceProfits['Thuê số TikTok'].toLocaleString('vi-VN')} VND (${csvSuccessfulTiktokRentals.length} lần × 100đ)"`);
      csvData.push(`"Thuê số Shopee v1","${csvServiceProfits['Thuê số Shopee v1'].toLocaleString('vi-VN')} VND (${csvSuccessfulPhoneRentals.filter(r => (r.service || r.serviceType || 'otissim_v1') === 'otissim_v1').length} lần × 400đ)"`);
      csvData.push(`"Thuê số Shopee v2","${csvServiceProfits['Thuê số Shopee v2'].toLocaleString('vi-VN')} VND (${csvSuccessfulPhoneRentals.filter(r => (r.service || r.serviceType) === 'otissim_v2').length} lần × 400đ)"`);
      csvData.push(`"Thuê số Shopee v3","${csvServiceProfits['Thuê số Shopee v3'].toLocaleString('vi-VN')} VND (${csvSuccessfulPhoneRentals.filter(r => (r.service || r.serviceType) === 'otissim_v3').length} lần × 200đ)"`);
      csvData.push(`"",""`); // Empty row separator
      csvData.push(`"TỔNG LỢI NHUẬN DỊCH VỤ","${csvTotalProfit.toLocaleString('vi-VN')} VND"`);
      csvData.push(`"",""`);
      
      // ============== PHẦN VOUCHER FREESHIP - BÁO CÁO CHI TIẾT ==============
      csvData.push(`"THỐNG KÊ VOUCHER FREESHIP TỔNG HỢP",""`);
      
      // Tính tổng từ cả 2 loại voucher operations
      const totalFreeshipVouchers = periodFreeshipVoucherUsage.length;
      const successfulFreeshipVouchers = periodFreeshipVoucherUsage.filter(v => v.status === 'used').length;
      const totalVoucherSavingOps = periodVoucherSavingOperations.length;
      const successfulVoucherSavingOps = csvSuccessfulVoucherSavingOperations.length;
      
      const grandTotalVoucherOps = totalFreeshipVouchers + totalVoucherSavingOps;
      const grandSuccessfulVoucherOps = successfulFreeshipVouchers + successfulVoucherSavingOps;
      const grandFailedVoucherOps = grandTotalVoucherOps - grandSuccessfulVoucherOps;
      const grandTotalRevenue = (successfulFreeshipVouchers * 2000) + (successfulVoucherSavingOps * 2000);
      
      csvData.push(`"Tổng số lượt voucher operations","${grandTotalVoucherOps} lần"`);
      csvData.push(`"Số lượt thành công","${grandSuccessfulVoucherOps} lần (${grandTotalVoucherOps > 0 ? Math.round(grandSuccessfulVoucherOps / grandTotalVoucherOps * 100) : 0}%)"`);
      csvData.push(`"Số lượt thất bại","${grandFailedVoucherOps} lần (${grandTotalVoucherOps > 0 ? Math.round(grandFailedVoucherOps / grandTotalVoucherOps * 100) : 0}%)"`);
      csvData.push(`"Tổng doanh thu voucher freeship","${grandTotalRevenue.toLocaleString('vi-VN')} VND"`);
      
      csvData.push(`"",""`);
      csvData.push(`"CHI TIẾT TỪNG LOẠI:",""`);
      csvData.push(`"Lấy mã freeship (cũ)","${totalFreeshipVouchers} lần (${successfulFreeshipVouchers} thành công)"`);
      csvData.push(`"Lưu voucher freeship (mới)","${totalVoucherSavingOps} lần (${successfulVoucherSavingOps} thành công)"`);
      
      csvData.push(`"",""`);
      csvData.push(`"THỐNG KÊ CHECK VOUCHER HỎA TỐC",""`);
      const totalCookieRapidChecks = allUniqueFirstSuccesses.length;
      const successfulCookieRapidChecksCount = csvSuccessfulCookieRapidChecks.length;
      const failedCookieRapidChecks = totalCookieRapidChecks - successfulCookieRapidChecksCount;
      csvData.push(`"Tổng số lượt check","${totalCookieRapidChecks} lần"`);
      csvData.push(`"Số lượt thành công","${successfulCookieRapidChecksCount} lần (${totalCookieRapidChecks > 0 ? Math.round(successfulCookieRapidChecksCount / totalCookieRapidChecks * 100) : 0}%)"`);
      csvData.push(`"Số lượt thất bại","${failedCookieRapidChecks} lần (${totalCookieRapidChecks > 0 ? Math.round(failedCookieRapidChecks / totalCookieRapidChecks * 100) : 0}%)"`);
      csvData.push(`"Doanh thu từ check voucher hỏa tốc","${(successfulCookieRapidChecksCount * 500).toLocaleString('vi-VN')} VND"`);
      
      csvData.push(`"",""`);
      csvData.push(`"Dịch vụ được dùng nhiều nhất","${mostUsedService ? mostUsedService[0] : 'N/A'} (${mostUsedService ? mostUsedService[1].count : 0} lần)"`);
      csvData.push(`"Người dùng nạp nhiều nhất","${topUser ? topUser[0] : 'N/A'} (${topUser ? topUser[1].toLocaleString('vi-VN') : 0} VND)"`);
      csvData.push(`"Tỷ lệ lỗi","${errorRate}%"`);
      csvData.push(`"Khoảng thời gian","${startDate.toLocaleDateString('vi-VN')} - ${endDate.toLocaleDateString('vi-VN')}"`);
      
      csvData.push('');
      csvData.push('');
      
      // ============== SHEET 4: CHI TIẾT THEO KHÁCH HÀNG ==============
      csvData.push('SHEET 4: CHI TIẾT THEO KHÁCH HÀNG');
      csvData.push('');
      csvData.push('ID khách hàng,Tổng tiền nạp,Tổng chi phí dịch vụ,Số dư còn lại,Số lần giao dịch,Dịch vụ hay dùng');
      
      // Calculate per-user statistics
      const userStats = new Map();
      
      // Initialize with users who made deposits
      successfulTopups.forEach(topup => {
        const username = userMap.get(topup.userId) || `ID-${topup.userId}`;
        if (!userStats.has(username)) {
          userStats.set(username, {
            totalDeposit: 0,
            totalSpent: 0,
            transactionCount: 0,
            services: new Map()
          });
        }
        const stats = userStats.get(username);
        stats.totalDeposit += parseFloat(topup.amount.toString());
        stats.transactionCount += 1;
      });
      
      // Add service usage
      const allServiceUsage = [
        ...periodPhoneRentals.map(r => ({ ...r, serviceName: 'Thuê số', cost: r.serviceType === 'tiktok_sim' ? 1200 : 2100 })),
        ...periodTiktokRentals.map(r => ({ ...r, serviceName: 'Thuê số TikTok', cost: 1200 })),
        ...periodPhoneChecks.map(c => ({ ...c, serviceName: 'Kiểm tra số', cost: 100 })),
        ...periodAccountChecks.map(c => ({ ...c, serviceName: 'Kiểm tra TK', cost: 100 })),
        ...periodTrackingChecks.map(c => ({ ...c, serviceName: 'Theo dõi đơn', cost: 100 })),
        ...periodCookieExtractions.map(c => ({ ...c, serviceName: 'Lấy Cookie', cost: 100 })),
        ...periodEmailAdditions.map(e => ({ ...e, serviceName: 'Thêm Email', cost: 100 }))
      ];
      
      allServiceUsage.forEach(usage => {
        const username = userMap.get(usage.userId) || `ID-${usage.userId}`;
        if (!userStats.has(username)) {
          userStats.set(username, {
            totalDeposit: 0,
            totalSpent: 0,
            transactionCount: 0,
            services: new Map()
          });
        }
        const stats = userStats.get(username);
        stats.totalSpent += usage.cost;
        stats.transactionCount += 1;
        
        const serviceCount = stats.services.get(usage.serviceName) || 0;
        stats.services.set(usage.serviceName, serviceCount + 1);
      });
      
      // Output user statistics
      Array.from(userStats.entries()).forEach(([username, stats]) => {
        const balance = stats.totalDeposit - stats.totalSpent;
        const mostUsedService = (Array.from(stats.services.entries()) as [string, number][])
          .sort((a, b) => b[1] - a[1])[0];
        const favoriteService = mostUsedService ? `${mostUsedService[0]} (${mostUsedService[1]} lần)` : 'Chưa sử dụng';
        
        csvData.push(`"${username}","${stats.totalDeposit.toLocaleString('vi-VN')}","${stats.totalSpent.toLocaleString('vi-VN')}","${balance.toLocaleString('vi-VN')}","${stats.transactionCount}","${favoriteService}"`);
      });
      
      // ============== CREATE EXCEL WORKBOOK WITH MULTIPLE SHEETS ==============
      const workbook = xlsx.utils.book_new();

      // ============== SHEET 1: NAP TIỀN ==============
      const sheet1Data = [
        ['Ngày giờ', 'ID khách hàng', 'Phương thức', 'Số tiền nạp', 'Mã giao dịch', 'Tình trạng', 'Ghi chú']
      ];
      
      successfulTopups.forEach(topup => {
        const username = userMap.get(topup.userId) || `ID-${topup.userId}`;
        sheet1Data.push([
          new Date(topup.createdAt).toLocaleString('vi-VN'),
          username,
          'QR Code MB Bank',
          `${parseFloat(topup.amount.toString()).toLocaleString('vi-VN')} VND`,
          topup.transactionId || '-',
          topup.status === 'completed' ? 'Thành công' : 'Chưa xác nhận',
          'Nạp tiền qua QR Code'
        ]);
      });
      
      const sheet1 = xlsx.utils.aoa_to_sheet(sheet1Data);
      xlsx.utils.book_append_sheet(workbook, sheet1, 'NAP TIỀN');

      // ============== SHEET 2: DỊCH VỤ ==============
      const sheet2Data = [
        ['Ngày giờ', 'ID khách hàng', 'Tên dịch vụ', 'Số lượng', 'Giá/lượt', 'Tổng chi', 'Kết quả', 'Ghi chú']
      ];
      
      // Phone Rentals
      periodPhoneRentals.forEach(rental => {
        const username = userMap.get(rental.userId) || `ID-${rental.userId}`;
        const serviceName = rental.serviceType === 'tiktok_sim' ? 'Thuê số TikTok' : 'Thuê số Shopee';
        const cost = rental.serviceType === 'tiktok_sim' ? 1200 : 2100;
        sheet2Data.push([
          new Date(rental.createdAt).toLocaleString('vi-VN'),
          username,
          serviceName,
          1,
          `${cost.toLocaleString('vi-VN')} VND`,
          `${cost.toLocaleString('vi-VN')} VND`,
          rental.status === 'completed' ? 'Thành công' : rental.status === 'failed' ? 'Thất bại' : 'Đang xử lý',
          rental.phoneNumber ? `Số thuê: ${rental.phoneNumber}` : 'Chưa có số'
        ]);
      });

      // TikTok Rentals
      periodTiktokRentals.forEach(rental => {
        const username = userMap.get(rental.userId) || `ID-${rental.userId}`;
        sheet2Data.push([
          new Date(rental.createdAt).toLocaleString('vi-VN'),
          username,
          'Thuê số TikTok',
          1,
          '1.200 VND',
          '1.200 VND',
          rental.status === 'completed' ? 'Thành công' : rental.status === 'failed' ? 'Thất bại' : 'Đang xử lý',
          rental.phoneNumber ? `Số thuê: ${rental.phoneNumber}` : 'Chưa có số'
        ]);
      });

      // Other services
      const otherServices = [
        { data: periodPhoneChecks, name: 'Kiểm tra số', cost: 100 },
        { data: periodAccountChecks, name: 'Kiểm tra tài khoản', cost: 100 },
        { data: periodTrackingChecks, name: 'Theo dõi đơn hàng', cost: 100 },
        { data: periodCookieExtractions, name: 'Lấy Cookie', cost: 100 },
        { data: periodEmailAdditions, name: 'Thêm Email', cost: 100 }
      ];

      otherServices.forEach(service => {
        service.data.forEach(item => {
          const username = userMap.get(item.userId) || `ID-${item.userId}`;
          sheet2Data.push([
            new Date(item.createdAt).toLocaleString('vi-VN'),
            username,
            service.name,
            1,
            `${service.cost.toLocaleString('vi-VN')} VND`,
            `${service.cost.toLocaleString('vi-VN')} VND`,
            (item.status === 'success' || item.status === true) ? 'Thành công' : 'Thất bại',
            'Đã xử lý'
          ]);
        });
      });
      
      const sheet2 = xlsx.utils.aoa_to_sheet(sheet2Data);
      xlsx.utils.book_append_sheet(workbook, sheet2, 'DỊCH VỤ');

      // ============== SHEET 3: TỔNG HỢP ==============
      
      // UPDATED: Calculate profit for each service (only successful operations) - use NEW SUCCESS CRITERIA
      // Kiểm tra số điện thoại: userId khác 3, 2650, 2603 VÀ cost = 100
      const successfulPhoneChecks = periodPhoneChecks.filter(p => 
        p.userId !== 3 && p.userId !== 2650 && p.userId !== 2603 && p.cost === 100
      );
      // Kiểm tra tài khoản: userId khác 3 và status = TRUE
      const successfulAccountChecks = periodAccountChecks.filter(a => 
        a.userId !== 3 && a.status === true
      );
      // Theo dõi đơn hàng: userId khác 3 và status = TRUE
      const successfulTrackingChecks = periodTrackingChecks.filter(t => 
        t.userId !== 3 && t.status === true
      );
      // Lấy Cookie SPC_ST: userId khác 3 và status = success
      const successfulCookieExtractions = periodCookieExtractions.filter(c => 
        c.userId !== 3 && c.status === 'success'
      );
      // Thêm Email: userId khác 3 và status = TRUE
      const successfulEmailAdditions = periodEmailAdditions.filter(e => 
        e.userId !== 3 && e.status === true
      );
      // Thuê số Shopee: otpCode khác NULL (không filter userId)
      const successfulPhoneRentals = periodPhoneRentals.filter(r => r.otpCode);
      // Thuê số TikTok: userId khác 3 và otpCode khác NULL
      const successfulTiktokRentals = periodTiktokRentals.filter(r => 
        r.userId !== 3 && r.otpCode
      );
      // Lấy Mã Freeship (Cũ): userId khác 3 và status = used
      const successfulFreeshipVoucherUsage = periodFreeshipVoucherUsage.filter(v => 
        v.userId !== 3 && v.status === 'used'
      );
      
      // Lưu Voucher Freeship: userId khác 3 và successfulSaves >= 1
      const successfulVoucherSavingOperations = periodVoucherSavingOperations.filter(v => 
        v.userId !== 3 && v.successfulSaves >= 1
      );
      
      // Check Voucher Hỏa Tốc: Filter unique first successes by period
      const successfulCookieRapidChecks = allUniqueFirstSuccesses.filter(c =>
        c.createdAt && new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate
      );
      
      // UPDATED: Calculate profit by service type - use NEW PRICING
      const serviceProfits = {
        'Kiểm tra số điện thoại': successfulPhoneChecks.length * 100,
        'Kiểm tra tài khoản': successfulAccountChecks.length * 100,
        'Theo dõi đơn hàng': successfulTrackingChecks.length * 100,
        'Lấy Cookie SPC_ST': successfulCookieExtractions.length * 100,
        'Thêm Email': successfulEmailAdditions.length * 100,
        'Lấy Mã Freeship (Cũ)': successfulFreeshipVoucherUsage.length * 2000,
        'Lưu Voucher Freeship': successfulVoucherSavingOperations.length * 2000,
        'Check Voucher Hỏa Tốc': successfulCookieRapidChecks.length * 500,
        'Thuê số TikTok': successfulTiktokRentals.length * 100, // UPDATED: 100đ
        'Thuê số Shopee v1': 0,
        'Thuê số Shopee v2': 0,
        'Thuê số Shopee v3': 0
      };
      
      // UPDATED: Calculate phone rental profits by version - use NEW PRICING
      successfulPhoneRentals.forEach(rental => {
        const actualService = rental.service || rental.serviceType || 'otissim_v1';
        if (actualService === 'otissim_v1') {
          serviceProfits['Thuê số Shopee v1'] += 400; // UPDATED: 400đ (was 500đ)
        } else if (actualService === 'otissim_v2') {
          serviceProfits['Thuê số Shopee v2'] += 400; // UPDATED: 400đ (unchanged)
        } else if (actualService === 'otissim_v3') {
          serviceProfits['Thuê số Shopee v3'] += 200; // UPDATED: 200đ (unchanged)
        }
      });
      
      const totalProfit = Object.values(serviceProfits).reduce((sum, profit) => sum + profit, 0);
      
      const sheet3Data = [
        ['Chỉ số', 'Giá trị'],
        ['Tổng tiền nạp', `${totalSuccessfulAmount.toLocaleString('vi-VN')} VND`],
        ['Tổng tiền sử dụng dịch vụ', `${totalServiceRevenue.toLocaleString('vi-VN')} VND`],
        ['Lợi nhuận ròng', `${(totalSuccessfulAmount - totalServiceRevenue).toLocaleString('vi-VN')} VND`],
        ['', ''], // Empty row separator
        ['LỢI NHUẬN TỪNG DỊCH VỤ (chỉ tính thành công)', ''],
        ['Kiểm tra số điện thoại', `${serviceProfits['Kiểm tra số điện thoại'].toLocaleString('vi-VN')} VND (${successfulPhoneChecks.length} lần × 100đ)`],
        ['Kiểm tra tài khoản', `${serviceProfits['Kiểm tra tài khoản'].toLocaleString('vi-VN')} VND (${successfulAccountChecks.length} lần × 100đ)`],
        ['Theo dõi đơn hàng', `${serviceProfits['Theo dõi đơn hàng'].toLocaleString('vi-VN')} VND (${successfulTrackingChecks.length} lần × 100đ)`],
        ['Lấy Cookie SPC_ST', `${serviceProfits['Lấy Cookie SPC_ST'].toLocaleString('vi-VN')} VND (${successfulCookieExtractions.length} lần × 100đ)`],
        ['Thêm Email', `${serviceProfits['Thêm Email'].toLocaleString('vi-VN')} VND (${successfulEmailAdditions.length} lần × 100đ)`],
        ['Lấy Mã Freeship (Cũ)', `${serviceProfits['Lấy Mã Freeship (Cũ)'].toLocaleString('vi-VN')} VND (${successfulFreeshipVoucherUsage.length} lần × 2000đ)`],
        ['Lưu Voucher Freeship', `${serviceProfits['Lưu Voucher Freeship'].toLocaleString('vi-VN')} VND (${successfulVoucherSavingOperations.length} lần × 2000đ)`],
        ['Check Voucher Hỏa Tốc', `${serviceProfits['Check Voucher Hỏa Tốc'].toLocaleString('vi-VN')} VND (${successfulCookieRapidChecks.length} lần × 500đ)`],
        ['Thuê số TikTok', `${serviceProfits['Thuê số TikTok'].toLocaleString('vi-VN')} VND (${successfulTiktokRentals.length} lần × 100đ)`],
        ['Thuê số Shopee v1', `${serviceProfits['Thuê số Shopee v1'].toLocaleString('vi-VN')} VND (${successfulPhoneRentals.filter(r => (r.service || r.serviceType || 'otissim_v1') === 'otissim_v1').length} lần × 400đ)`],
        ['Thuê số Shopee v2', `${serviceProfits['Thuê số Shopee v2'].toLocaleString('vi-VN')} VND (${successfulPhoneRentals.filter(r => (r.service || r.serviceType) === 'otissim_v2').length} lần × 400đ)`],
        ['Thuê số Shopee v3', `${serviceProfits['Thuê số Shopee v3'].toLocaleString('vi-VN')} VND (${successfulPhoneRentals.filter(r => (r.service || r.serviceType) === 'otissim_v3').length} lần × 200đ)`],
        ['', ''], // Empty row separator
        ['TỔNG LỢI NHUẬN DỊCH VỤ', `${totalProfit.toLocaleString('vi-VN')} VND`],
        ['', ''],
        
        // ============== PHẦN LƯU VOUCHER FREESHIP & CHECK COOKIE HỎA TỐC ==============
        ['THỐNG KÊ VOUCHER FREESHIP TỔNG HỢP', ''],
        [`Tổng số lượt lấy mã`, `${periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length} lần`],
        [`Số lượt thành công`, `${successfulFreeshipVoucherUsage.length + successfulVoucherSavingOperations.length} lần (${(periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length) > 0 ? Math.round((successfulFreeshipVoucherUsage.length + successfulVoucherSavingOperations.length) / (periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length) * 100) : 0}%)`],
        [`Số lượt thất bại`, `${(periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length) - (successfulFreeshipVoucherUsage.length + successfulVoucherSavingOperations.length)} lần (${(periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length) > 0 ? Math.round(((periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length) - (successfulFreeshipVoucherUsage.length + successfulVoucherSavingOperations.length)) / (periodFreeshipVoucherUsage.length + periodVoucherSavingOperations.length) * 100) : 0}%)`],
        [`Doanh thu từ voucher freeship`, `${(successfulFreeshipVoucherUsage.length * 2000 + successfulVoucherSavingOperations.length * 2000).toLocaleString('vi-VN')} VND`],
        
        ['', ''], 
        ['CHI TIẾT TỪNG LOẠI:', ''],
        [`Lấy mã freeship (cũ)`, `${periodFreeshipVoucherUsage.length} lần (${successfulFreeshipVoucherUsage.length} thành công)`],
        [`Lưu voucher freeship (mới)`, `${periodVoucherSavingOperations.length} lần (${successfulVoucherSavingOperations.length} thành công)`],
        
        ['', ''],
        ['THỐNG KÊ CHECK VOUCHER HỎA TỐC', ''],
        [`Tổng số lượt check`, `${allUniqueFirstSuccesses.length} lần`],
        [`Số lượt thành công`, `${successfulCookieRapidChecks.length} lần (${allUniqueFirstSuccesses.length > 0 ? Math.round(successfulCookieRapidChecks.length / allUniqueFirstSuccesses.length * 100) : 0}%)`],
        [`Số lượt thất bại`, `${allUniqueFirstSuccesses.length - successfulCookieRapidChecks.length} lần (${allUniqueFirstSuccesses.length > 0 ? Math.round((allUniqueFirstSuccesses.length - successfulCookieRapidChecks.length) / allUniqueFirstSuccesses.length * 100) : 0}%)`],
        [`Doanh thu từ check voucher hỏa tốc`, `${(successfulCookieRapidChecks.length * 500).toLocaleString('vi-VN')} VND`],
        
        ['', ''],
        ['Dịch vụ được dùng nhiều nhất', `${mostUsedService ? mostUsedService[0] : 'N/A'} (${mostUsedService ? mostUsedService[1].count : 0} lần)`],
        ['Người dùng nạp nhiều nhất', `${topUser ? topUser[0] : 'N/A'} (${topUser ? topUser[1].toLocaleString('vi-VN') : 0} VND)`],
        ['Tỷ lệ lỗi', `${errorRate}%`],
        ['Khoảng thời gian', `${startDate.toLocaleDateString('vi-VN')} - ${endDate.toLocaleDateString('vi-VN')}`]
      ];
      
      const sheet3 = xlsx.utils.aoa_to_sheet(sheet3Data);
      xlsx.utils.book_append_sheet(workbook, sheet3, 'TỔNG HỢP');

      // ============== SHEET 4: CHI TIẾT THEO KHÁCH HÀNG ==============
      const sheet4Data = [
        ['ID khách hàng', 'Tổng tiền nạp', 'Tổng chi phí dịch vụ', 'Số dư còn lại', 'Số lần giao dịch', 'Dịch vụ hay dùng']
      ];
      
      Array.from(userStats.entries()).forEach(([username, stats]) => {
        const balance = stats.totalDeposit - stats.totalSpent;
        const mostUsedService = (Array.from(stats.services.entries()) as [string, number][])
          .sort((a, b) => b[1] - a[1])[0];
        const favoriteService = mostUsedService ? `${mostUsedService[0]} (${mostUsedService[1]} lần)` : 'Chưa sử dụng';
        
        sheet4Data.push([
          username,
          `${stats.totalDeposit.toLocaleString('vi-VN')} VND`,
          `${stats.totalSpent.toLocaleString('vi-VN')} VND`,
          `${balance.toLocaleString('vi-VN')} VND`,
          stats.transactionCount,
          favoriteService
        ]);
      });
      
      const sheet4 = xlsx.utils.aoa_to_sheet(sheet4Data);
      xlsx.utils.book_append_sheet(workbook, sheet4, 'CHI TIẾT THEO KHÁCH HÀNG');

      // ============== SHEET 5: LỊCH SỬ SỬ DỤNG DỊCH VỤ ==============
      const sheet5Data = [
        ['Dịch vụ', 'Ngày giờ', 'ID khách hàng', 'Chi tiết thực hiện', 'Kết quả', 'Dữ liệu đầu vào', 'Dữ liệu đầu ra', 'IP/Proxy', 'Ghi chú']
      ];
      
      // 1. Thuê số Shopee (Phone Rentals)
      periodPhoneRentals.forEach(rental => {
        const username = userMap.get(rental.userId) || `ID-${rental.userId}`;
        // Fix service classification - use 'service' field instead of 'serviceType'
        const actualService = rental.service || rental.serviceType || 'otissim_v1';
        const serviceDetail = `${actualService} - ${rental.carrier || 'N/A'}`;
        const result = rental.status === 'completed' ? 'Thành công' : 
                      rental.status === 'failed' ? 'Thất bại' : 
                      rental.status === 'expired' ? 'Hết hạn' : 'Đang xử lý';
        const inputData = `Carrier: ${rental.carrier || 'N/A'}`;
        const outputData = rental.phoneNumber ? `Số: ${rental.phoneNumber}, OTP: ${rental.otpCode || 'Chưa có'}` : 'Không có';
        
        sheet5Data.push([
          'Thuê số Shopee',
          new Date(rental.createdAt).toLocaleString('vi-VN'),
          username,
          serviceDetail,
          result,
          inputData,
          outputData,
          rental.proxyUsed || 'Không sử dụng proxy',
          rental.notes || `Session: ${rental.sessionId}`
        ]);
      });

      // 2. Thuê số TikTok 
      periodTiktokRentals.forEach(rental => {
        const username = userMap.get(rental.userId) || `ID-${rental.userId}`;
        const serviceDetail = `TikTok - ${rental.carrier || 'N/A'}`;
        const result = rental.status === 'completed' ? 'Thành công' : 
                      rental.status === 'failed' ? 'Thất bại' : 
                      rental.status === 'expired' ? 'Hết hạn' : 'Đang xử lý';
        const inputData = `Carrier: ${rental.carrier || 'N/A'}`;
        const outputData = rental.phoneNumber ? `Số: ${rental.phoneNumber}, OTP: ${rental.otpCode || 'Chưa có'}` : 'Không có';
        
        sheet5Data.push([
          'Thuê số TikTok',
          new Date(rental.createdAt).toLocaleString('vi-VN'),
          username,
          serviceDetail,
          result,
          inputData,
          outputData,
          rental.proxyUsed || 'Không sử dụng proxy',
          rental.notes || `Session: ${rental.sessionId}`
        ]);
      });

      // 3. Kiểm tra số điện thoại
      periodPhoneChecks.forEach(check => {
        const username = userMap.get(check.userId) || `ID-${check.userId}`;
        const phoneCount = check.phoneNumbers ? check.phoneNumbers.length : 1;
        const result = check.status === 'success' ? 'Thành công' : 'Thất bại';
        const inputData = check.phoneNumbers ? `${phoneCount} số điện thoại` : 'Không có dữ liệu';
        const outputData = check.registeredNumbers ? `${check.registeredNumbers.length} số đã đăng ký Shopee` : 'Không có kết quả';
        
        sheet5Data.push([
          'Kiểm tra số điện thoại',
          new Date(check.createdAt).toLocaleString('vi-VN'),
          username,
          `Kiểm tra hàng loạt ${phoneCount} số`,
          result,
          inputData,
          outputData,
          check.proxyUsed || 'Hệ thống tự động',
          check.notes || 'Kiểm tra đăng ký Shopee'
        ]);
      });

      // 4. Kiểm tra tài khoản
      periodAccountChecks.forEach(check => {
        const username = userMap.get(check.userId) || `ID-${check.userId}`;
        const result = check.status ? 'Thành công' : 'Thất bại';
        const inputData = check.cookieId ? `Cookie ID: ${check.cookieId}` : 'Cookie trực tiếp';
        const outputData = check.username ? `TK: ${check.username}, Email: ${check.email || 'N/A'}` : 'Không lấy được thông tin';
        
        sheet5Data.push([
          'Kiểm tra tài khoản',
          new Date(check.createdAt).toLocaleString('vi-VN'),
          username,
          'Xác thực tài khoản Shopee',
          result,
          inputData,
          outputData,
          check.proxyUsed || 'Hệ thống tự động',
          check.notes || 'Kiểm tra cookie SPC_ST'
        ]);
      });

      // 5. Theo dõi đơn hàng
      periodTrackingChecks.forEach(check => {
        const username = userMap.get(check.userId) || `ID-${check.userId}`;
        const result = check.status ? 'Thành công' : 'Thất bại';
        const inputData = check.cookieId ? `Cookie ID: ${check.cookieId}` : 'Cookie trực tiếp';
        const outputData = check.orders ? `${check.orders.length} đơn hàng` : 'Không có đơn hàng';
        
        sheet5Data.push([
          'Theo dõi đơn hàng',
          new Date(check.createdAt).toLocaleString('vi-VN'),
          username,
          'Lấy danh sách đơn hàng',
          result,
          inputData,
          outputData,
          check.proxyUsed || 'Hệ thống tự động',
          check.notes || 'Theo dõi đơn hàng Shopee'
        ]);
      });

      // 6. Lấy Cookie SPC_ST
      periodCookieExtractions.forEach(extraction => {
        const username = userMap.get(extraction.userId) || `ID-${extraction.userId}`;
        const result = extraction.status === 'success' ? 'Thành công' : 'Thất bại';
        const extractionType = extraction.method === 'spcf' ? 'SPC_F Login' : extraction.method === 'qr' ? 'QR Code' : 'Không xác định';
        const inputData = extraction.method === 'spcf' ? 'Username/Password' : extraction.method === 'qr' ? 'QR Code scan' : 'N/A';
        const outputData = extraction.spcStCookie ? 'Cookie SPC_ST' : 'Không lấy được cookie';
        
        sheet5Data.push([
          'Lấy Cookie SPC_ST',
          new Date(extraction.createdAt).toLocaleString('vi-VN'),
          username,
          extractionType,
          result,
          inputData,
          outputData,
          extraction.proxyUsed || 'Không sử dụng proxy',
          extraction.notes || `Session: ${extraction.sessionId || 'N/A'}`
        ]);
      });

      // 7. Thêm Email
      periodEmailAdditions.forEach(addition => {
        const username = userMap.get(addition.userId) || `ID-${addition.userId}`;
        const result = addition.status === 'success' ? 'Thành công' : 'Thất bại';
        const inputData = addition.email ? `Email: ${addition.email}` : 'Không có email';
        const outputData = addition.result || addition.errorMessage || 'Không có kết quả';
        
        sheet5Data.push([
          'Thêm Email',
          new Date(addition.createdAt).toLocaleString('vi-VN'),
          username,
          'Thêm email vào tài khoản Shopee',
          result,
          inputData,
          outputData,
          addition.proxyUsed || 'Hệ thống tự động',
          addition.notes || 'Thêm email tự động'
        ]);
      });
      
      // 8. Check Cookie Hỏa Tốc (Express Tracking Checks)
      periodExpressTrackingChecks.forEach(check => {
        const username = userMap.get(check.userId) || `ID-${check.userId}`;
        const result = check.status === 'success' ? 'Thành công' : 'Thất bại';
        const inputData = check.trackingCode ? `Mã vận đơn: ${check.trackingCode}` : 'Không có mã vận đơn';
        const outputData = check.trackingInfo ? `Trạng thái: ${JSON.stringify(check.trackingInfo)}` : check.errorMessage || 'Không có kết quả';
        
        sheet5Data.push([
          'Check Cookie Hỏa Tốc',
          new Date(check.createdAt).toLocaleString('vi-VN'),
          username,
          'Kiểm tra trạng thái vận chuyển nhanh',
          result,
          inputData,
          outputData,
          check.proxyUsed || 'Hệ thống tự động',
          check.notes || `Session: ${check.sessionId || 'N/A'}`
        ]);
      });
      
      // 9. Lấy Mã Freeship (Freeship Voucher Usage)
      periodFreeshipVoucherUsage.forEach(usage => {
        const username = userMap.get(usage.userId) || `ID-${usage.userId}`;
        const result = usage.status === 'success' ? 'Thành công' : 'Thất bại';
        const inputData = usage.voucherCode ? `Mã voucher: ${usage.voucherCode}` : 'Không có mã voucher';
        const outputData = usage.savedVoucherData ? `Voucher đã lưu: ${usage.savedVoucherData}` : usage.errorMessage || 'Không lưu được voucher';
        
        sheet5Data.push([
          'Lấy Mã Freeship',
          new Date(usage.createdAt).toLocaleString('vi-VN'),
          username,
          'Lưu voucher freeship từ Shopee',
          result,
          inputData,
          outputData,
          usage.proxyUsed || 'Hệ thống tự động',
          usage.notes || `Session: ${usage.sessionId || 'N/A'}`
        ]);
      });

      // Sort by date (newest first)
      sheet5Data.slice(1).sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime());
      
      const sheet5 = xlsx.utils.aoa_to_sheet(sheet5Data);
      xlsx.utils.book_append_sheet(workbook, sheet5, 'LỊCH SỬ SỬ DỤNG');

      // ============== GENERATE EXCEL FILE ==============
      const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      
      const filename = `analytics-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', excelBuffer.length.toString());
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      console.log('[Analytics] Excel export completed with 5 sheets:', sheet1Data.length + sheet2Data.length + sheet3Data.length + sheet4Data.length + sheet5Data.length, 'total rows');
      res.send(excelBuffer);
    } catch (error) {
      console.error('Analytics export error:', error);
      res.status(500).json({ message: 'Không thể xuất báo cáo CSV' });
    }
  });

  // Daily Analytics - Phân tích theo ngày
  app.get("/api/analytics/daily", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const { period = 'week', selectedDate } = req.query;
      
      let startDate: Date, endDate: Date;
      
      if (selectedDate) {
        // Use specific date if provided
        startDate = new Date(selectedDate as string);
        endDate = new Date(selectedDate as string);
        endDate.setHours(23, 59, 59, 999);
        console.log(`[Daily Analytics] Using specific date: ${startDate.toISOString()}`);
      } else {
        // Use period-based range
        endDate = new Date();
        startDate = new Date();
        
        switch (period) {
          case 'day':
            startDate.setDate(endDate.getDate() - 1);
            break;
          case 'week':
            startDate.setDate(endDate.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(endDate.getMonth() - 1);
            break;
          default:
            startDate.setDate(endDate.getDate() - 7);
        }
      }
      
      console.log(`[Daily Analytics] Getting data from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // 🚀 OPTIMIZED: Query directly by date range instead of loading ALL data
      const allTransactions = await storage.getTransactionsByDateRange(startDate, endDate);
      const periodPhoneChecks = await storage.getPhoneChecksByDateRange(startDate, endDate);
      const periodAccountChecks = await storage.getAccountChecksByDateRange(startDate, endDate);
      const periodTrackingChecks = await storage.getTrackingChecksByDateRange(startDate, endDate);
      const periodCookieExtractions = await storage.getCookieExtractionsByDateRange(startDate, endDate);
      const periodPhoneRentals = await storage.getPhoneRentalHistoryWithFilter({ 
        limit: 5000, 
        startDate, 
        endDate 
      });
      const periodTiktokRentals = await storage.getTiktokRentalsWithFilter({ 
        limit: 5000, 
        startDate, 
        endDate 
      });
      const periodEmailAdditions = await storage.getEmailAdditionsByDateRange(startDate, endDate);
      
      // Group by date
      const dailyData = new Map<string, {
        date: string;
        services: Map<string, {
          service: string;
          serviceName: string;
          totalUsage: number;
          successfulUsage: number;
          totalCharged: number;
          totalRefunded: number;
          netProfit: number;
          successRate: number;
        }>;
        dailyTotals: {
          totalUsage: number;
          totalSuccess: number;
          totalCharged: number;
          totalRefunded: number;
          netProfit: number;
          overallSuccessRate: number;
        };
      }>();
      
      // Initialize daily data structure
      const initializeDailyData = (date: string) => {
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            date,
            services: new Map(),
            dailyTotals: {
              totalUsage: 0,
              totalSuccess: 0,
              totalCharged: 0,
              totalRefunded: 0,
              netProfit: 0,
              overallSuccessRate: 0
            }
          });
        }
      };
      
      // Initialize service data for a specific date
      const initializeServiceData = (date: string, serviceKey: string, serviceName: string) => {
        const dayData = dailyData.get(date)!;
        if (!dayData.services.has(serviceKey)) {
          dayData.services.set(serviceKey, {
            service: serviceKey,
            serviceName: serviceName,
            totalUsage: 0,
            successfulUsage: 0,
            totalCharged: 0,
            totalRefunded: 0,
            netProfit: 0,
            successRate: 0
          });
        }
      };
      
      // Process each service type with usage, success counting, and charging
      const serviceConfigs = [
        { data: periodPhoneChecks, key: 'phone_check', name: 'Kiểm tra số điện thoại', price: 100 },
        { data: periodAccountChecks, key: 'account_check', name: 'Kiểm tra tài khoản', price: 100 },
        { data: periodTrackingChecks, key: 'tracking_check', name: 'Theo dõi đơn hàng', price: 100 },
        { data: periodCookieExtractions, key: 'cookie_extraction', name: 'Lấy cookie SPC_ST', price: 100 },
        { data: periodPhoneRentals, key: 'phone_rental', name: 'Thuê số Shopee', price: 2100 },
        { data: periodTiktokRentals, key: 'tiktok_rental', name: 'Thuê số TikTok', price: 1200 },
        { data: periodEmailAdditions, key: 'email_addition', name: 'Thêm email', price: 100 }
      ];
      
      serviceConfigs.forEach(config => {
        config.data.forEach(item => {
          const dateValue = item.createdAt || item.checkedAt || item.timestamp || item.startTime;
          if (dateValue) {
            try {
              const date = new Date(dateValue).toISOString().split('T')[0];
              initializeDailyData(date);
              
              // Special handling for phone rentals to separate v1, v2, v3
              let serviceKey = config.key;
              let serviceName = config.name;
              
              if (config.key === 'phone_rental' && item.service) {
                if (item.service === 'otissim_v1') {
                  serviceKey = 'phone_rental_v1';
                  serviceName = 'Thuê số Shopee v1';
                } else if (item.service === 'otissim_v2') {
                  serviceKey = 'phone_rental_v2';
                  serviceName = 'Thuê số Shopee v2';
                } else if (item.service === 'otissim_v3') {
                  serviceKey = 'phone_rental_v3';
                  serviceName = 'Thuê số Shopee v3';
                }
              }
              
              initializeServiceData(date, serviceKey, serviceName);
              
              const dayData = dailyData.get(date)!;
              const serviceData = dayData.services.get(serviceKey)!;
              
              // Count total usage
              serviceData.totalUsage += 1;
              dayData.dailyTotals.totalUsage += 1;
              
              // Count successful usage
              const isSuccess = item.status === 'completed' || item.status === 'success' || item.status === true;
              if (isSuccess) {
                serviceData.successfulUsage += 1;
                dayData.dailyTotals.totalSuccess += 1;
              }
              
              // Không tính totalCharged ở đây - sẽ tính từ transactions thực tế
              
            } catch (error) {
              console.warn('Invalid date value:', dateValue, 'for item:', item.id);
            }
          }
        });
      });
      
      // Process charges and refunds from transactions - ĐỌC TỪ DATABASE
      allTransactions.forEach(transaction => {
        const date = new Date(transaction.createdAt).toISOString().split('T')[0];
        const amount = parseFloat(transaction.amount || '0');
        
        // DEBUG: Log all phone rental transactions for 2025-07-09
        if (date === '2025-07-09' && (transaction.description?.includes('OtisSim') || transaction.description?.includes('thuê số'))) {
          console.log(`[DEBUG] All phone rental transaction: amount=${amount}, type=${transaction.type}, reference=${transaction.reference}, desc=${transaction.description}`);
        }
        
        // Determine service type from transaction description
        let serviceKey = 'other';
        let serviceName = 'Khác';
        
        if (transaction.description?.includes('OtisSim') || transaction.description?.includes('thuê số Shopee') || 
            transaction.type?.includes('otissim_v1') || transaction.type?.includes('otissim_v2') || transaction.type?.includes('otissim_v3')) {
          serviceKey = 'phone_rental';
          serviceName = 'Thuê số Shopee';
          
          // Detailed breakdown by service version
          if (transaction.type?.includes('otissim_v1') || transaction.description?.includes('OtisSim v1')) {
            serviceKey = 'phone_rental_v1';
            serviceName = 'Thuê số Shopee v1';
            console.log(`[DEBUG] V1 Transaction: ${transaction.amount}, type: ${transaction.type}, desc: ${transaction.description?.substring(0,50)}...`);
          } else if (transaction.type?.includes('otissim_v2') || transaction.description?.includes('OtisSim v2')) {
            serviceKey = 'phone_rental_v2';
            serviceName = 'Thuê số Shopee v2';
            console.log(`[DEBUG] V2 Transaction: ${transaction.amount}, type: ${transaction.type}, desc: ${transaction.description?.substring(0,50)}...`);
          } else if (transaction.type?.includes('otissim_v3') || transaction.description?.includes('OtisSim v3')) {
            serviceKey = 'phone_rental_v3';
            serviceName = 'Thuê số Shopee v3';
            console.log(`[DEBUG] V3 Transaction: ${transaction.amount}, type: ${transaction.type}, desc: ${transaction.description?.substring(0,50)}...`);
          }
        } else if (transaction.description?.includes('TikTok')) {
          serviceKey = 'tiktok_rental';
          serviceName = 'Thuê số TikTok';
        } else if (transaction.description?.includes('kiểm tra số')) {
          serviceKey = 'phone_check';
          serviceName = 'Kiểm tra số điện thoại';
        } else if (transaction.description?.includes('kiểm tra tài khoản')) {
          serviceKey = 'account_check';
          serviceName = 'Kiểm tra tài khoản';
        } else if (transaction.description?.includes('theo dõi')) {
          serviceKey = 'tracking_check';
          serviceName = 'Theo dõi đơn hàng';
        } else if (transaction.description?.includes('cookie')) {
          serviceKey = 'cookie_extraction';
          serviceName = 'Lấy cookie SPC_ST';
        } else if (transaction.description?.includes('email')) {
          serviceKey = 'email_addition';
          serviceName = 'Thêm email';
        }
        
        initializeDailyData(date);
        initializeServiceData(date, serviceKey, serviceName);
        
        const dayData = dailyData.get(date)!;
        const serviceData = dayData.services.get(serviceKey)!;
        
        if (transaction.type === 'refund' && amount > 0) {
          // Tổng hoàn = refund transactions (dương)
          serviceData.totalRefunded += amount;
          dayData.dailyTotals.totalRefunded += amount;
          if (date === '2025-07-09' && serviceKey.includes('phone_rental')) {
            console.log(`[DEBUG] ${serviceKey} Refund: ${amount}, type: ${transaction.type}, reference: ${transaction.reference}, desc: ${transaction.description?.substring(0,60)}...`);
          }
        } else if (amount < 0) {
          // Tổng thu = tất cả transaction âm (trừ top_up)
          if (!transaction.type?.includes('top_up')) {
            const chargeAmount = Math.abs(amount);
            serviceData.totalCharged += chargeAmount;
            dayData.dailyTotals.totalCharged += chargeAmount;
            if (date === '2025-07-09' && serviceKey === 'phone_rental') {
              console.log(`[DEBUG] Charge (negative): ${chargeAmount}, type: ${transaction.type}, desc: ${transaction.description}`);
            }
          }
        } else if (amount > 0 && transaction.type !== 'refund' && transaction.type !== 'top_up') {
          // Tổng thu = dương transactions từ services (charge upfront) - trừ refund và top_up
          serviceData.totalCharged += amount;
          dayData.dailyTotals.totalCharged += amount;
          if (date === '2025-07-09' && serviceKey === 'phone_rental') {
            console.log(`[DEBUG] Charge (positive): ${amount}, type: ${transaction.type}, desc: ${transaction.description}`);
          }
        } else if (amount == 0 && date === '2025-07-09' && serviceKey === 'phone_rental') {
          // Debug: zero amount transactions
          console.log(`[DEBUG] Zero amount: ${amount}, type: ${transaction.type}, desc: ${transaction.description}`);
        } else if (amount > 0 && transaction.type === 'top_up' && date === '2025-07-09' && serviceKey === 'phone_rental') {
          // Debug: top_up transactions
          console.log(`[DEBUG] Top-up: ${amount}, type: ${transaction.type}, desc: ${transaction.description}`);
        } else if (amount > 0 && transaction.type === 'refund' && date === '2025-07-09' && serviceKey === 'phone_rental') {
          // Debug: already logged above
        } else if (amount > 0 && date === '2025-07-09' && serviceKey === 'phone_rental') {
          // Debug: other positive transactions
          console.log(`[DEBUG] Other positive: ${amount}, type: ${transaction.type}, desc: ${transaction.description}`);
        } else if (amount < 0 && transaction.type?.includes('top_up') && date === '2025-07-09' && serviceKey === 'phone_rental') {
          // Debug: negative top_up transactions
          console.log(`[DEBUG] Negative top_up: ${amount}, type: ${transaction.type}, desc: ${transaction.description}`);
        } else if (date === '2025-07-09' && serviceKey === 'phone_rental') {
          // Debug: các transaction không được tính
          console.log(`[DEBUG] Skipped transaction: amount=${amount}, type=${transaction.type}, desc: ${transaction.description}`);
        }
      });
      
      // Calculate net profit and success rates
      dailyData.forEach((dayData) => {
        dayData.services.forEach((serviceData) => {
          serviceData.netProfit = serviceData.totalCharged - serviceData.totalRefunded;
          serviceData.successRate = serviceData.totalUsage > 0 ? 
            (serviceData.successfulUsage / serviceData.totalUsage) * 100 : 0;
        });
        
        dayData.dailyTotals.netProfit = dayData.dailyTotals.totalCharged - dayData.dailyTotals.totalRefunded;
        dayData.dailyTotals.overallSuccessRate = dayData.dailyTotals.totalUsage > 0 ? 
          (dayData.dailyTotals.totalSuccess / dayData.dailyTotals.totalUsage) * 100 : 0;
      });
      
      // Convert to array and sort by date (newest first)
      const result = Array.from(dailyData.values())
        .map(dayData => ({
          date: dayData.date,
          services: Array.from(dayData.services.values()),
          dailyTotals: dayData.dailyTotals
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
      
      // Debug: Count V3 refunds specifically
      let v3RefundCount = 0;
      let v3RefundTotal = 0;
      allTransactions.forEach(transaction => {
        if (transaction.type === 'refund' && 
            (transaction.description?.includes('OtisSim v3') || transaction.description?.includes('otissim_v3'))) {
          v3RefundCount++;
          v3RefundTotal += parseInt(transaction.amount);
          console.log(`[DEBUG] V3 Refund #${v3RefundCount}: ${transaction.amount}đ - ${transaction.description?.substring(0,50)}...`);
        }
      });
      console.log(`[DEBUG] Total V3 refunds: ${v3RefundCount} transactions = ${v3RefundTotal}đ`);
      
      // Debug: Check for duplicate refunds by reference
      const refundReferences = new Set();
      let duplicateRefunds = 0;
      allTransactions.forEach(transaction => {
        if (transaction.type === 'refund' && 
            (transaction.description?.includes('OtisSim v3') || transaction.description?.includes('otissim_v3'))) {
          if (refundReferences.has(transaction.reference)) {
            duplicateRefunds++;
            console.log(`[DEBUG] DUPLICATE V3 Refund: ${transaction.reference} - ${transaction.description?.substring(0,50)}...`);
          } else {
            refundReferences.add(transaction.reference);
          }
        }
      });
      console.log(`[DEBUG] Unique V3 refund references: ${refundReferences.size}, Duplicates: ${duplicateRefunds}`);
      
      console.log(`[Daily Analytics] Processed ${result.length} days of data`);
      res.json(result);
    } catch (error) {
      console.error('Daily analytics error:', error);
      res.status(500).json({ message: 'Không thể tải dữ liệu phân tích theo ngày' });
    }
  });

  // DEBUG: Check transaction types
  app.get("/api/debug/transaction-types", authenticateToken, async (req: any, res) => {
    try {
      const transactions = await storage.getTransactionsWithFilter({ limit: 1000, offset: 0 });
      
      const phoneRentalTransactions = transactions.filter((t: any) => 
        t.description?.includes('OtisSim') || t.description?.includes('thuê số')
      );
      
      const typeCount = phoneRentalTransactions.reduce((acc: any, t: any) => {
        acc[t.type || 'null'] = (acc[t.type || 'null'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const sampleTransactions = phoneRentalTransactions.slice(0, 10).map((t: any) => ({
        type: t.type,
        amount: t.amount,
        description: t.description,
        createdAt: t.createdAt
      }));
      
      res.json({
        totalCount: phoneRentalTransactions.length,
        typeCount,
        sampleTransactions
      });
    } catch (error) {
      console.error('Debug transaction types error:', error);
      res.status(500).json({ error: 'Debug failed' });
    }
  });

  // Comprehensive Analytics Endpoints

  // AGGRESSIVE ANALYTICS CACHE - EXTREME EGRESS REDUCTION
  const analyticsCache = new Map();
  const ANALYTICS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

  function getCachedAnalyticsData(cacheKey: string, fetchFunction: () => Promise<any>) {
    const cached = analyticsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < ANALYTICS_CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
    
    return fetchFunction().then(data => {
      analyticsCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    });
  }

  // Cleanup old cache entries every 15 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of analyticsCache.entries()) {
      if (now - value.timestamp > ANALYTICS_CACHE_TTL) {
        analyticsCache.delete(key);
      }
    }
  }, 15 * 60 * 1000);

  // 1. Dashboard Overview - Tổng quan hiển thị
  app.get("/api/analytics/overview", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const { period = 'week' } = req.query;
      const cacheKey = `analytics_overview_${period}`;
      
      // Check cache first
      const cached = analyticsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < ANALYTICS_CACHE_TTL) {
        return res.json(cached.data);
      }
      
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }
      
      // 🚀 OPTIMIZED: Query directly by date range with intelligent caching
      const cacheKeyWithPeriod = `${cacheKey}_data`;
      const cachedData = analyticsCache.get(cacheKeyWithPeriod);
      
      let periodPhoneChecks, periodAccountChecks, periodTrackingChecks, periodCookieExtractions,
          periodPhoneRentals, periodTiktokRentals, periodEmailAdditions, periodExpressTrackingChecks,
          periodFreeshipVoucherUsage, periodCookieRapidChecks, allCookieRapidChecks;
      
      if (cachedData && (Date.now() - cachedData.timestamp) < ANALYTICS_CACHE_TTL) {
        // Use cached period-specific data
        ({
          periodPhoneChecks, periodAccountChecks, periodTrackingChecks, periodCookieExtractions,
          periodPhoneRentals, periodTiktokRentals, periodEmailAdditions, periodExpressTrackingChecks,
          periodFreeshipVoucherUsage, periodCookieRapidChecks, allCookieRapidChecks
        } = cachedData.data);
      } else {
        // Fetch fresh data - query by date range only
        [periodPhoneChecks, periodAccountChecks, periodTrackingChecks, periodCookieExtractions,
         periodPhoneRentals, periodTiktokRentals, periodEmailAdditions, periodExpressTrackingChecks,
         periodFreeshipVoucherUsage, periodCookieRapidChecks, allCookieRapidChecks] = await Promise.all([
          storage.getPhoneChecksByDateRange(startDate, endDate),
          storage.getAccountChecksByDateRange(startDate, endDate),
          storage.getTrackingChecksByDateRange(startDate, endDate),
          storage.getCookieExtractionsByDateRange(startDate, endDate),
          storage.getPhoneRentalHistoryWithFilter({ limit: 5000, startDate, endDate }),
          storage.getTiktokRentalsWithFilter({ limit: 5000, startDate, endDate }),
          storage.getEmailAdditionsByDateRange(startDate, endDate),
          storage.getExpressTrackingChecksByDateRange(startDate, endDate),
          storage.getFreeshipVoucherUsageByDateRange(startDate, endDate),
          storage.getCookieRapidChecksByDateRange(startDate, endDate),
          storage.getAllCookieRapidChecks() // Still need ALL for unique first successes
        ]);
        
        // Cache the fetched data
        analyticsCache.set(cacheKeyWithPeriod, {
          data: {
            periodPhoneChecks, periodAccountChecks, periodTrackingChecks, periodCookieExtractions,
            periodPhoneRentals, periodTiktokRentals, periodEmailAdditions, periodExpressTrackingChecks,
            periodFreeshipVoucherUsage, periodCookieRapidChecks, allCookieRapidChecks
          },
          timestamp: Date.now()
        });
      }
      
      // Helper function to get unique first-time successful cookie rapid checks from ALL data
      const getUniqueFirstSuccessfulCookieChecks = (allChecks: any[]) => {
        // UPDATED: Filter userId khác 3 và có shipping_phone
        const successfulChecks = allChecks.filter(c => 
          c.userId !== 3 && 
          (c.shippingPhone || c.shipping_phone)
        );
        
        // Group by order_id, chỉ lấy lần đầu tiên của mỗi order_id
        const seenOrderIds = new Set();
        const uniqueChecks: any[] = [];
        
        successfulChecks.forEach(check => {
          const orderId = check.orderId || check.order_id;
          if (orderId && !seenOrderIds.has(orderId)) {
            seenOrderIds.add(orderId);
            uniqueChecks.push(check);
          }
        });
        
        return uniqueChecks;
      };
      
      // Get unique first successes from ALL cookie rapid checks, then filter by period
      const allUniqueFirstSuccesses = getUniqueFirstSuccessfulCookieChecks(allCookieRapidChecks);
      const successfulCookieRapidChecks = allUniqueFirstSuccesses.filter(c =>
        c.createdAt && new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate
      );
      
      // Service usage distribution - UPDATED LOGIC with new success criteria
      // Kiểm tra số điện thoại: userId khác 3, 2650, 2603 VÀ cost = 100
      const successfulPhoneChecks = periodPhoneChecks.filter(p => 
        p.userId !== 3 && p.userId !== 2650 && p.userId !== 2603 && p.cost === 100
      );
      
      // Kiểm tra tài khoản: userId khác 3 VÀ status = TRUE
      const successfulAccountChecks = periodAccountChecks.filter(a => 
        a.userId !== 3 && a.status === true
      );
      
      // Theo dõi đơn hàng: userId khác 3 VÀ status = TRUE
      const successfulTrackingChecks = periodTrackingChecks.filter(t => 
        t.userId !== 3 && t.status === true
      );
      
      // Lấy Cookie SPC_ST: userId khác 3 VÀ status = 'success'
      const successfulCookieExtractions = periodCookieExtractions.filter(c => 
        c.userId !== 3 && c.status === 'success'
      );
      
      // Thêm Email: userId khác 3 VÀ status = TRUE
      const successfulEmailAdditions = periodEmailAdditions.filter(e => 
        e.userId !== 3 && e.status === true
      );
      
      // Thuê số Shopee: otp_code khác NULL
      const successfulPhoneRentals = periodPhoneRentals.filter(r => r.otpCode);
      
      // Thuê số TikTok: userId khác 3 VÀ otp_code khác NULL
      const successfulTiktokRentals = periodTiktokRentals.filter(r => 
        r.userId !== 3 && r.otpCode
      );
      
      const successfulExpressTrackingChecks = periodExpressTrackingChecks.filter(e => e.status === true);
      const successfulFreeshipVoucherUsage = periodFreeshipVoucherUsage.filter(v => v.status === 'used');

      // Calculate new revenue formula for Shopee phone rental - UPDATED PRICES
      const phoneRentalRevenue = successfulPhoneRentals.reduce((sum, r) => {
        const serviceType = r.service;
        if (serviceType === 'otissim_v1' || serviceType === 'main_v1') {
          return sum + 400; // +400 VND for v1 success
        } else if (serviceType === 'otissim_v2' || serviceType === 'main_v2') {
          return sum + 400; // +400 VND for v2 success
        } else if (serviceType === 'otissim_v3' || serviceType === 'main_v3') {
          return sum + 200; // +200 VND for v3 success
        }
        return sum + 200; // Default to v3 rate
      }, 0);

      const serviceUsage = [
        { service: 'Kiểm tra số', count: successfulPhoneChecks.length, revenue: successfulPhoneChecks.length * 100 },
        { service: 'Kiểm tra TK', count: successfulAccountChecks.length, revenue: successfulAccountChecks.length * 100 },
        { service: 'Theo dõi đơn hàng', count: successfulTrackingChecks.length, revenue: successfulTrackingChecks.length * 100 },
        { service: 'Lấy cookie SPC_ST', count: successfulCookieExtractions.length, revenue: successfulCookieExtractions.length * 100 },
        { service: 'Thuê số Shopee', count: successfulPhoneRentals.length, revenue: phoneRentalRevenue },
        { service: 'Thuê số TikTok', count: successfulTiktokRentals.length, revenue: successfulTiktokRentals.length * 100 },
        { service: 'Thêm email', count: successfulEmailAdditions.length, revenue: successfulEmailAdditions.length * 100 },
        { service: 'Kiểm tra mã vận đơn hỏa tốc', count: successfulExpressTrackingChecks.length, revenue: successfulExpressTrackingChecks.length * 500 },
        { service: 'Lưu voucher freeship', count: successfulFreeshipVoucherUsage.length, revenue: successfulFreeshipVoucherUsage.length * 2000 },
        { service: 'Check voucher hỏa tốc', count: successfulCookieRapidChecks.length, revenue: successfulCookieRapidChecks.length * 500 }
      ];
      
      // Daily usage trend - only count successful operations
      const dailyUsage = new Map<string, number>();
      [...successfulPhoneChecks, ...successfulAccountChecks, ...successfulTrackingChecks, 
       ...successfulCookieExtractions, ...successfulPhoneRentals, ...successfulTiktokRentals, 
       ...successfulEmailAdditions, ...successfulExpressTrackingChecks, ...successfulFreeshipVoucherUsage, 
       ...successfulCookieRapidChecks]
        .forEach(item => {
          const dateValue = item.createdAt || item.checkedAt || item.timestamp || item.startTime;
          if (dateValue) {
            try {
              const date = new Date(dateValue).toISOString().split('T')[0];
              dailyUsage.set(date, (dailyUsage.get(date) || 0) + 1);
            } catch (error) {
              console.warn('Invalid date value:', dateValue, 'for item:', item.id);
            }
          }
        });
      
      const dailyUsageTrend = Array.from(dailyUsage.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // Get user login data
      const auditLogs = await storage.getAuditLogsWithPagination(1, 5000);
      const loginLogs = auditLogs.filter(log => 
        log.action === 'LOGIN' && 
        new Date(log.timestamp) >= startDate && 
        new Date(log.timestamp) <= endDate
      );
      
      // Calculate total usage and revenue excluding admin/superadmin costs
      const allUsers = await storage.getAllUsers();
      const nonAdminUsers = allUsers.filter(user => user.role !== 'admin' && user.role !== 'superadmin');
      const nonAdminUserIds = new Set(nonAdminUsers.map(u => u.id));
      
      // Filter successful operations by non-admin users only
      const userFilteredPhoneChecks = successfulPhoneChecks.filter(p => nonAdminUserIds.has(p.userId));
      const userFilteredAccountChecks = successfulAccountChecks.filter(a => nonAdminUserIds.has(a.userId));
      const userFilteredTrackingChecks = successfulTrackingChecks.filter(t => nonAdminUserIds.has(t.userId));
      const userFilteredCookieExtractions = successfulCookieExtractions.filter(c => nonAdminUserIds.has(c.userId));
      const userFilteredPhoneRentals = successfulPhoneRentals.filter(r => nonAdminUserIds.has(r.userId));
      const userFilteredTiktokRentals = successfulTiktokRentals.filter(r => nonAdminUserIds.has(r.userId));
      const userFilteredEmailAdditions = successfulEmailAdditions.filter(e => nonAdminUserIds.has(e.userId));
      const userFilteredCookieRapidChecks = successfulCookieRapidChecks.filter(c => nonAdminUserIds.has(c.userId));
      
      // Calculate filtered phone rental revenue for non-admin users - UPDATED PRICES
      const filteredPhoneRentalRevenue = userFilteredPhoneRentals.reduce((sum, r) => {
        const serviceType = r.service;
        if (serviceType === 'otissim_v1' || serviceType === 'main_v1') {
          return sum + 400; // +400 VND for v1 success
        } else if (serviceType === 'otissim_v2' || serviceType === 'main_v2') {
          return sum + 400; // +400 VND for v2 success
        } else if (serviceType === 'otissim_v3' || serviceType === 'main_v3') {
          return sum + 200; // +200 VND for v3 success
        }
        return sum + 200; // Default to v3 rate
      }, 0);
      
      // 🚀 OPTIMIZED: Query new service data by date range then filter by user
      const userFilteredExpressTrackingChecks = (await storage.getExpressTrackingChecksByDateRange(startDate, endDate))
        .filter(c => nonAdminUserIds.has(c.userId));
      const userFilteredFreeshipVoucherUsage = (await storage.getFreeshipVoucherUsageByDateRange(startDate, endDate))
        .filter(u => nonAdminUserIds.has(u.userId));

      // Get service pricing for accurate revenue calculation
      const expressTrackingCost = await storage.requireServicePrice('express_tracking_check');
      const freeshipVoucherCost = await storage.requireServicePrice('freeship_voucher_usage');

      // Recalculate service usage with filtered data including new services - UPDATED PRICES
      const filteredServiceUsage = [
        { service: 'Kiểm tra số', count: userFilteredPhoneChecks.length, revenue: userFilteredPhoneChecks.length * 100 },
        { service: 'Kiểm tra TK', count: userFilteredAccountChecks.length, revenue: userFilteredAccountChecks.length * 100 },
        { service: 'Theo dõi đơn hàng', count: userFilteredTrackingChecks.length, revenue: userFilteredTrackingChecks.length * 100 },
        { service: 'Lấy cookie SPC_ST', count: userFilteredCookieExtractions.length, revenue: userFilteredCookieExtractions.length * 100 },
        { service: 'Thuê số Shopee', count: userFilteredPhoneRentals.length, revenue: filteredPhoneRentalRevenue },
        { service: 'Thuê số TikTok', count: userFilteredTiktokRentals.length, revenue: userFilteredTiktokRentals.length * 100 },
        { service: 'Thêm email', count: userFilteredEmailAdditions.length, revenue: userFilteredEmailAdditions.length * 100 },
        { service: 'Kiểm tra MVĐ hỏa tốc', count: userFilteredExpressTrackingChecks.length, revenue: userFilteredExpressTrackingChecks.length * expressTrackingCost },
        { service: 'Sử dụng voucher freeship', count: userFilteredFreeshipVoucherUsage.length, revenue: userFilteredFreeshipVoucherUsage.length * freeshipVoucherCost },
        { service: 'Check voucher hỏa tốc', count: userFilteredCookieRapidChecks.length, revenue: userFilteredCookieRapidChecks.length * 500 }
      ];
      
      const totalUsage = filteredServiceUsage.reduce((sum, s) => sum + s.count, 0);
      const totalRevenue = filteredServiceUsage.reduce((sum, s) => sum + s.revenue, 0);
      
      const result = {
        totalUsage,
        totalRevenue,
        totalLogins: loginLogs.length,
        serviceUsage, // Keep original for service breakdown display
        dailyUsageTrend,
        period
      };
      
      // Cache the result
      analyticsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      res.json(result);
    } catch (error) {
      console.error('Overview analytics error:', error);
      res.status(500).json({ message: 'Không thể tải tổng quan hệ thống' });
    }
  });

  // 2. Service Analysis - Phân tích theo dịch vụ
  app.get("/api/analytics/service-details", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const { service, period = 'week' } = req.query;
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }
      
      let serviceData: any = {};
      
      if (service === 'phone-rental') {
        // 🚀 OPTIMIZED: Query directly by date range
        const filtered = await storage.getPhoneRentalHistoryWithFilter({ 
          limit: 5000, 
          startDate, 
          endDate 
        });
        
        const dailyRentals = new Map<string, number>();
        const successRate = filtered.length > 0 ? 
          (filtered.filter(r => r.status === 'completed').length / filtered.length) * 100 : 0;
        
        filtered.forEach(rental => {
          const date = new Date(rental.createdAt).toISOString().split('T')[0];
          dailyRentals.set(date, (dailyRentals.get(date) || 0) + 1);
        });
        
        // Get top users for this service
        const userUsage = new Map<number, number>();
        filtered.forEach(rental => {
          userUsage.set(rental.userId, (userUsage.get(rental.userId) || 0) + 1);
        });
        
        const users = await storage.getAllUsers();
        const topUsers = Array.from(userUsage.entries())
          .map(([userId, count]) => {
            const user = users.find(u => u.id === userId);
            return { userId, username: user?.username || 'Unknown', count };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        
        serviceData = {
          totalCount: filtered.length,
          successCount: filtered.filter(r => r.status === 'completed').length,
          failureCount: filtered.filter(r => r.status !== 'completed').length,
          successRate,
          totalRevenue: filtered.reduce((sum, r) => sum + (r.cost || 1900), 0),
          dailyTrend: Array.from(dailyRentals.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          topUsers
        };
      }
      
      if (service === 'tracking-check') {
        // 🚀 OPTIMIZED: Query directly by date range
        const filtered = await storage.getTrackingChecksByDateRange(startDate, endDate);
        
        const dailyChecks = new Map<string, number>();
        filtered.forEach(check => {
          const date = new Date(check.createdAt).toISOString().split('T')[0];
          dailyChecks.set(date, (dailyChecks.get(date) || 0) + 1);
        });
        
        // Order status analysis
        const statusCounts = new Map<string, number>();
        filtered.forEach(check => {
          const statusKey = check.status.toString(); // Convert boolean to string
          statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
        });
        
        const orderStatuses = Array.from(statusCounts.entries())
          .map(([status, count]) => ({ status, count }));
        
        serviceData = {
          totalCount: filtered.length,
          successCount: filtered.filter(t => t.status === true).length,
          failureCount: filtered.filter(t => t.status !== true).length,
          successRate: filtered.length > 0 ? (filtered.filter(t => t.status === true).length / filtered.length) * 100 : 0,
          totalRevenue: filtered.length * 100,
          dailyTrend: Array.from(dailyChecks.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          orderStatuses
        };
      }
      
      res.json(serviceData);
    } catch (error) {
      console.error('Service details analytics error:', error);
      res.status(500).json({ message: 'Không thể tải chi tiết dịch vụ' });
    }
  });

  // 3. User Behavior Analysis - Phân tích người dùng
  app.get("/api/analytics/user-behavior", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const { period = 'week' } = req.query;
      const cacheKey = `analytics_user_behavior_${period}`;
      
      // Check cache first
      const cached = analyticsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < ANALYTICS_CACHE_TTL) {
        return res.json(cached.data);
      }
      
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }
      
      const users = await storage.getAllUsers();
      const transactions = await storage.getTransactionsWithFilter({ limit: 1000, offset: 0 });
      const auditLogs = await storage.getAuditLogsWithPagination(1, 5000);
      
      // Filter transactions by period
      const periodTransactions = transactions.filter(t => 
        new Date(t.createdAt) >= startDate && new Date(t.createdAt) <= endDate
      );
      
      // Calculate user statistics - exclude admin and superadmin users
      const userActivity = users
        .filter(user => user.role !== 'admin' && user.role !== 'superadmin') // Exclude admin and superadmin
        .map(user => {
          const userTransactions = periodTransactions.filter(t => t.userId === user.id);
          const userRevenue = userTransactions
            .filter(t => parseFloat(t.amount) < 0 && !t.type?.includes('refund'))
            .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
          
          const userLogins = auditLogs.filter(log => 
            log.userId === user.id && 
            log.action === 'LOGIN' &&
            new Date(log.timestamp) >= startDate && 
            new Date(log.timestamp) <= endDate
          ).length;
          
          return {
            userId: user.id,
            username: user.username,
            fullName: user.fullName,
            transactionCount: userTransactions.length,
            revenue: userRevenue,
            loginCount: userLogins,
            balance: user.balance,
            isActive: user.isActive,
            lastActivity: userTransactions.length > 0 ? 
              userTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt : 
              user.updatedAt
          };
        });
      
      // Sort by revenue
      const topUsersByRevenue = userActivity
        .filter(u => u.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
      
      // Sort by activity
      const mostActiveUsers = userActivity
        .filter(u => u.transactionCount > 0)
        .sort((a, b) => b.transactionCount - a.transactionCount)
        .slice(0, 10);
      
      // 🚀 OPTIMIZED: Query IP analysis data by date range
      const ipActivity = new Map<string, { count: number; users: Set<number> }>();
      
      const allServices = [
        ...(await storage.getPhoneChecksByDateRange(startDate, endDate)).filter(p => p.userIp),
        ...(await storage.getAccountChecksByDateRange(startDate, endDate)).filter(a => a.userIp),
        ...(await storage.getTrackingChecksByDateRange(startDate, endDate)).filter(t => t.userIp),
        ...(await storage.getCookieExtractionsByDateRange(startDate, endDate)).filter(c => c.userIp),
        ...(await storage.getPhoneRentalHistoryWithFilter({ limit: 5000, startDate, endDate })).filter(p => p.userIp),
        ...(await storage.getCookieRapidChecksByDateRange(startDate, endDate)).filter(c => c.userIp),
        ...(await storage.getEmailAdditionsByDateRange(startDate, endDate)).filter(e => e.userIp)
      ];
      
      allServices.forEach(item => {
        if (item.userIp) {
          if (!ipActivity.has(item.userIp)) {
            ipActivity.set(item.userIp, { count: 0, users: new Set() });
          }
          const ipData = ipActivity.get(item.userIp)!;
          ipData.count++;
          ipData.users.add(item.userId);
        }
      });
      
      const suspiciousIPs = Array.from(ipActivity.entries())
        .map(([ip, data]) => {
          // Get usernames for this IP
          const usersForThisIP = Array.from(data.users);
          const usernames = usersForThisIP
            .map(userId => {
              const user = users.find(u => u.id === userId);
              return user ? user.username : `ID-${userId}`;
            })
            .join(', ');
          
          return {
            ip,
            requestCount: data.count,
            userCount: data.users.size,
            avgRequestsPerUser: Math.round(data.count / data.users.size),
            usernames // Add usernames field
          };
        })
        .filter(ip => ip.requestCount > 50 || ip.avgRequestsPerUser > 20)
        .sort((a, b) => b.requestCount - a.requestCount);
      
      res.json({
        topUsersByRevenue,
        mostActiveUsers,
        suspiciousIPs,
        totalActiveUsers: userActivity.filter(u => u.transactionCount > 0).length,
        newUsers: users.filter(u => new Date(u.createdAt) >= startDate).length,
        returningUsers: userActivity.filter(u => u.transactionCount > 0 && new Date(u.createdAt) < startDate).length
      });
    } catch (error) {
      console.error('User behavior analytics error:', error);
      res.status(500).json({ message: 'Không thể tải phân tích người dùng' });
    }
  });

  // 4. Real-time Analytics - Thống kê thời gian thực
  app.get("/api/analytics/real-time", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const now = new Date();
      const last15Min = new Date(now.getTime() - 15 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
      
      // 🚀 OPTIMIZED: Query recent service usage directly by date range (last 15 minutes)
      const recentPhoneChecks = await storage.getPhoneChecksByDateRange(last15Min, now);
      const recentAccountChecks = await storage.getAccountChecksByDateRange(last15Min, now);
      const recentTrackingChecks = await storage.getTrackingChecksByDateRange(last15Min, now);
      const recentCookieExtractions = await storage.getCookieExtractionsByDateRange(last15Min, now);
      const recentPhoneRentals = await storage.getPhoneRentalHistoryWithFilter({ limit: 5000, startDate: last15Min, endDate: now });
      const recentTiktokRentals = await storage.getTiktokRentalsWithFilter({ limit: 5000, startDate: last15Min, endDate: now });
      
      const currentActiveServices = [
        { service: 'Kiểm tra số', count: recentPhoneChecks.length },
        { service: 'Kiểm tra TK', count: recentAccountChecks.length },
        { service: 'Theo dõi đơn hàng', count: recentTrackingChecks.length },
        { service: 'Lấy cookie', count: recentCookieExtractions.length },
        { service: 'Thuê số Shopee', count: recentPhoneRentals.length },
        { service: 'Thuê số TikTok', count: recentTiktokRentals.length }
      ].sort((a, b) => b.count - a.count);
      
      // Active sessions count
      const activeSessions = [
        ...(await storage.getActivePhoneRentalSessions()),
        ...(await storage.getActiveTiktokSessions(1))
      ];
      
      // Recent logins (last hour)
      const recentLogins = (await storage.getAuditLogsWithPagination(1, 1000))
        .filter(log => log.action === 'LOGIN' && new Date(log.timestamp) >= lastHour)
        .length;
      
      const totalCurrentActivity = currentActiveServices.reduce((sum, s) => sum + s.count, 0);
      
      res.json({
        currentActiveServices,
        activeSessions: activeSessions.length,
        recentLogins,
        totalCurrentActivity,
        lastUpdated: now.toISOString()
      });
    } catch (error) {
      console.error('Real-time analytics error:', error);
      res.status(500).json({ message: 'Không thể tải thống kê thời gian thực' });
    }
  });

  // 5. Performance Analytics - Hành vi và hiệu suất dịch vụ
  app.get("/api/analytics/performance", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const { period = 'week' } = req.query;
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }
      
      // 🚀 OPTIMIZED: Query service performance data by date range
      const filtered = {
        phoneRentals: await storage.getPhoneRentalHistoryWithFilter({ limit: 5000, startDate, endDate }),
        tiktokRentals: await storage.getTiktokRentalsWithFilter({ limit: 5000, startDate, endDate }),
        accountChecks: await storage.getAccountChecksByDateRange(startDate, endDate),
        trackingChecks: await storage.getTrackingChecksByDateRange(startDate, endDate)
      };
      
      // UPDATED: Service performance analysis with new success criteria
      const servicePerformance = [
        {
          service: 'Thuê số Shopee',
          totalRequests: filtered.phoneRentals.length,
          successfulRequests: filtered.phoneRentals.filter(r => r.otpCode).length,
          failedRequests: filtered.phoneRentals.filter(r => !r.otpCode).length,
          successRate: filtered.phoneRentals.length > 0 ? 
            (filtered.phoneRentals.filter(r => r.otpCode).length / filtered.phoneRentals.length) * 100 : 0,
          avgProcessingTime: 360 // seconds (6 minutes average)
        },
        {
          service: 'Thuê số TikTok',
          totalRequests: filtered.tiktokRentals.length,
          successfulRequests: filtered.tiktokRentals.filter(r => r.userId !== 3 && r.otpCode).length,
          failedRequests: filtered.tiktokRentals.filter(r => !r.otpCode).length,
          successRate: filtered.tiktokRentals.length > 0 ? 
            (filtered.tiktokRentals.filter(r => r.userId !== 3 && r.otpCode).length / filtered.tiktokRentals.length) * 100 : 0,
          avgProcessingTime: 360
        },
        {
          service: 'Kiểm tra TK',
          totalRequests: filtered.accountChecks.length,
          successfulRequests: filtered.accountChecks.filter(a => a.userId !== 3 && a.status === true).length,
          failedRequests: filtered.accountChecks.filter(a => !(a.userId !== 3 && a.status === true)).length,
          successRate: filtered.accountChecks.length > 0 ? 
            (filtered.accountChecks.filter(a => a.userId !== 3 && a.status === true).length / filtered.accountChecks.length) * 100 : 0,
          avgProcessingTime: 8 // seconds
        },
        {
          service: 'Theo dõi đơn hàng',
          totalRequests: filtered.trackingChecks.length,
          successfulRequests: filtered.trackingChecks.filter(t => t.userId !== 3 && t.status === true).length,
          failedRequests: filtered.trackingChecks.filter(t => !(t.userId !== 3 && t.status === true)).length,
          successRate: filtered.trackingChecks.length > 0 ? 
            (filtered.trackingChecks.filter(t => t.userId !== 3 && t.status === true).length / filtered.trackingChecks.length) * 100 : 0,
          avgProcessingTime: 8
        }
      ];
      
      // Error analysis
      const errorAnalysis = {
        phoneRentalErrors: filtered.phoneRentals.filter(r => r.status === 'failed').length,
        tiktokRentalErrors: filtered.tiktokRentals.filter(r => r.status === 'failed').length,
        accountCheckErrors: filtered.accountChecks.filter(a => a.status !== true).length,
        trackingCheckErrors: filtered.trackingChecks.filter(t => t.status !== true).length
      };
      
      res.json({
        servicePerformance,
        errorAnalysis,
        period
      });
    } catch (error) {
      console.error('Performance analytics error:', error);
      res.status(500).json({ message: 'Không thể tải phân tích hiệu suất' });
    }
  });

  // Advanced analytics endpoints
  app.get("/api/analytics/user-stats", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Getting user statistics...');
      
      // Get user activity stats
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const allTransactions = await storage.getTransactionsByDateRange(startDate, endDate);
      const allUsers = await storage.getAllUsers();
      
      // Calculate user statistics
      const userStats = new Map();
      
      allUsers.forEach(user => {
        userStats.set(user.id, {
          userId: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          balance: user.balance,
          totalSpent: 0,
          totalTopup: 0,
          transactionCount: 0,
          services: new Set(),
          lastActivity: null
        });
      });
      
      allTransactions.forEach(transaction => {
        if (userStats.has(transaction.userId)) {
          const userStat = userStats.get(transaction.userId);
          const amount = parseFloat(transaction.amount);
          
          userStat.transactionCount++;
          userStat.lastActivity = transaction.createdAt;
          
          if (amount > 0) {
            // Chỉ tính top-up từ giao dịch completed
            if (transaction.type === 'top_up' && transaction.status === 'completed') {
              userStat.totalTopup += amount;
            }
            // Hoàn tiền - trừ khỏi chi tiêu
            if (transaction.type === 'refund') {
              userStat.totalSpent = Math.max(0, userStat.totalSpent - amount);
            }
          } else {
            // DOANH THU THỰC: tiền user trả cho dịch vụ (không tính refund và admin)
            if (transaction.type && !transaction.type.includes('refund') && !transaction.type.includes('admin')) {
              userStat.totalSpent += Math.abs(amount);
            }
          }
          
          if (transaction.type) {
            userStat.services.add(transaction.type);
          }
        }
      });
      
      // Convert to array and sort by total spent (ensure non-negative values)
      const userStatsArray = Array.from(userStats.values())
        .map(stat => ({
          ...stat,
          totalSpent: Math.max(0, stat.totalSpent), // Đảm bảo không âm
          services: Array.from(stat.services),
          serviceCount: stat.services.length,
          lastActivity: stat.lastActivity ? stat.lastActivity.toISOString() : null
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent);
      
      res.json(userStatsArray);
    } catch (error) {
      console.error('User stats analytics error:', error);
      res.status(500).json({ message: 'Không thể tải thống kê người dùng' });
    }
  });

  app.get("/api/analytics/service-performance", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Getting service performance...');
      
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const allTransactions = await storage.getTransactionsByDateRange(startDate, endDate);
      
      // Service performance analysis
      const serviceStats = new Map();
      
      allTransactions.forEach(transaction => {
        const serviceType = transaction.type || 'unknown';
        const amount = Math.abs(parseFloat(transaction.amount));
        
        if (!serviceStats.has(serviceType)) {
          serviceStats.set(serviceType, {
            serviceName: serviceType,
            totalRevenue: 0,
            transactionCount: 0,
            successCount: 0,
            failureCount: 0,
            avgTransactionValue: 0,
            dailyUsage: new Map()
          });
        }
        
        const stat = serviceStats.get(serviceType);
        const date = transaction.createdAt.toISOString().split('T')[0];
        
        stat.transactionCount++;
        
        // Logic phân loại theo từng loại dịch vụ
        if (transaction.type && (transaction.type.includes('otissim') || transaction.type.includes('tiktok_rental'))) {
          // PHONE RENTAL SERVICES: dựa trên session thành công/thất bại
          if (parseFloat(transaction.amount) < 0) {
            // Trừ tiền ban đầu = bắt đầu session
            stat.totalRevenue += amount;
            // Sẽ được tính thành công nếu không có refund tương ứng
            stat.successCount++;
          } else if (transaction.type === 'refund') {
            // Có refund = session thất bại, trừ đi 1 success đã tính
            stat.successCount = Math.max(0, stat.successCount - 1);
            stat.failureCount++;
          }
        } else {
          // CÁC DỊCH VỤ KHÁC: dựa trên giao dịch thành công
          if (parseFloat(transaction.amount) < 0 && !transaction.type.includes('refund') && !transaction.type.includes('admin')) {
            stat.totalRevenue += amount;
            stat.successCount++;
          } else if (transaction.type && transaction.type.includes('refund')) {
            stat.failureCount++;
          }
        }
        
        // Track daily usage
        if (!stat.dailyUsage.has(date)) {
          stat.dailyUsage.set(date, 0);
        }
        stat.dailyUsage.set(date, stat.dailyUsage.get(date) + 1);
      });
      
      // Calculate averages and convert to array
      const serviceStatsArray = Array.from(serviceStats.values())
        .map(stat => ({
          ...stat,
          avgTransactionValue: stat.transactionCount > 0 ? stat.totalRevenue / stat.transactionCount : 0,
          successRate: stat.transactionCount > 0 ? (stat.successCount / stat.transactionCount) * 100 : 0,
          dailyUsage: Array.from(stat.dailyUsage.entries()).map(([date, count]) => ({ date, count }))
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
      
      res.json(serviceStatsArray);
    } catch (error) {
      console.error('Service performance analytics error:', error);
      res.status(500).json({ message: 'Không thể tải hiệu suất dịch vụ' });
    }
  });

  app.get("/api/analytics/growth-metrics", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Getting growth metrics...');
      
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const previousStartDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      
      const currentTransactions = await storage.getTransactionsByDateRange(startDate, endDate);
      const previousTransactions = await storage.getTransactionsByDateRange(previousStartDate, startDate);
      
      // Calculate current period metrics - DOANH THU THỰC (tiền user trả cho dịch vụ thành công)
      let currentRevenue = currentTransactions
        .filter(t => parseFloat(t.amount) < 0 && t.type && !t.type.includes('refund') && !t.type.includes('admin'))
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
      
      // Trừ đi tiền hoàn lại
      const currentRefunds = currentTransactions
        .filter(t => t.type && t.type.includes('refund') && parseFloat(t.amount) > 0)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      currentRevenue = Math.max(0, currentRevenue - currentRefunds);
      
      // CHI TIÊU THỰC = DOANH THU THỰC (trong business model này)
      const currentRealExpense = currentRevenue;
      
      const currentTransactionCount = currentTransactions.length;
      const currentActiveUsers = new Set(currentTransactions.map(t => t.userId)).size;
      
      // Calculate previous period metrics - DOANH THU THỰC  
      let previousRevenue = previousTransactions
        .filter(t => parseFloat(t.amount) < 0 && t.type && !t.type.includes('refund') && !t.type.includes('admin'))
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
      
      const previousRefunds = previousTransactions
        .filter(t => t.type && t.type.includes('refund') && parseFloat(t.amount) > 0)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      previousRevenue = Math.max(0, previousRevenue - previousRefunds);
      
      // CHI TIÊU THỰC = DOANH THU THỰC (trong business model này)
      const previousRealExpense = previousRevenue;
      
      const previousTransactionCount = previousTransactions.length;
      const previousActiveUsers = new Set(previousTransactions.map(t => t.userId)).size;
      
      // Calculate growth rates
      const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
      const transactionGrowth = previousTransactionCount > 0 ? ((currentTransactionCount - previousTransactionCount) / previousTransactionCount) * 100 : 0;
      const userGrowth = previousActiveUsers > 0 ? ((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100 : 0;
      
      // Daily growth trend
      const dailyMetrics = new Map();
      
      currentTransactions.forEach(transaction => {
        const date = transaction.createdAt.toISOString().split('T')[0];
        if (!dailyMetrics.has(date)) {
          dailyMetrics.set(date, {
            date,
            revenue: 0,
            transactions: 0,
            activeUsers: new Set()
          });
        }
        
        const metric = dailyMetrics.get(date);
        metric.transactions++;
        metric.activeUsers.add(transaction.userId);
        
        const amount = parseFloat(transaction.amount);
        // DOANH THU THỰC: chỉ tính top-up
        if (transaction.type === 'top_up' && amount > 0) {
          metric.revenue += amount;
        }
      });
      
      const growthTrend = Array.from(dailyMetrics.values())
        .map(metric => ({
          ...metric,
          activeUsers: metric.activeUsers.size
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      res.json({
        currentPeriod: {
          revenue: currentRevenue,
          transactions: currentTransactionCount,
          activeUsers: currentActiveUsers
        },
        previousPeriod: {
          revenue: previousRevenue,
          transactions: previousTransactionCount,
          activeUsers: previousActiveUsers
        },
        growth: {
          revenue: revenueGrowth,
          transactions: transactionGrowth,
          users: userGrowth
        },
        dailyTrend: growthTrend
      });
    } catch (error) {
      console.error('Growth metrics analytics error:', error);
      res.status(500).json({ message: 'Không thể tải chỉ số tăng trưởng' });
    }
  });

  // Voucher Freeship Analytics - Thống kê voucher freeship
  app.get("/api/analytics/voucher-freeship", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[Analytics] Getting voucher freeship statistics...');
      
      const { period = 'week' } = req.query;
      const endDate = new Date();
      let startDate: Date;
      
      // Calculate date range based on period
      switch (period) {
        case 'today':
          startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          break;
        case 'week':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }
      
      // Get voucher saving operations within period
      const operations = await storage.getVoucherOperationsByDateRange(startDate, endDate);
      
      // 🚀 OPTIMIZED: Query freeship voucher usage directly by date range
      const periodFreeshipUsage = await storage.getFreeshipVoucherUsageByDateRange(startDate, endDate);
      
      // UPDATED LOGIC: Calculate statistics with userId filter (exclude userId 3)
      // Voucher saving operations (new type): userId khác 3 VÀ successfulSaves >= 1
      const voucherSavingOps = operations.filter(op => op.userId !== 3).length;
      const successfulVoucherSaving = operations.filter(op => 
        op.userId !== 3 && op.status === 'success' && (op.successfulSaves || 0) >= 1
      ).length;
      const failedVoucherSaving = operations.filter(op => op.userId !== 3 && op.status === 'failed').length;
      const pendingVoucherSaving = operations.filter(op => op.userId !== 3 && op.status === 'pending').length;
      
      // Freeship usage (old type): userId khác 3 VÀ status = 'used'
      const freeshipUsageOps = periodFreeshipUsage.filter(usage => usage.userId !== 3).length;
      const successfulFreeshipUsage = periodFreeshipUsage.filter(usage => 
        usage.userId !== 3 && usage.status === 'used'
      ).length;
      const failedFreeshipUsage = periodFreeshipUsage.filter(usage => 
        usage.userId !== 3 && usage.status === 'failed'
      ).length;
      
      // Combined totals
      const totalOperations = voucherSavingOps + freeshipUsageOps;
      const successfulOperations = successfulVoucherSaving + successfulFreeshipUsage;
      const failedOperations = failedVoucherSaving + failedFreeshipUsage;
      const pendingOperations = pendingVoucherSaving;
      
      // UPDATED: Apply userId filter when counting vouchers
      const totalVouchersFound = operations.filter(op => op.userId !== 3).reduce((sum, op) => sum + (op.totalVouchersFound || 0), 0) + periodFreeshipUsage.filter(usage => usage.userId !== 3).length;
      const totalVouchersSaved = operations.filter(op => op.userId !== 3).reduce((sum, op) => sum + (op.successfulSaves || 0), 0) + successfulFreeshipUsage;
      const totalVouchersFailed = operations.filter(op => op.userId !== 3).reduce((sum, op) => sum + (op.failedSaves || 0), 0) + failedFreeshipUsage;
      
      // Fix revenue calculation - both types cost 2000đ each for successful operations
      const totalRevenue = (successfulVoucherSaving * 2000) + (successfulFreeshipUsage * 2000);
      const averageVouchersPerOperation = totalOperations > 0 ? Math.round(totalVouchersFound / totalOperations) : 0;
      const successRate = totalOperations > 0 ? Math.round((successfulOperations / totalOperations) * 100) : 0;
      const saveSuccessRate = totalVouchersFound > 0 ? Math.round((totalVouchersSaved / totalVouchersFound) * 100) : 0;
      
      // UPDATED: Daily breakdown - include both voucher types, filter userId !== 3
      const dailyStats = new Map();
      
      // Add voucher saving operations (new type) - only userId !== 3
      operations.filter(op => op.userId !== 3).forEach(op => {
        const date = op.createdAt.toISOString().split('T')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            date,
            operations: 0,
            successful: 0,
            failed: 0,
            vouchersFound: 0,
            vouchersSaved: 0,
            revenue: 0
          });
        }
        
        const dayData = dailyStats.get(date);
        dayData.operations++;
        if (op.status === 'success' && (op.successfulSaves || 0) >= 1) {
          dayData.successful++;
          dayData.revenue += 2000; // Fixed price for successful voucher saving
        }
        if (op.status === 'failed') dayData.failed++;
        dayData.vouchersFound += op.totalVouchersFound || 0;
        dayData.vouchersSaved += op.successfulSaves || 0;
      });
      
      // Add freeship usage operations (old type) - only userId !== 3
      periodFreeshipUsage.filter(usage => usage.userId !== 3).forEach(usage => {
        const date = new Date(usage.createdAt).toISOString().split('T')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            date,
            operations: 0,
            successful: 0,
            failed: 0,
            vouchersFound: 0,
            vouchersSaved: 0,
            revenue: 0
          });
        }
        
        const dayData = dailyStats.get(date);
        dayData.operations++;
        dayData.vouchersFound++;
        if (usage.status === 'used') {
          dayData.successful++;
          dayData.vouchersSaved++;
          dayData.revenue += 2000; // Fixed price for successful freeship usage
        }
        if (usage.status === 'failed') dayData.failed++;
      });
      
      const dailyBreakdown = Array.from(dailyStats.values())
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // UPDATED: Top users by voucher usage - include both voucher types, filter userId !== 3
      const userStats = new Map();
      
      // Add voucher saving operations (new type) - only userId !== 3
      operations.filter(op => op.userId !== 3).forEach(op => {
        if (!userStats.has(op.userId)) {
          userStats.set(op.userId, {
            userId: op.userId,
            operations: 0,
            vouchersSaved: 0,
            totalSpent: 0
          });
        }
        
        const userStat = userStats.get(op.userId);
        userStat.operations++;
        userStat.vouchersSaved += op.successfulSaves || 0;
        if (op.status === 'success' && (op.successfulSaves || 0) >= 1) {
          userStat.totalSpent += 2000; // Fixed price for successful voucher saving
        }
      });
      
      // Add freeship usage operations (old type) - only userId !== 3
      periodFreeshipUsage.filter(usage => usage.userId !== 3).forEach(usage => {
        if (!userStats.has(usage.userId)) {
          userStats.set(usage.userId, {
            userId: usage.userId,
            operations: 0,
            vouchersSaved: 0,
            totalSpent: 0
          });
        }
        
        const userStat = userStats.get(usage.userId);
        userStat.operations++;
        if (usage.status === 'used') {
          userStat.vouchersSaved++;
          userStat.totalSpent += 2000; // Fixed price for successful freeship usage
        }
      });
      
      const topUsers = Array.from(userStats.values())
        .sort((a, b) => b.vouchersSaved - a.vouchersSaved)
        .slice(0, 10);

      res.json({
        summary: {
          totalOperations,
          successfulOperations,
          failedOperations,
          pendingOperations,
          successRate,
          totalVouchersFound,
          totalVouchersSaved,
          totalVouchersFailed,
          saveSuccessRate,
          averageVouchersPerOperation,
          totalRevenue
        },
        dailyBreakdown,
        topUsers,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          periodType: period
        }
      });
    } catch (error) {
      console.error('Voucher freeship analytics error:', error);
      res.status(500).json({ message: 'Không thể tải thống kê voucher freeship' });
    }
  });


  // Bulk account check endpoint - OPTIMIZED FOR PARALLEL PROCESSING
  app.post("/api/account-check/bulk", authenticateTokenOrApiKey, checkApiKeyPermission('account_check'), async (req: any, res) => {
    try {
      const { entries } = req.body; // Array of { cookie: string, proxy?: string }
      const userIP = getUserIP(req);
      
      console.log('Bulk account check received:', { 
        entriesCount: entries?.length, 
        entriesType: typeof entries,
        firstEntry: entries?.[0],
        firstEntryType: typeof entries?.[0]
      });
      
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: 'Danh sách cookie không hợp lệ' });
      }

      // TRỪ TIỀN TRƯỚC - Charge upfront for bulk check
      const totalCost = entries.length * 100;
      const userBalance = await storage.getUserBalance(req.user.id);

      if (userBalance < totalCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND, có ${userBalance.toLocaleString('vi-VN')} VND` 
        });
      }

      // Deduct balance upfront
      await storage.updateUserBalance(req.user.id, userBalance - totalCost);

      // Create upfront transaction
      await storage.createTransaction({
        userId: req.user.id,
        type: 'account_check',
        amount: (-totalCost).toString(),
        description: `Kiểm tra bulk ${entries.length} cookie (trừ tiền trước)`,
        status: 'completed'
      });

      // Get active proxies once
      const httpProxies = await storage.getAllHttpProxies();
      const activeHttpProxies = httpProxies.filter(proxy => proxy.isActive);
      
      // Proxy rotation counter for better distribution
      let proxyCounter = 0;
      
      // Dedup map for cookie values in this request to prevent DB races
      const cookieIdMap = new Map<string, string>();
      
      // Helper function to process a single entry
      const processEntry = async (entry: any, index: number) => {
        // Handle both string and object formats
        if (typeof entry === 'string') {
          entry = { cookie: entry, proxy: null };
        }
        
        console.log(`[COOKIE-CHECK] Processing entry ${index + 1}/${entries.length}:`, { 
          entryType: typeof entry, 
          hasCookie: !!entry.cookie, 
          cookieLength: entry.cookie?.length,
          hasProxy: !!entry.proxy
        });
        
        if (!entry.cookie) {
          console.error(`Entry ${index + 1} has no cookie property:`, entry);
          return {
            cookieId: `BULK_${Date.now()}_${index}`,
            status: false,
            message: 'Cookie không hợp lệ',
            proxy: 'System'
          };
        }
        
        let proxy_dict = null;

        try {
          // Parse proxy if provided
          if (entry.proxy && entry.proxy.trim()) {
            const proxyParts = entry.proxy.split(':');
            if (proxyParts.length >= 2) {
              proxy_dict = {
                ip: proxyParts[0],
                port: proxyParts[1],
                username: proxyParts[2] || null,
                password: proxyParts[3] || null,
                type: 'http'
              };
            }
          }

          // Use HTTP proxy fallback if no proxy provided
          if (!proxy_dict && activeHttpProxies.length > 0) {
            const selectedProxy = activeHttpProxies[proxyCounter % activeHttpProxies.length];
            proxyCounter++;
            
            proxy_dict = {
              ip: selectedProxy.ip,
              port: selectedProxy.port.toString(),
              username: selectedProxy.username,
              password: selectedProxy.password,
              type: 'http'
            };

            // Update proxy usage (non-blocking)
            storage.updateHttpProxyUsage(selectedProxy.id).catch(e => 
              console.error('Proxy usage update error:', e)
            );
          }

          console.log(`Checking entry ${index + 1}: ${entry.cookie.substring(0, 20)}... with proxy:`, proxy_dict?.ip);

          // Enhanced retry logic with better error handling
          let accountInfo;
          let attempts = 0;
          let currentProxyDict = proxy_dict;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            attempts++;
            
            try {
              console.log(`Bulk check attempt ${attempts} for entry ${index + 1}`);
              
              // Add small delay between attempts to avoid rate limiting
              if (attempts > 1) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempts));
              }
              
              // Call Shopee API with enhanced error handling
              accountInfo = await get_account_info(entry.cookie, currentProxyDict);
              
              // If successful, break out immediately
              if (accountInfo.status && accountInfo.data) {
                console.log(`✅ Success on attempt ${attempts} for entry ${index + 1}`);
                break;
              }
              
              // Check if this is a proxy-related error that should trigger retry
              const isProxyError = accountInfo.message.includes('402') || 
                                   accountInfo.message.includes('Bandwidth limit') ||
                                   accountInfo.message.includes('timeout') ||
                                   accountInfo.message.includes('ECONNRESET') ||
                                   accountInfo.message.includes('ETIMEDOUT');
              
              // If it's not a proxy error or we're on last attempt, break
              if (!isProxyError || attempts >= maxAttempts) {
                console.log(`❌ Final result for entry ${index + 1}: ${accountInfo.message}`);
                break;
              }
              
            } catch (error: any) {
              console.log(`❌ Exception on attempt ${attempts} for entry ${index + 1}:`, error.message);
              
              // Check if this is a proxy/network error that should trigger retry
              const isRetryableError = error.message.includes('402') || 
                                       error.message.includes('Bandwidth limit') ||
                                       error.message.includes('timeout') ||
                                       error.message.includes('ECONNRESET') ||
                                       error.message.includes('ETIMEDOUT') ||
                                       error.message.includes('socket hang up');
              
              if (isRetryableError && attempts < maxAttempts) {
                console.log(`Retryable error detected, trying next proxy...`);
                
                // Get next HTTP proxy
                if (activeHttpProxies.length > 0) {
                  const nextProxyIndex = (index + attempts) % activeHttpProxies.length;
                  const nextProxy = activeHttpProxies[nextProxyIndex];
                  
                  currentProxyDict = {
                    ip: nextProxy.ip,
                    port: nextProxy.port.toString(),
                    username: nextProxy.username,
                    password: nextProxy.password,
                    type: 'http'
                  };
                  
                  console.log(`Switching to proxy: ${nextProxy.ip}:${nextProxy.port}`);
                  storage.updateHttpProxyUsage(nextProxy.id).catch(e => 
                    console.error('Proxy usage update error:', e)
                  );
                  continue;
                } else {
                  console.log('No more HTTP proxies available');
                  accountInfo = { status: false, message: 'Tất cả proxy đã hết băng thông', data: null };
                  break;
                }
              } else {
                // Non-retryable error or no more attempts
                accountInfo = { status: false, message: error.message, data: null };
                break;
              }
            }
          }

          if (accountInfo && accountInfo.status && accountInfo.data) {
            const data = accountInfo.data;
            // Generate unique cookieId with additional randomness
            const uniqueId = `BULK_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Auto-add successful cookie to cookie manager
            let actualCookieId = uniqueId;
            try {
              // Check in-request dedup map first to prevent DB races
              if (cookieIdMap.has(entry.cookie)) {
                actualCookieId = cookieIdMap.get(entry.cookie)!;
                console.log(`Using cached cookie ID from request: ${actualCookieId}`);
              } else {
                // Check if cookie already exists in DB
                const existingCookies = await storage.getShopeeCookiesByUser(req.user.id);
                const existingCookie = existingCookies.find(c => c.cookieValue === entry.cookie);
                
                if (existingCookie) {
                  actualCookieId = existingCookie.id;
                  cookieIdMap.set(entry.cookie, actualCookieId);
                } else {
                  const cookieType = entry.cookie.includes('SPC_ST=') ? 'SPC_ST' : 
                                   entry.cookie.includes('SPC_F=') ? 'SPC_F' : 'Other';
                  
                  const newCookie = await storage.createShopeeCookie({
                    userId: req.user.id,
                    cookieType: cookieType,
                    cookieValue: entry.cookie,
                    shopeeRegion: 'VN'
                  });

                  actualCookieId = newCookie.id;
                  cookieIdMap.set(entry.cookie, actualCookieId);
                }
              }
            } catch (addError) {
              console.error('Error auto-adding cookie:', addError);
            }

            // Record successful check in history
            await storage.createAccountCheck({
              userId: req.user.id,
              cookieId: actualCookieId,
              cookiePreview: entry.cookie,
              status: true,
              message: 'Tài khoản hợp lệ',
              username: data.username || null,
              nickname: data.nickname || null,
              email: data.email || null,
              phone: data.phone || null,
              userid: data.userid || null,
              shopid: data.shopid || null,
              ctime: data.ctime || null,
              proxy: currentProxyDict ? `${currentProxyDict.type}://${currentProxyDict.ip}:${currentProxyDict.port}` : null,
              userIp: userIP
            });

            return {
              cookieId: actualCookieId,
              status: true,
              message: 'Tài khoản hợp lệ',
              username: data.username || null,
              nickname: data.nickname || null,
              email: data.email || null,
              phone: data.phone || null,
              userid: data.userid || null,
              shopid: data.shopid || null,
              ctime: data.ctime || null,
              proxy: currentProxyDict ? `${currentProxyDict.type}://${currentProxyDict.ip}:${currentProxyDict.port}` : 'System'
            };

          } else {
            // Failed check
            const uniqueFailId = `BULK_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
            
            let failedCookieId = uniqueFailId;
            try {
              const cookieType = entry.cookie.includes('SPC_ST=') ? 'SPC_ST' : 
                               entry.cookie.includes('SPC_F=') ? 'SPC_F' : 'Other';
              
              const dummyCookie = await storage.createShopeeCookie({
                userId: req.user.id,
                cookieType: cookieType,
                cookieValue: entry.cookie,
                shopeeRegion: 'VN'
              });
              
              failedCookieId = dummyCookie.id;
            } catch (cookieError) {
              console.error('Error creating cookie for failed check:', cookieError);
            }

            await storage.createAccountCheck({
              userId: req.user.id,
              cookieId: failedCookieId,
              cookiePreview: entry.cookie,
              status: false,
              message: accountInfo?.message || 'Cookie không hợp lệ hoặc tài khoản không tồn tại',
              username: null,
              nickname: null,
              email: null,
              phone: null,
              userid: null,
              shopid: null,
              ctime: null,
              proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null,
              userIp: userIP
            });

            return {
              cookieId: failedCookieId,
              status: false,
              message: accountInfo?.message || 'Cookie không hợp lệ hoặc tài khoản không tồn tại',
              proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : 'System'
            };
          }

        } catch (error: any) {
          console.error(`Error checking entry ${index + 1}:`, error);
          
          const errorCookieId = `BULK_${Date.now()}_${index}`;
          
          // Record error in history
          try {
            const cookieType = entry.cookie?.includes('SPC_ST=') ? 'SPC_ST' : 
                             entry.cookie?.includes('SPC_F=') ? 'SPC_F' : 'Other';
            
            const errorCookie = await storage.createShopeeCookie({
              userId: req.user.id,
              cookieType: cookieType,
              cookieValue: entry.cookie || '',
              shopeeRegion: 'VN'
            });

            await storage.createAccountCheck({
              userId: req.user.id,
              cookieId: errorCookie.id,
              cookiePreview: entry.cookie || 'undefined',
              status: false,
              message: error?.message || 'Lỗi khi kiểm tra cookie',
              username: null,
              nickname: null,
              email: null,
              phone: null,
              userid: null,
              shopid: null,
              ctime: null,
              proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null
            });
          } catch (historyError) {
            console.error('Error recording history:', historyError);
          }

          return {
            cookieId: errorCookieId,
            status: false,
            message: error?.message || 'Lỗi khi kiểm tra cookie',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : 'System'
          };
        }
      };

      // PARALLEL PROCESSING WITH BATCHING
      // Process in batches of 10 to avoid overwhelming the server
      const BATCH_SIZE = 10;
      const results: any[] = [];
      
      console.log(`[PARALLEL] Processing ${entries.length} entries in batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map((entry: any, batchIndex: number) => 
          processEntry(entry, i + batchIndex)
        );
        
        console.log(`[PARALLEL] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, entries ${i + 1}-${Math.min(i + BATCH_SIZE, entries.length)}`);
        
        // Wait for all promises in this batch to settle
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results
        batchResults.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            console.error(`Batch entry ${i + idx + 1} failed:`, result.reason);
            results.push({
              cookieId: `BULK_${Date.now()}_${i + idx}`,
              status: false,
              message: result.reason?.message || 'Lỗi không xác định',
              proxy: 'System'
            });
          }
        });
        
        console.log(`[PARALLEL] Batch complete. Total results so far: ${results.length}/${entries.length}`);
      }

      const successfulChecks = results.filter(r => r.status).length;

      // HOÀN TIỀN CHO CÁC COOKIE THẤT BẠI - Refund for failed cookies
      const failedCount = results.filter(r => !r.status).length;
      if (failedCount > 0) {
        const refundAmount = failedCount * 100;
        const currentBalance = await storage.getUserBalance(req.user.id);
        await storage.updateUserBalance(req.user.id, currentBalance + refundAmount);
        
        // Create refund transaction
        await storage.createTransaction({
          userId: req.user.id,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền kiểm tra bulk (${failedCount} cookie thất bại)`,
          status: 'completed'
        });
      }

      // Create service usage for successful checks
      if (successfulChecks > 0) {
        await storage.createServiceUsage({
          userId: req.user.id,
          serviceType: 'account_check',
          serviceName: 'Kiểm tra tài khoản Shopee (Bulk)',
          description: `Kiểm tra bulk ${successfulChecks} tài khoản thành công`,
          status: 'success',
          cost: (successfulChecks * 100).toString()
        });
      }

      res.json(results);
    } catch (error) {
      console.error('Bulk account check error:', error);
      
      // HOÀN TIỀN TOÀN BỘ KHI LỖI HỆ THỐNG - Full refund on system error
      try {
        const refundAmount = (req.body?.entries?.length || 0) * 100;
        const currentBalance = await storage.getUserBalance(req.user.id);
        const refundBalance = currentBalance + refundAmount;
        await storage.updateUserBalance(req.user.id, refundBalance);
        
        // QUAN TRỌNG: Cung cấp balance manually để tránh cộng tiền 2 lần
        await storage.createTransaction({
          userId: req.user.id,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền kiểm tra bulk - lỗi hệ thống`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: refundBalance.toString()
        });
      } catch (refundError) {
        console.error('Refund error:', refundError);
      }

      res.status(500).json({ message: 'Lỗi hệ thống khi kiểm tra bulk' });
    }
  });

  // Account check history endpoint
  app.get("/api/account-checks", authenticateToken, async (req: any, res) => {
    try {
      const accountChecks = await storage.getAccountChecksByUser(req.user.id);
      res.json(accountChecks);
    } catch (error) {
      console.error('Account checks fetch error:', error);
      res.status(500).json({ message: 'Không thể tải lịch sử kiểm tra' });
    }
  });

  // ==================== SPC_F EXTRACTION ENDPOINTS ====================
  
  // Single SPC_F extraction endpoint
  app.post("/api/spc-f-extract", authenticateToken, async (req: any, res) => {
    try {
      const { cookieIds, proxies } = req.body;
      
      if (!cookieIds || !Array.isArray(cookieIds) || cookieIds.length === 0) {
        return res.status(400).json({ message: 'Cần ít nhất một cookie để trích xuất' });
      }

      // Get user's cookies (SPC_ST)
      const userCookies = await storage.getShopeeCookiesByUser(req.user.id);
      const selectedCookies = userCookies.filter(cookie => cookieIds.includes(cookie.id));
      
      if (selectedCookies.length === 0) {
        return res.status(400).json({ message: 'Không tìm thấy cookie hợp lệ' });
      }

      // Get dynamic pricing from database
      const pricingData = await storage.getServicePricing('spc_f_extract');
      const costPerExtraction = pricingData ? parseFloat(pricingData.price) : 100; // Fallback to 100 VND
      
      // KIỂM TRA SỐ DƯ
      const currentBalance = await storage.getUserBalance(req.user.id);
      const totalCost = selectedCookies.length * costPerExtraction;
      
      if (currentBalance < totalCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND để trích xuất ${selectedCookies.length} cookie. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND.` 
        });
      }

      // Parse proxy list if provided
      let proxyList: any[] = [];
      if (proxies && proxies.length > 0) {
        proxyList = proxies.map((proxyString: string) => {
          const proxy = parseProxy(proxyString);
          if (proxy) {
            return {
              ip: proxy.host,
              port: proxy.port,
              type: proxy.protocol,
              auth: proxy.auth
            };
          }
          return null;
        }).filter((p: any) => p !== null);
      }

      const results = [];
      const userIP = getUserIP(req);
      let runningBalance = currentBalance; // Track balance through the loop
      
      // Loop through each selected cookie
      for (let i = 0; i < selectedCookies.length; i++) {
        const cookie = selectedCookies[i];
        
        // Assign proxy if available
        let proxy_dict = null;
        if (proxyList.length > 0) {
          proxy_dict = proxyList[i % proxyList.length];
        }

        try {
          // Call get_account_info to get SPC_F from response headers
          const result = await get_account_info(cookie.cookieValue, proxy_dict);
          
          // Extract SPC_F from result if available (get_account_info should return it)
          const spcF = result?.spcF || null;
          const username = result?.data?.username || null;
          
          const extractionData = {
            cookieId: cookie.id,
            spcSt: cookie.cookieValue,
            spcF: spcF,
            username: username,
            status: result?.status || false,
            message: result?.message || 'Không thể trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null
          };

          results.push(extractionData);

          // Save to database
          await storage.createSpcFExtraction({
            userId: req.user.id,
            cookieId: cookie.id,
            spcSt: cookie.cookieValue,
            spcF: spcF,
            username: username,
            status: result?.status || false,
            message: result?.message || 'Không thể trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null,
            userIp: userIP
          });

          // Charge only if successful
          if (result?.status && spcF) {
            const newBalance = runningBalance - costPerExtraction;
            await storage.updateUserBalance(req.user.id, newBalance);
            
            await storage.createTransaction({
              userId: req.user.id,
              type: 'spc_f_extract',
              amount: `-${costPerExtraction}`,
              description: `Trích xuất SPC_F: ${username || 'Unknown'}`,
              status: 'completed',
              balanceBefore: runningBalance.toString(),
              balanceAfter: newBalance.toString()
            });
            
            await storage.createServiceUsage({
              userId: req.user.id,
              serviceType: 'spc_f_extract',
              serviceName: 'Trích xuất SPC_F từ SPC_ST',
              description: `Trích xuất SPC_F: ${username || 'Unknown'}`,
              status: 'success',
              cost: costPerExtraction.toString()
            });
            
            // Update running balance for next iteration
            runningBalance = newBalance;
          }

        } catch (error: any) {
          results.push({
            cookieId: cookie.id,
            spcSt: cookie.cookieValue,
            spcF: null,
            username: null,
            status: false,
            message: error?.message || 'Lỗi khi trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null
          });

          // Save failed attempt to database
          await storage.createSpcFExtraction({
            userId: req.user.id,
            cookieId: cookie.id,
            spcSt: cookie.cookieValue,
            spcF: null,
            username: null,
            status: false,
            message: error?.message || 'Lỗi khi trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null,
            userIp: userIP
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error('SPC_F extraction error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống' });
    }
  });

  // SPC_F extraction history endpoint
  app.get("/api/spc-f-extractions", authenticateToken, async (req: any, res) => {
    try {
      const extractions = await storage.getSpcFExtractionsByUser(req.user.id);
      res.json(extractions);
    } catch (error) {
      console.error('SPC_F extractions fetch error:', error);
      res.status(500).json({ message: 'Không thể tải lịch sử trích xuất' });
    }
  });

  // Public endpoint for SPC_F extraction pricing
  app.get("/api/spc-f-extract-price", async (req: any, res) => {
    try {
      const pricing = await storage.getServicePricing('spc_f_extract');
      if (!pricing) {
        return res.json({ price: 100 }); // Fallback to 100
      }
      res.json({ price: parseFloat(pricing.price) });
    } catch (error) {
      console.error('Error fetching SPC_F extract price:', error);
      res.json({ price: 100 }); // Fallback to 100
    }
  });

  // Bulk SPC_F extraction endpoint
  app.post("/api/spc-f-extract/bulk", authenticateToken, async (req: any, res) => {
    try {
      const { entries } = req.body;
      
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ message: 'Cần ít nhất một cookie để trích xuất' });
      }

      // Basic validation - check each entry has cookie
      const validEntries = entries.filter((entry: any) => entry.cookie && entry.cookie.trim().length > 0);
      if (validEntries.length === 0) {
        return res.status(400).json({ message: 'Không có cookie hợp lệ nào được tìm thấy' });
      }

      // Get dynamic pricing from database
      const pricingData = await storage.getServicePricing('spc_f_extract');
      const costPerExtraction = pricingData ? parseFloat(pricingData.price) : 100; // Fallback to 100 VND

      // Calculate cost and check balance
      const totalCost = validEntries.length * costPerExtraction;
      const currentBalance = await storage.getUserBalance(req.user.id);
      
      if (currentBalance < totalCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND để trích xuất ${validEntries.length} cookie. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND.` 
        });
      }

      const results = [];
      const userIP = getUserIP(req);
      let successCount = 0;
      let runningBalance = currentBalance; // Track balance through the loop
      
      // Loop through each entry
      for (const entry of validEntries) {
        const cookieValue = entry.cookie.trim();
        
        // Parse proxy if provided
        let proxy_dict = null;
        if (entry.proxy && entry.proxy.trim().length > 0) {
          const proxy = parseProxy(entry.proxy);
          if (proxy) {
            proxy_dict = {
              ip: proxy.host,
              port: proxy.port,
              type: proxy.protocol,
              auth: proxy.auth
            };
          }
        }

        try {
          // Call get_account_info to get SPC_F from response headers
          const result = await get_account_info(cookieValue, proxy_dict);
          
          // Extract SPC_F from result if available
          const spcF = result?.spcF || null;
          const username = result?.data?.username || null;
          
          const extractionData = {
            spcSt: cookieValue,
            spcF: spcF,
            username: username,
            status: result?.status || false,
            message: result?.message || 'Không thể trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null
          };

          results.push(extractionData);

          // Save to database
          await storage.createSpcFExtraction({
            userId: req.user.id,
            cookieId: null,
            spcSt: cookieValue,
            spcF: spcF,
            username: username,
            status: result?.status || false,
            message: result?.message || 'Không thể trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null,
            userIp: userIP
          });

          // Charge only if successful
          if (result?.status && spcF) {
            successCount++;
            const newBalance = runningBalance - costPerExtraction;
            await storage.updateUserBalance(req.user.id, newBalance);
            
            await storage.createTransaction({
              userId: req.user.id,
              type: 'spc_f_extract',
              amount: `-${costPerExtraction}`,
              description: `Trích xuất SPC_F: ${username || 'Unknown'}`,
              status: 'completed',
              balanceBefore: runningBalance.toString(),
              balanceAfter: newBalance.toString()
            });
            
            await storage.createServiceUsage({
              userId: req.user.id,
              serviceType: 'spc_f_extract',
              serviceName: 'Trích xuất SPC_F từ SPC_ST (Bulk)',
              description: `Trích xuất SPC_F: ${username || 'Unknown'}`,
              status: 'success',
              cost: costPerExtraction.toString()
            });
            
            // Update running balance for next iteration
            runningBalance = newBalance;
            
            // Save extracted SPC_F cookie to database
            try {
              await storage.createShopeeCookie({
                userId: req.user.id,
                cookieType: 'SPC_F',
                cookieValue: spcF,
                shopeeRegion: 'vn'
              });
            } catch (cookieError) {
              // Cookie might already exist, ignore
            }
          }

        } catch (error: any) {
          results.push({
            spcSt: cookieValue,
            spcF: null,
            username: null,
            status: false,
            message: error?.message || 'Lỗi khi trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null
          });

          // Save failed attempt to database
          await storage.createSpcFExtraction({
            userId: req.user.id,
            cookieId: null,
            spcSt: cookieValue,
            spcF: null,
            username: null,
            status: false,
            message: error?.message || 'Lỗi khi trích xuất SPC_F',
            proxy: proxy_dict ? `${proxy_dict.type}://${proxy_dict.ip}:${proxy_dict.port}` : null,
            userIp: userIP
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Bulk SPC_F extraction error:', error);
      res.status(500).json({ message: 'Lỗi hệ thống khi trích xuất bulk' });
    }
  });

  // ==================== END SPC_F EXTRACTION ENDPOINTS ====================

  // TikTok Phone Rental APIs
  app.post("/api/tiktok-rental/start", authenticateTokenOrApiKey, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { service, carrier } = req.body;
      const userId = req.user!.id;

      console.log('TikTok rental request:', { service, carrier, userId });

      if (service !== 'tiktoksim_v1') {
        console.log('Invalid service type:', service);
        return res.status(400).json({ error: "Invalid service type" });
      }

      const validCarriers = ['main_3', 'vnmb', 'itel', 'random'];
      if (!validCarriers.includes(carrier)) {
        console.log('Invalid carrier:', carrier);
        return res.status(400).json({ error: "Invalid carrier" });
      }

      // ============== ANTI-SPAM CHECK ==============
      const remainingBlockTime = checkRentalRateLimit(userId);
      if (remainingBlockTime > 0) {
        const blockTimeString = formatBlockTime(remainingBlockTime);
        console.log(`[ANTI-SPAM] TikTok rental - User ${userId} blocked - ${blockTimeString} remaining`);
        return res.status(429).json({ 
          error: `Bạn đã thuê số quá nhiều lần. Vui lòng chờ ${blockTimeString} nữa để tiếp tục.`,
          blockedUntil: Date.now() + remainingBlockTime,
          remainingTime: blockTimeString
        });
      }

      console.log('Getting user...');
      let user;
      try {
        user = await storage.getUserById(userId);
        console.log('getUserById result:', user ? 'found' : 'not found');
      } catch (userErr) {
        console.error('getUserById error:', userErr);
        return res.status(500).json({ error: "Database error getting user" });
      }
      
      if (!user) {
        console.log('User not found:', userId);
        return res.status(404).json({ error: "User not found" });
      }
      console.log('User found:', user.username);

      const userBalance = parseFloat(user.balance);
      
      // Get TikTok rental pricing from service_pricing table
      const tiktokPricing = await storage.getServicePricing('tiktok_rental');
      if (!tiktokPricing) {
        return res.status(500).json({ error: "Service pricing not configured" });
      }
      const serviceCost = parseFloat(tiktokPricing.price);

      console.log('TikTok pricing from database:', { 
        rawPrice: tiktokPricing.price, 
        priceType: typeof tiktokPricing.price,
        parsedCost: serviceCost,
        serviceName: tiktokPricing.serviceName 
      });
      console.log('User balance check:', { userBalance, serviceCost });

      if (userBalance < serviceCost) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      console.log('Updating user balance...');
      const newBalance = userBalance - serviceCost;
      await storage.updateUserBalance(userId, newBalance);
      
      console.log('Creating transaction...');
      // QUAN TRỌNG: Cung cấp balance manually để tránh trừ tiền 2 lần
      await storage.createTransaction({
        userId,
        type: 'tiktok_rental',
        amount: (-serviceCost).toString(),
        description: `TikTok phone rental - ${service} (${carrier})`,
        reference: `tiktok_rental_${Date.now()}`,
        status: 'completed',
        balanceBefore: userBalance.toString(),
        balanceAfter: newBalance.toString()
      });

      console.log('Getting API key config...');
      const apiKeyConfig = await storage.getSystemConfigByKey('api_keychaycodes3');
      if (!apiKeyConfig) {
        // Hoàn tiền khi không có cấu hình API - tạo transaction hoàn tiền trực tiếp
        const currentBalance = await storage.getUserBalance(userId);
        const refundBalance = currentBalance + serviceCost;
        await storage.updateUserBalance(userId, refundBalance);
        // QUAN TRỌNG: Cung cấp balance manually để tránh trừ tiền 2 lần
        await storage.createTransaction({
          userId,
          type: 'refund',
          amount: serviceCost.toString(),
          description: 'Hoàn tiền TikTok - không có cấu hình API key',
          reference: `config_refund_${Date.now()}`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: refundBalance.toString()
        });
        return res.status(500).json({ error: "Service configuration error" });
      }

      const apiKey = apiKeyConfig.configValue;
      let carrierName = carrier;
      if (carrier === 'main_3') {
        const carriers = ['Viettel', 'Vina', 'Mobi'];
        carrierName = carriers[Math.floor(Math.random() * carriers.length)];
      } else if (carrier === 'vnmb') {
        carrierName = 'VNMB';
      } else if (carrier === 'itel') {
        carrierName = 'ITelecom';
      } else if (carrier === 'random') {
        const carriers = ['Viettel', 'Vina', 'Mobi', 'VNMB', 'ITelecom'];
        carrierName = carriers[Math.floor(Math.random() * carriers.length)];
      }

      const apiUrl = `https://chaycodeso3.com/api?act=number&apik=${apiKey}&appId=1032&carrier=${carrierName}`;
      
      try {
        const response = await fetch(apiUrl);
        const data = await response.json() as any;

        if (data.ResponseCode !== 0) {
          // Hoàn tiền khi không thuê được số - tạo transaction hoàn tiền trực tiếp
          const currentBalance = await storage.getUserBalance(userId);
          const refundBalance = currentBalance + serviceCost;
          await storage.updateUserBalance(userId, refundBalance);
          // QUAN TRỌNG: Cung cấp balance manually để tránh trừ tiền 2 lần
          await storage.createTransaction({
            userId,
            type: 'refund',
            amount: serviceCost.toString(),
            description: `Hoàn tiền TikTok - API error: ${data.Msg}`,
            reference: `api_refund_${Date.now()}`,
            status: 'completed',
            balanceBefore: currentBalance.toString(),
            balanceAfter: refundBalance.toString()
          });
          // Transform "full" message to "số hết"
          let errorMessage = data.Msg || "Failed to get phone number";
          if (errorMessage.toLowerCase().includes('full')) {
            errorMessage = errorMessage.replace(/full/gi, 'số hết');
          }
          return res.status(400).json({ error: errorMessage });
        }

        const sessionId = `tiktok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const expiresAt = new Date(Date.now() + 6 * 60 * 1000);

        await storage.createTiktokRental({
          userId,
          sessionId,
          service,
          carrier,
          phoneNumber: data.Result.Number,
          status: 'waiting',
          cost: serviceCost,
          apiId: data.Result.Id.toString(),
          expiresAt,
          apiResponse: data
        });

        res.json({
          sessionId,
          phoneNumber: data.Result.Number,
          status: 'waiting',
          cost: serviceCost,
          expiresAt: expiresAt.toISOString(),
          message: 'Phone number rented successfully. Waiting for OTP...'
        });

      } catch (apiError) {
        // Hoàn tiền khi lỗi kết nối API - tạo transaction hoàn tiền trực tiếp
        const currentBalance = await storage.getUserBalance(userId);
        const refundBalance = currentBalance + serviceCost;
        await storage.updateUserBalance(userId, refundBalance);
        // QUAN TRỌNG: Cung cấp balance manually để tránh cộng tiền 2 lần
        await storage.createTransaction({
          userId,
          type: 'refund',
          amount: serviceCost.toString(),
          description: 'Hoàn tiền TikTok - API connection error',
          reference: `connection_refund_${Date.now()}`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: refundBalance.toString()
        });
        res.status(500).json({ error: "Failed to connect to phone service" });
      }

    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tiktok-rental/get-otp", authenticateTokenOrApiKey, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.body;
      const userId = req.user!.id;

      const rental = await storage.getTiktokRentalBySessionId(sessionId);
      if (!rental || rental.userId !== userId) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (rental.status === 'completed') {
        return res.json({
          status: 'completed',
          otpCode: rental.otpCode,
          message: 'OTP already received'
        });
      }

      if (new Date() > new Date(rental.expiresAt)) {
        console.log('Session expired, processing refund...');
        await storage.updateTiktokRental(sessionId, { 
          status: 'expired',
          completedTime: new Date()
        });
        
        // Hoàn tiền khi session hết hạn - sử dụng function riêng cho TikTok
        await processTiktokRentalRefund(userId, sessionId, 'Session hết thời gian chờ OTP', 'expiry_refund');

        console.log('Refund processed for expired session:', sessionId);
        return res.json({
          status: 'expired',
          message: 'Hết thời gian chờ OTP. Đã hoàn tiền vào tài khoản.',
          refunded: true
        });
      }

      const apiKeyConfig = await storage.getSystemConfigByKey('api_keychaycodes3');
      if (!apiKeyConfig) {
        return res.status(500).json({ error: "Service configuration error" });
      }

      const apiKey = apiKeyConfig.configValue;
      const apiUrl = `https://chaycodeso3.com/api?act=code&apik=${apiKey}&id=${rental.apiId}`;
      
      try {
        const response = await fetch(apiUrl);
        const data = await response.json() as any;

        if (data.ResponseCode === 0) {
          await storage.updateTiktokRental(sessionId, {
            status: 'completed',
            otpCode: data.Result.Code,
            completedTime: new Date(),
            apiResponse: { ...rental.apiResponse, otpResponse: data }
          });

          res.json({
            status: 'completed',
            otpCode: data.Result.Code,
            sms: data.Result.SMS,
            message: 'OTP received successfully'
          });
        } else if (data.ResponseCode === 1) {
          res.json({
            status: 'waiting',
            message: 'Still waiting for OTP...'
          });
        } else if (data.ResponseCode === 2) {
          // ResponseCode 2 = no OTP yet, continue waiting (don't auto-refund)
          res.json({
            status: 'waiting',
            message: 'Chưa có OTP, tiếp tục chờ...'
          });
        } else {
          res.json({
            status: 'waiting',
            message: data.Msg || 'Error checking OTP'
          });
        }
      } catch (apiError) {
        res.json({
          status: 'waiting',
          message: 'Failed to check OTP. Please try again.'
        });
      }
    } catch (error) {
      console.error('TikTok get OTP error:', error);
      res.status(500).json({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/tiktok-rental/active-sessions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      let sessions = await storage.getActiveTiktokSessions(userId);
      
      // Check for expired sessions and auto-refund
      const currentTime = new Date();
      for (const session of sessions) {
        if (session.status === 'waiting' && new Date(session.expiresAt) < currentTime) {
          console.log('Auto-refunding expired TikTok session:', session.sessionId);
          
          // Update session status
          await storage.updateTiktokRental(session.sessionId, {
            status: 'expired',
            completedTime: currentTime
          });
          
          // Hoàn tiền khi session hết hạn - sử dụng function riêng cho TikTok
          await processTiktokRentalRefund(userId, session.sessionId, 'Session hết hạn (active-sessions check)', 'auto_expiry_refund');
          
          console.log(`Refund processed for expired TikTok session: ${session.sessionId}`);
        }
      }
      
      // Re-fetch sessions after potential updates
      sessions = await storage.getActiveTiktokSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error('TikTok active sessions error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });



  app.get("/api/tiktok-rental/history", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const history = await storage.getTiktokRentalsByUserId(userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Helper function to process single tracking check
  async function processSingleTrackingCheck(
    entry: any, 
    index: number, 
    userId: number, 
    httpProxies: any[]
  ) {
    try {
      // NOTE: Proxy selection is now handled by get_order_details_with_retry
      // which automatically tries without proxy first, then with different proxies

      // Auto-add cookie to cookie manager and get cookieId
      let actualCookieId = `BULK_${Date.now()}_${index}`;
      try {
        const existingCookies = await storage.getShopeeCookiesByUser(userId);
        const existingCookie = existingCookies.find(c => c.cookieValue === entry.cookie);
        
        if (existingCookie) {
          actualCookieId = existingCookie.id;
        } else {
          const cookieType = (entry.cookie && entry.cookie.includes('SPC_ST=')) ? 'SPC_ST' : 
                           (entry.cookie && entry.cookie.includes('SPC_F=')) ? 'SPC_F' : 'Other';
          
          const newCookie = await storage.createShopeeCookie({
            userId: userId,
            cookieType: cookieType,
            cookieValue: entry.cookie,
            shopeeRegion: 'VN'
          });

          actualCookieId = newCookie.id;
        }
      } catch (addError) {
        console.error('Error auto-adding cookie:', addError);
      }

      // Call tracking API with retry logic (try without proxy first, then with different proxies if failed)
      let orderDetails = null;
      let trackingError = null;
      let usedProxy = null;
      
      try {
        const retryResult = await get_order_details_with_retry(entry.cookie, httpProxies, 3);
        
        if (retryResult.success && retryResult.orders) {
          orderDetails = retryResult.orders;
          usedProxy = retryResult.proxy;
          console.log(`✅ Successfully got ${orderDetails.length} orders${usedProxy ? ` using proxy ${usedProxy}` : ' without proxy'}`);
        } else {
          trackingError = retryResult.error || 'Không tìm thấy đơn hàng sau khi thử với nhiều proxy';
          console.error(`❌ All retry attempts failed:`, retryResult.allErrors);
        }
      } catch (error: any) {
        console.error(`❌ Tracking error caught:`, error.message);
        trackingError = error.message;
        console.error(`🔍 trackingError set to:`, trackingError);
      }
      
      console.error(`🔍 After retry: orderDetails=${orderDetails}, trackingError=${trackingError}, proxy=${usedProxy}`);
      
      if (orderDetails && orderDetails.length > 0) {
        const serializedOrders = orderDetails.map(order => ({
          order_id: order.order_id || '',
          tracking_number: order.tracking_number || '',
          description: order.description || '',
          shipping_name: order.shipping_name || '',
          shipping_phone: order.shipping_phone || '',
          shipping_address: order.shipping_address || '',
          item_id: order.item_id || null,
          model_id: order.model_id || null,
          shop_id: order.shop_id || null,
          name: order.name || '',
          image: order.image || '',
          item_price: order.item_price || 0,
          order_price: order.order_price || 0,
          final_total: order.final_total || 0,
          order_time: order.order_time || ''
        }));
        
        const result = {
          cookieId: actualCookieId,
          status: true,
          message: `Tìm thấy ${orderDetails.length} đơn hàng`,
          orderCount: orderDetails.length,
          orders: serializedOrders,
          proxy: usedProxy
        };

        // Save to database (non-blocking)
        const cookiePreview = entry.cookie;
        storage.deleteTrackingChecksByCookie(userId, actualCookieId).catch(() => {});
        
        for (const order of orderDetails) {
          const trackingData = {
            cookiePreview: cookiePreview,
            status: true,
            message: result.message,
            orderCount: 1,
            orderId: order.order_id,
            trackingNumber: order.tracking_number,
            trackingInfo: order.description,
            shippingName: order.shipping_name,
            shippingPhone: order.shipping_phone,
            shippingAddress: order.shipping_address,
            orderName: order.name,
            orderPrice: order.order_price?.toString(),
            orderTime: order.order_time,
            proxy: result.proxy
          };

          storage.createTrackingCheck({
            userId: userId,
            cookieId: actualCookieId,
            ...trackingData
          }).catch(() => {});
        }

        return result;
      } else {
        const errorResult = {
          cookieId: actualCookieId,
          status: false,
          message: trackingError || 'Không tìm thấy đơn hàng nào',
          orderCount: 0,
          orders: [],
          proxy: usedProxy
        };

        // Save to database (non-blocking)
        const cookiePreview = entry.cookie;
        const trackingData = {
          cookiePreview: cookiePreview,
          status: false,
          message: errorResult.message,
          orderCount: 0,
          proxy: errorResult.proxy
        };

        storage.updateTrackingCheckByCookie(userId, actualCookieId, trackingData)
          .then(updated => {
            if (!updated) {
              storage.createTrackingCheck({
                userId: userId,
                cookieId: actualCookieId,
                ...trackingData
              }).catch(() => {});
            }
          }).catch(() => {});

        return errorResult;
      }
    } catch (error: any) {
      return {
        cookieId: `BULK_${Date.now()}_${index}`,
        status: false,
        message: error?.message || 'Lỗi khi kiểm tra đơn hàng',
        orderCount: 0,
        orders: [],
        proxy: null
      };
    }
  }

  // Bulk tracking check endpoint - OPTIMIZED FOR PARALLEL PROCESSING
  app.post("/api/tracking-checks/bulk", authenticateTokenOrApiKey, checkApiKeyPermission('tracking_check'), async (req: AuthenticatedRequest, res: Response) => {
    console.error('=== BULK TRACKING CHECK START (PARALLEL) ===');
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('User ID:', req.user?.id);
    
    try {
      // Handle both array format and {entries: []} format
      let entries = req.body.entries || req.body;
      
      console.error('Extracted entries:', entries);
      console.error('Entries type:', typeof entries);
      console.error('Is array:', Array.isArray(entries));
      console.error('Length:', entries?.length);
      
      if (!entries) {
        console.error('ERROR: No entries found in request body');
        return res.status(400).json({ message: "Không tìm thấy danh sách entries trong request" });
      }
      
      if (!Array.isArray(entries)) {
        console.error('ERROR: Entries is not an array, type:', typeof entries);
        return res.status(400).json({ message: "Entries phải là một mảng" });
      }
      
      // Lookup cookieIds to get full cookie values
      const userCookies = await storage.getShopeeCookiesByUser(req.user.id);
      const cookieMap = new Map(userCookies.map(c => [c.id, c.cookieValue]));
      
      // Transform string entries to object format if needed
      entries = entries.map((entry: any, index: number) => {
        if (typeof entry === 'string') {
          // Check if it's a cookieId (exists in user's cookies) or a raw cookie string
          const cookieValue = cookieMap.get(entry) || entry;
          return { 
            cookie: cookieValue,
            proxy: null 
          };
        }
        // If entry has cookieId field, lookup the value
        if (entry.cookieId) {
          const cookieValue = cookieMap.get(entry.cookieId) || entry.cookie || entry.cookieId;
          return {
            cookie: cookieValue,
            proxy: entry.proxy || null
          };
        }
        return entry;
      });
      
      if (entries.length === 0) {
        console.error('ERROR: Entries array is empty');
        return res.status(400).json({ message: "Cần ít nhất một cookie để kiểm tra" });
      }
      
      console.error('Validation passed, proceeding with', entries.length, 'entries');

      // Get HTTP proxies from database for fallback
      const httpProxies = await storage.getActiveHttpProxies();
      
      // Charge upfront - 100 VND per cookie
      const totalCost = entries.length * 100;
      const currentBalance = await storage.getUserBalance(req.user.id);
      
      if (currentBalance < totalCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND, hiện có ${currentBalance.toLocaleString('vi-VN')} VND` 
        });
      }

      // Deduct balance upfront
      await storage.updateUserBalance(req.user.id, currentBalance - totalCost);
      
      // Create charge transaction
      await storage.createTransaction({
        userId: req.user.id,
        type: 'tracking_check',
        amount: (-totalCost).toString(),
        description: `Kiểm tra đơn hàng bulk (${entries.length} cookie)`,
        status: 'completed'
      });

      // PARALLEL PROCESSING - Process in batches of 10
      const BATCH_SIZE = 10;
      const results = [];
      
      console.log(`[PARALLEL] Processing ${entries.length} cookies in batches of ${BATCH_SIZE}`);
      
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        console.log(`[PARALLEL] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entries.length / BATCH_SIZE)} (${batch.length} cookies)`);
        
        const batchPromises = batch.map((entry, batchIndex) => 
          processSingleTrackingCheck(entry, i + batchIndex, req.user.id, httpProxies)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              cookieId: `BULK_ERROR_${Date.now()}`,
              status: false,
              message: 'Lỗi xử lý batch',
              orderCount: 0,
              orders: [],
              proxy: null
            });
          }
        }
      }

      console.log(`[PARALLEL] Completed processing ${results.length} cookies`);
      
      // Calculate refunds for failed checks
      const failedCount = results.filter(r => !r.status).length;
      if (failedCount > 0) {
        const refundAmount = failedCount * 100;
        const newBalanceAfterRefund = await storage.getUserBalance(req.user.id) + refundAmount;
        await storage.updateUserBalance(req.user.id, newBalanceAfterRefund);
        await storage.createTransaction({
          userId: req.user.id,
          type: 'tracking_check_refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền ${failedCount} cookie kiểm tra thất bại`,
          status: 'completed'
        });
        console.log(`💰 Refunded ${refundAmount} VND for ${failedCount} failed checks`);
      }

      res.json(results);
    } catch (error: any) {
      console.error('Bulk tracking check error:', error);
      res.status(500).json({ 
        message: 'Lỗi hệ thống khi kiểm tra tracking',
        error: error.message 
      });
    }
  });

  // Tracking check history endpoint
  app.get("/api/tracking-checks", authenticateToken, async (req: any, res) => {
    try {
      const trackingChecks = await storage.getTrackingChecksByUser(req.user.id);
      if (trackingChecks.length > 0) {
        const recentRecords = trackingChecks.slice(-5);
        console.log('Recent tracking checks:', recentRecords.map(r => ({
          id: r.id,
          cookieId: r.cookieId,
          orderId: r.orderId,
          orderCount: r.orderCount,
          createdAt: r.createdAt
        })));
      }
      res.json(trackingChecks);
    } catch (error) {
      console.error('Tracking checks fetch error:', error);
      res.status(500).json({ message: 'Không thể tải lịch sử kiểm tra' });
    }
  });

  // Audit logs route (Superadmin only)
  app.get("/api/audit-logs", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const action = req.query.action as string;
      
      const auditLogs = await storage.getAuditLogsWithPagination(page, limit, search, action);
      res.json(auditLogs);
    } catch (error) {
      res.status(500).json({ message: 'Không thể tải audit logs' });
    }
  });

  // Cookie Extraction Routes
  app.get('/api/cookie-extractions', authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      const extractions = user.role === 'superadmin' ? 
        await storage.getAllCookieExtractions() : 
        await storage.getCookieExtractionsByUser(user.id);
      res.json(extractions);
    } catch (error) {
      console.error('Error fetching cookie extractions:', error);
      res.status(500).json({ message: 'Không thể tải lịch sử lấy cookie' });
    }
  });

  // SPC_F Cookie Extraction endpoint
  app.post('/api/cookie-extractions/spcf', authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const userIP = getUserIP(req);
      const user = req.user;
      const { entries } = req.body;

      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({ message: 'Thiếu thông tin entries' });
      }

      // Limit to 50 entries per request
      if (entries.length > 50) {
        return res.status(400).json({ 
          message: `Vượt quá giới hạn 50 cookie mỗi lần (bạn gửi ${entries.length} cookie)` 
        });
      }

      // Calculate total cost upfront
      const totalCost = entries.length * 100;
      
      // Check user balance
      const currentBalance = await storage.getUserBalance(user.id);
      if (!currentBalance || currentBalance < totalCost) {
        return res.status(400).json({ 
          message: `Số dư không đủ để thực hiện dịch vụ (cần ${totalCost} VND, hiện có ${currentBalance} VND)` 
        });
      }

      // Charge upfront
      await storage.updateUserBalance(user.id, currentBalance - totalCost);
      
      // Log upfront transaction
      await storage.createTransaction({
        userId: user.id,
        type: 'cookie_extraction',
        amount: (-totalCost).toString(),
        description: `Lấy cookie SPC_F (${entries.length} mục)`,
        reference: `SPC_F extraction - ${entries.length} entries`,
        balanceBefore: currentBalance.toString(),
        balanceAfter: (currentBalance - totalCost).toString()
      });

      // Process the cookie extraction requests with parallel processing
      const results = [];
      let successCount = 0;
      let failedCount = 0;
      
      console.log(`[SPC_F BATCH] Processing ${entries.length} cookies with parallel batches`);
      
      // Process in batches of 5 to avoid overwhelming the server
      const BATCH_SIZE = 5;
      const batches = [];
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        batches.push(entries.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[SPC_F BATCH] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} cookies)`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (entry: string) => {
          const parts = entry.split('|').map((s: string) => s.trim());
          const inputData = parts.join('|'); // Keep original format
          const proxy = parts.length > 3 && parts[3] ? parts[3] : null; // Proxy is 4th element
          
          if (!inputData) return null;

          try {
            const extractionResult = await processSpcFExtraction(inputData, proxy);
            
            if (extractionResult.status === 'success') {
              // Auto-save cookies to cookie manager if successful
              if (extractionResult.spcSt) {
                try {
                  await storage.createShopeeCookie({
                    cookieType: 'SPC_ST',
                    cookieValue: extractionResult.spcSt,
                    userId: user.id
                  });
                } catch (error) {
                  console.log('SPC_ST cookie may already exist');
                }
              }
              
              if (extractionResult.spcF) {
                try {
                  await storage.createShopeeCookie({
                    cookieType: 'SPC_F', 
                    cookieValue: extractionResult.spcF,
                    userId: user.id
                  });
                } catch (error) {
                  console.log('SPC_F cookie may already exist');
                }
              }
            }

            // Save to database
            await storage.createCookieExtraction({
              method: 'spc_f',
              input: inputData,
              spcSt: extractionResult.spcSt,
              spcF: extractionResult.spcF,
              status: extractionResult.status,
              message: extractionResult.message,
              cost: 100,
              userId: user.id,
              userIp: userIP
            });

            return {
              input: inputData,
              spcSt: extractionResult.spcSt,
              spcF: extractionResult.spcF,
              status: extractionResult.status,
              message: extractionResult.message,
              cost: 100
            };

          } catch (error: any) {
            // Save failed attempt to database
            await storage.createCookieExtraction({
              method: 'spc_f',
              input: inputData,
              status: 'failed',
              message: error.message || 'Lỗi không xác định',
              cost: 100,
              userId: user.id,
              userIp: userIP
            });

            return {
              input: inputData,
              status: 'failed' as const,
              message: error.message || 'Lỗi không xác định',
              cost: 100
            };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Count successes and failures
        for (const result of batchResults) {
          if (result) {
            results.push(result);
            if (result.status === 'success') {
              successCount++;
            } else {
              failedCount++;
            }
          }
        }
      }
      
      console.log(`[SPC_F BATCH] Completed - Success: ${successCount}, Failed: ${failedCount}`);

      // Refund for failed extractions
      if (failedCount > 0) {
        const refundAmount = failedCount * 100;
        const newBalance = await storage.getUserBalance(user.id);
        await storage.updateUserBalance(user.id, newBalance + refundAmount);
        
        // Log refund transaction
        await storage.createTransaction({
          userId: user.id,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền lấy cookie SPC_F (${failedCount} mục thất bại)`,
          reference: `SPC_F extraction refund - ${failedCount} failed`,
          balanceBefore: newBalance.toString(),
          balanceAfter: (newBalance + refundAmount).toString()
        });
      }

      res.json({
        success: true,
        results,
        totalCost: successCount * 100, // Only charge for successful extractions
        successCount,
        failedCount
      });

    } catch (error: any) {
      console.error('SPC_F extraction error:', error);
      res.status(500).json({ message: error.message || 'Lỗi hệ thống' });
    }
  });

  app.post('/api/cookie-extractions', authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const userIP = getUserIP(req);
      const user = req.user;
      const { method, input } = req.body;

      if (!method || !input) {
        return res.status(400).json({ message: 'Thiếu thông tin cần thiết' });
      }

      // Check user balance
      const currentBalance = await storage.getUserBalance(user.id);
      if (!currentBalance || currentBalance < 100) {
        return res.status(400).json({ message: 'Số dư không đủ để thực hiện dịch vụ (cần tối thiểu 100 VND)' });
      }

      // Process the cookie extraction request
      const results = [];
      const lines = input.split('\n').filter((line: string) => line.trim());
      let totalCost = 0;
      
      for (const line of lines) {
        const parts = line.split('|').map((s: string) => s.trim());
        const inputData = parts[0];
        const proxy = parts[1] || null;
        
        if (!inputData) continue;

        try {
          let extractionResult;
          
          if (method === 'spc_f') {
            // Process SPC_F extraction - this would contain actual Shopee API calls
            extractionResult = await processSpcFExtraction(inputData, proxy);
          } else {
            throw new Error('Phương thức không được hỗ trợ');
          }

          const cost = extractionResult.status === 'success' ? 100 : 0;
          totalCost += cost;

          // Save to database
          await storage.createCookieExtraction({
            method,
            input: inputData,
            spcSt: extractionResult.spcSt,
            spcF: extractionResult.spcF,
            status: extractionResult.status,
            message: extractionResult.message,
            cost,
            userId: user.id,
            userIp: userIP
          });

          // Auto-save successful cookies to cookie manager if not already present
          if (extractionResult.status === 'success') {
            if (extractionResult.spcSt) {
              try {
                await storage.createShopeeCookie({
                  cookieType: 'SPC_ST',
                  cookieValue: extractionResult.spcSt,
                  userId: user.id
                });
              } catch (error) {
                // Cookie might already exist, ignore error
                console.log('SPC_ST cookie may already exist in database');
              }
            }
            
            if (extractionResult.spcF) {
              try {
                await storage.createShopeeCookie({
                  cookieType: 'SPC_F',
                  cookieValue: extractionResult.spcF,
                  userId: user.id
                });
              } catch (error) {
                // Cookie might already exist, ignore error
                console.log('SPC_F cookie may already exist in database');
              }
            }
          }

          results.push({
            input: inputData,
            method,
            status: extractionResult.status,
            spcSt: extractionResult.spcSt,
            spcF: extractionResult.spcF,
            message: extractionResult.message,
            cost
          });

        } catch (error: any) {
          const failedResult = {
            input: inputData,
            method,
            status: 'failed' as const,
            message: error.message || 'Lỗi khi lấy cookie',
            cost: 0
          };

          await storage.createCookieExtraction({
            method,
            input: inputData,
            status: failedResult.status,
            message: failedResult.message,
            cost: failedResult.cost,
            userId: user.id,
            userIp: userIP
          });

          results.push(failedResult);
        }
      }

      // Deduct balance for successful extractions
      if (totalCost > 0) {
        const newBalance = currentBalance - totalCost;
        await storage.updateUserBalance(user.id, newBalance);
        
        // Log transaction
        await storage.createTransaction({
          userId: user.id,
          type: 'cookie_extraction',
          amount: (-totalCost).toString(),
          description: `Trích xuất cookie - ${method}`,
          reference: `${results.filter(r => r.status === 'success').length} thành công`
        });
      }

      res.json({
        success: true,
        results,
        totalCost
      });
    } catch (error) {
      console.error('Error processing cookie extraction:', error);
      res.status(500).json({ message: 'Lỗi khi xử lý yêu cầu lấy cookie' });
    }
  });

  // QR Code generation and polling endpoints
  const qrCodeSessions = new Map<string, { 
    status: string; 
    spcSt?: string; 
    spcF?: string; 
    createdAt: Date;
    token?: string;
    spc_sec_si?: string;
    spc_r_t_id?: string;
  }>();

  app.post('/api/cookie-extractions/qr/generate', authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      // Generate simple QR code ID for session management
      const qrCodeId = Math.random().toString(36).substring(2, 15);
      const token = generateRandomToken();
      
      try {
        // Try to generate real Shopee QR code
        const headers = {
          "Host": "shopee.vn",
          "Sec-Ch-Ua-Platform": "\"Windows\"",
          "Accept-Language": "en-US,en;q=0.9",
          "If-None-Match-": "55b03-2bb151cad3a65e4708e4f969b5c6e3b6",
          "Sec-Ch-Ua": "\"Chromium\";v=\"135\", \"Not-A.Brand\";v=\"8\"",
          "Sec-Ch-Ua-Mobile": "?0",
          "X-Api-Source": "pc",
          "X-Sz-Sdk-Version": "1.12.19",
          "X-Requested-With": "XMLHttpRequest",
          "X-Shopee-Language": "vi",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
          "Referer": "https://shopee.vn/buyer/login/qr?next=https%3A%2F%2Fshopee.vn%2F",
          "Accept-Encoding": "gzip, deflate, br",
          "Priority": "u=1, i",
          "Af-Ac-Enc-Dat": "2a3f05b83a1577df",
          "X-Sap-Ri": "eb34066894e04d8a77fcf23806012bba96e154f7532a22282ddd",
          "Af-Ac-Enc-Sz-Token": token
        };

        const response = await fetch("https://shopee.vn/api/v2/authentication/gen_qrcode", {
          method: 'GET',
          headers,
          timeout: 15000
        } as any);

        if (response.ok) {
          const data = await response.json() as any;
          const qrcode_id = data.data?.qrcode_id;
          const qrcode_base64 = data.data?.qrcode_base64;

          if (qrcode_id && qrcode_base64) {
            // Extract cookies from response headers (theo code Python của bạn)
            let spc_sec_si = null;
            let spc_r_t_id = null;
            
            // Parse all Set-Cookie headers
            const rawHeaders = response.headers.raw();
            const setCookieHeaders = rawHeaders['set-cookie'] || [];
            
            for (const cookieHeader of setCookieHeaders) {
              if (cookieHeader.includes('SPC_SEC_SI=')) {
                spc_sec_si = cookieHeader.split('SPC_SEC_SI=')[1].split(';')[0];
              }
              if (cookieHeader.includes('SPC_R_T_ID=')) {
                spc_r_t_id = cookieHeader.split('SPC_R_T_ID=')[1].split(';')[0];
              }
            }

            console.log(`Extracted cookies - SPC_SEC_SI: ${spc_sec_si}, SPC_R_T_ID: ${spc_r_t_id}`);

            // Store QR session with real Shopee data
            qrCodeSessions.set(qrcode_id, {
              status: 'waiting',
              createdAt: new Date(),
              token,
              spc_sec_si: spc_sec_si || undefined,
              spc_r_t_id: spc_r_t_id || undefined
            });

            console.log(`Real Shopee QR Session created for ID: ${qrcode_id}`);

            // Auto-expire after 5 minutes
            setTimeout(() => {
              const session = qrCodeSessions.get(qrcode_id);
              if (session && session.status === 'waiting') {
                qrCodeSessions.set(qrcode_id, { ...session, status: 'expired' });
              }
            }, 300000);

            return res.json({
              qrCodeId: qrcode_id,
              qrCodeImage: `data:image/png;base64,${qrcode_base64}`,
              expiresAt: new Date(Date.now() + 300000).toISOString()
            });
          }
        }
      } catch (shopeeError) {
        console.log('Shopee API failed, using fallback QR generation:', shopeeError);
      }

      // Fallback: Generate demo QR code with session management
      const qrCodeUrl = `https://shopee.vn/buyer/login/qr?demo_id=${qrCodeId}&timestamp=${Date.now()}`;
      
      // Generate QR code image using QRCode library
      const qrCodeImage = await QRCode.toDataURL(qrCodeUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Store fallback QR session
      qrCodeSessions.set(qrCodeId, {
        status: 'waiting',
        createdAt: new Date(),
        token
      });

      console.log(`Fallback QR Session created for ID: ${qrCodeId}, Total sessions: ${qrCodeSessions.size}`);

      // Auto-expire after 5 minutes
      setTimeout(() => {
        const session = qrCodeSessions.get(qrCodeId);
        if (session && session.status === 'waiting') {
          qrCodeSessions.set(qrCodeId, { ...session, status: 'expired' });
        }
      }, 300000);

      res.json({
        qrCodeId,
        qrCodeImage,
        expiresAt: new Date(Date.now() + 300000).toISOString()
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).json({ message: 'Không thể tạo mã QR' });
    }
  });

  app.get('/api/cookie-extractions/qr/status', authenticateToken, async (req: any, res) => {
    try {
      const userIP = getUserIP(req);
      let { qrCodeId } = req.query;
      
      if (!qrCodeId) {
        return res.status(400).json({ message: 'QR Code ID không được cung cấp' });
      }

      // Fix URL encoding issues with special characters
      qrCodeId = decodeURIComponent(qrCodeId as string);
      
      console.log(`Checking QR status for decoded ID: ${qrCodeId}, Total sessions: ${qrCodeSessions.size}`);

      const session = qrCodeSessions.get(qrCodeId as string);
      
      if (!session) {
        console.log(`Session not found for QR ID: ${qrCodeId}`);
        console.log(`Available session IDs: ${Array.from(qrCodeSessions.keys())}`);
        return res.status(404).json({ message: 'QR Code không tồn tại' });
      }

      // Check if expired
      if (Date.now() - session.createdAt.getTime() > 300000) {
        qrCodeSessions.set(qrCodeId as string, { ...session, status: 'expired' });
        return res.json({ status: 'expired' });
      }

      // Check with Shopee API if QR was scanned (for real Shopee QR codes)
      if (session.status === 'waiting' && session.token && session.spc_sec_si && session.spc_r_t_id) {
        try {
          const encodedQrCodeId = encodeURIComponent(qrCodeId as string);
          const statusUrl = `https://shopee.vn/api/v2/authentication/qrcode_status?qrcode_id=${encodedQrCodeId}`;
          
          const headers = {
            "Host": "shopee.vn",
            "Sec-Ch-Ua-Platform": "\"Windows\"",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Ch-Ua": "\"Chromium\";v=\"135\", \"Not-A.Brand\";v=\"8\"",
            "Sec-Ch-Ua-Mobile": "?0",
            "X-Api-Source": "pc",
            "X-Sz-Sdk-Version": "1.12.19",
            "X-Requested-With": "XMLHttpRequest",
            "X-Shopee-Language": "vi",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Referer": "https://shopee.vn/buyer/login/qr?next=https%3A%2F%2Fshopee.vn%2F",
            "Accept-Encoding": "gzip, deflate, br",
            "Priority": "u=1, i",
            "Af-Ac-Enc-Dat": "a83ec3c1361dcf54",
            "X-Sap-Ri": "ee3406689fe1d95145658c340601fe6721967aa589af08a9bc4a",
            "Af-Ac-Enc-Sz-Token": session.token,
            "Cookie": `SPC_SEC_SI=${session.spc_sec_si}; SPC_R_T_ID=${session.spc_r_t_id};`
          };

          const statusResponse = await fetch(statusUrl, { 
            headers, 
            timeout: 10000 
          } as any);
          
          if (statusResponse.ok) {
            const statusData = await statusResponse.json() as any;
            const status = statusData.data?.status;
            const qrcode_token = statusData.data?.qrcode_token;

            console.log('📥 QR Code Status Response:', JSON.stringify(statusData, null, 2));

            if (qrcode_token) {
              // QR code was scanned, proceed with login
              const loginUrl = "https://shopee.vn/api/v2/authentication/qrcode_login";
              const payload = {
                qrcode_token,
                device_sz_fingerprint: session.token,
                client_identifier: {
                  security_device_fingerprint: session.token
                }
              };

              const loginHeaders = {
                ...headers,
                "Content-Type": "application/json",
                "Af-Ac-Enc-Dat": "13757df2fbe7498d",
                "X-Csrftoken": "LycL8f61DGW0xlgm83EgKurER6bqIiuC",
                "X-Sap-Ri": "2635066857a28fb9c6b8953806012c4c7098452eb45ab1886c31"
              };

              const loginResponse = await fetch(loginUrl, {
                method: 'POST',
                headers: loginHeaders,
                body: JSON.stringify(payload),
                timeout: 10000
              } as any);

              if (loginResponse.ok) {
                // Extract cookies exactly like Python code using response.headers.get_list("set-cookie")
                let spc_st = null;
                let spc_f = null;
                
                // Get all Set-Cookie headers exactly like Python
                const set_cookie_headers: string[] = [];
                loginResponse.headers.forEach((value, key) => {
                  if (key.toLowerCase() === 'set-cookie') {
                    set_cookie_headers.push(value);
                  }
                });
                
                for (const cookie_str of set_cookie_headers) {
                  
                  // Use regex to extract cookie values like Python SimpleCookie
                  if (cookie_str.includes('SPC_ST=')) {
                    const match = cookie_str.match(/SPC_ST=([^;]+)/);
                    if (match) {
                      spc_st = match[1];
                    }
                  }
                  if (cookie_str.includes('SPC_F=')) {
                    const match = cookie_str.match(/SPC_F=([^;]+)/);
                    if (match) {
                      spc_f = match[1];
                    }
                  }
                }
                

                if (spc_st || spc_f) {
                  // Check user balance before processing
                  const currentBalance = await storage.getUserBalance(req.user.id);
                  if (currentBalance === null || currentBalance === undefined) {
                    return res.status(400).json({ 
                      status: 'failed',
                      message: 'Không thể lấy thông tin số dư tài khoản' 
                    });
                  }
                  
                  if (currentBalance < 100) {
                    return res.status(400).json({ 
                      status: 'failed',
                      message: 'Số dư không đủ để thực hiện dịch vụ (cần 100 VND)' 
                    });
                  }
                  

                  // Charge upfront
                  await storage.updateUserBalance(req.user.id, currentBalance - 100);
                  
                  // Log upfront transaction
                  await storage.createTransaction({
                    userId: req.user.id,
                    type: 'cookie_extraction',
                    amount: '-100',
                    description: 'Lấy cookie qua QR code',
                    reference: 'QR code extraction',
                    balanceBefore: currentBalance.toString(),
                    balanceAfter: (currentBalance - 100).toString()
                  });

                  const spcStCookie = spc_st ? spc_st : undefined;
                  const spcFCookie = spc_f ? spc_f : undefined;

                  // Update session with successful result
                  const updatedSession = {
                    ...session,
                    status: 'success',
                    spcSt: spcStCookie,
                    spcF: spcFCookie
                  };
                  qrCodeSessions.set(qrCodeId as string, updatedSession);

                  // Save to database
                  await storage.createCookieExtraction({
                    method: 'qr_code',
                    input: qrCodeId as string,
                    spcSt: spcStCookie,
                    spcF: spcFCookie,
                    status: 'success',
                    message: 'Lấy cookie thành công qua QR code',
                    cost: 100,
                    userId: req.user.id,
                    userIp: userIP
                  });

                  // Auto-save cookies to cookie manager with proper format
                  if (spcStCookie) {
                    try {
                      await storage.createShopeeCookie({
                        cookieType: 'SPC_ST',
                        cookieValue: `SPC_ST=${spcStCookie}`,
                        userId: req.user.id
                      });
                    } catch (error) {
                      console.log('SPC_ST cookie may already exist');
                    }
                  }

                  if (spcFCookie) {
                    try {
                      await storage.createShopeeCookie({
                        cookieType: 'SPC_F',
                        cookieValue: `SPC_F=${spcFCookie}`,
                        userId: req.user.id
                      });
                    } catch (error) {
                      console.log('SPC_F cookie may already exist');
                    }
                  }

                  console.log(`QR scan success for ID: ${qrCodeId}`);
                  return res.json({
                    status: 'success',
                    spcSt: spcStCookie,
                    spcF: spcFCookie
                  });
                } else {
                  // No cookies extracted - refund user
                  const user = await storage.getUserById(req.user.id);
                  const refundBalance = parseFloat(user!.balance) + 100;
                  await storage.updateUserBalance(req.user.id, refundBalance);
                  
                  // Log refund transaction
                  await storage.createTransaction({
                    userId: req.user.id,
                    type: 'refund',
                    amount: "100",
                    description: 'Hoàn tiền - Không lấy được cookie từ QR code',
                    reference: 'QR code extraction failed',
                    balanceBefore: user!.balance.toString(),
                    balanceAfter: refundBalance.toString()
                  });

                  // Save failed extraction to database
                  await storage.createCookieExtraction({
                    method: 'qr_code',
                    input: qrCodeId as string,
                    spcSt: undefined,
                    spcF: undefined,
                    status: 'failed',
                    message: 'Không lấy được cookie từ QR code',
                    cost: 0,
                    userId: req.user.id,
                    userIp: userIP
                  });

                  qrCodeSessions.set(qrCodeId as string, { ...session, status: 'failed' });
                  return res.json({ status: 'failed', message: 'Không lấy được cookie từ QR code' });
                }
              }
            } else if (status === 'EXPIRED') {
              qrCodeSessions.set(qrCodeId as string, { ...session, status: 'expired' });
              return res.json({ status: 'expired' });
            }
          }
        } catch (error) {
          console.error('Error checking QR status with Shopee:', error);
        }
      }

      res.json({ status: session.status });
    } catch (error) {
      console.error('Error checking QR code status:', error);
      res.status(500).json({ message: 'Lỗi khi kiểm tra trạng thái QR code' });
    }
  });

  // Manual QR completion endpoint for testing (remove in production)
  app.post('/api/cookie-extractions/qr/complete', authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const { qrCodeId } = req.body;
      const userIP = getUserIP(req);
      
      if (!qrCodeId) {
        return res.status(400).json({ message: 'QR Code ID không được cung cấp' });
      }

      const session = qrCodeSessions.get(qrCodeId);
      
      if (!session) {
        return res.status(404).json({ message: 'QR Code không tồn tại' });
      }

      if (session.status !== 'waiting') {
        return res.status(400).json({ message: 'QR Code không ở trạng thái chờ' });
      }

      // Check user balance before processing
      const currentBalance = await storage.getUserBalance(req.user.id);
      if (!currentBalance || currentBalance < 100) {
        return res.status(400).json({ message: 'Số dư không đủ để thực hiện dịch vụ (cần tối thiểu 100 VND)' });
      }

      // Simulate successful scan with realistic cookie values (without prefixes)
      const spcStValue = `A${Math.random().toString(36).substring(2, 15).toUpperCase()}${Date.now().toString().substring(-6)}`;
      const spcFValue = `${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;

      const updatedSession = {
        ...session,
        status: 'success',
        spcSt: spcStValue,
        spcF: spcFValue
      };

      qrCodeSessions.set(qrCodeId, updatedSession);

      // Deduct balance and log transaction
      const updatedBalance = currentBalance - 100;
      await storage.updateUserBalance(req.user.id, updatedBalance);

      await storage.createTransaction({
        userId: req.user.id,
        type: 'cookie_extraction',
        amount: '-100',
        description: 'Trích xuất cookie - QR code (manual test)',
        reference: 'Manual QR completion',
        balanceBefore: currentBalance.toString(),
        balanceAfter: updatedBalance.toString()
      });

      // Save to database
      await storage.createCookieExtraction({
        method: 'qr_code',
        input: qrCodeId,
        spcSt: spcStValue,
        spcF: spcFValue,
        status: 'success',
        message: 'Lấy cookie thành công từ QR code (manual test)',
        cost: 100,
        userId: req.user.id,
        userIp: userIP
      });

      // Auto-save cookies to cookie manager with proper format
      try {
        await storage.createShopeeCookie({
          cookieType: 'SPC_ST',
          cookieValue: `SPC_ST=${spcStValue}`,
          userId: req.user.id
        });
      } catch (error) {
        console.log('SPC_ST cookie may already exist');
      }

      try {
        await storage.createShopeeCookie({
          cookieType: 'SPC_F',
          cookieValue: `SPC_F=${spcFValue}`,
          userId: req.user.id
        });
      } catch (error) {
        console.log('SPC_F cookie may already exist');
      }

      // Deduct balance
      const newBalance = currentBalance - 100;
      await storage.updateUserBalance(req.user.id, newBalance);

      // Log transaction
      await storage.createTransaction({
        userId: req.user.id,
        type: 'cookie_extraction',
        amount: "-100",
        description: 'Trích xuất cookie - QR code',
        reference: 'Manual test completion'
      });

      console.log(`Manual QR completion successful for ID: ${qrCodeId}`);
      res.json({ message: 'QR Code đã được hoàn thành thành công - cookie đã được lưu và tiền đã được trừ' });
    } catch (error) {
      console.error('Error completing QR code:', error);
      res.status(500).json({ message: 'Lỗi khi hoàn thành QR code' });
    }
  });

  // Phone Rental API endpoints
  // In-memory sessions storage for active rental sessions
  const rentalSessions = new Map();





  // Start phone rental session
  app.post("/api/phone-rental/start", authenticateTokenOrApiKey, async (req: any, res) => {
    let service, carrier, serviceCost;
    // Generate session ID TRƯỚC TẤT CẢ để tránh vấn đề scope
    let sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // CRITICAL FIX: Hoist expiresAt to shared scope để tránh ReferenceError
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 6);
    
    try {
      ({ service, carrier } = req.body);
      

      if (!service || !carrier) {
        return res.status(400).json({ message: 'Service và carrier là bắt buộc' });
      }

      if (!['otissim_v1', 'otissim_v2', 'otissim_v3'].includes(service)) {
        return res.status(400).json({ message: 'Service không hợp lệ' });
      }

      // ============== SHOPEE V2 GLOBAL QUEUE LIMITING ==============
      if (service === 'otissim_v2') {
        const queueCheck = checkShopeeV2GlobalLimit(req.user.id);
        if (!queueCheck.allowed) {
          console.log(`[SHOPEE V2 GLOBAL QUEUE] User ${req.user.id} blocked - ${queueCheck.reason}`);
          return res.status(429).json({ 
            message: queueCheck.reason,
            blockedUntil: queueCheck.waitTime > 0 ? Date.now() + queueCheck.waitTime : null,
            remainingTime: queueCheck.waitTime > 0 ? Math.ceil(queueCheck.waitTime / 1000) : 0
          });
        }
      }

      // ============== SERVICE-SPECIFIC ANTI-SPAM CHECK ==============
      const rateLimitCheck = checkServiceRentalRateLimit(req.user.id, service);
      if (rateLimitCheck.blocked) {
        const blockTimeString = formatBlockTime(rateLimitCheck.remainingTime);
        console.log(`[ANTI-SPAM] User ${req.user.id} blocked for service ${service} - ${blockTimeString} remaining`);
        return res.status(429).json({ 
          message: rateLimitCheck.message,
          blockedUntil: Date.now() + rateLimitCheck.remainingTime,
          remainingTime: blockTimeString
        });
      }

      // Check user balance - Get pricing from database with fallbacks
      const servicePricing = await storage.getServicePricing(service);
      if (servicePricing) {
        serviceCost = parseFloat(servicePricing.price);
      } else {
        // Fallback prices if database config missing
        serviceCost = service === 'otissim_v3' ? 2000 : (service === 'otissim_v2' ? 2000 : 2100);
      }

      // 🔒 ATOMIC TRANSACTION: Deduct balance + Create transaction + Create rental history
      // This prevents race conditions when multiple users rent phones simultaneously
      const chargeResult = await storage.atomicPhoneRentalCharge({
        userId: req.user.id,
        sessionId,
        service,
        carrier,
        serviceCost,
        expiresAt
      });

      console.log(`[ATOMIC CHARGE] ✅ ${chargeResult.message} for user ${req.user.id}`);

    } catch (error) {
      console.error('Phone rental start error:', error);
      
      // HOÀN TIỀN KHI LỖI HỆ THỐNG - Direct refund since balance was already deducted
      try {
        const currentBalance = await storage.getUserBalance(req.user.id);
        const refundAmount = serviceCost || (service === 'otissim_v3' ? 2000 : (service === 'otissim_v2' ? 2000 : 2100));
        await storage.updateUserBalance(req.user.id, currentBalance + refundAmount);
        
        const refundBalance = currentBalance + refundAmount;
        await storage.createTransaction({
          userId: req.user.id,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền ${service} - lỗi hệ thống trước khi tạo session`,
          reference: `system_error_refund_${Date.now()}`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: refundBalance.toString()
        });
        
        console.log(`[SYSTEM ERROR REFUND] Refunded ${refundAmount} VND to user ${req.user.id} due to system error`);
      } catch (refundError) {
        console.error('Refund error:', refundError);
      }
      
      return res.status(500).json({ message: 'Lỗi hệ thống. Đã hoàn tiền vào tài khoản.' });
    }

    try {
      // ✅ SESSION ĐÃ ĐƯỢC TẠO TRƯỚC ĐÓ - Bây giờ gọi API để lấy số
      let phoneNumber = null;
      let apiResponse = null;

      try {
        if (service === 'otissim_v3') {
          // OtisSim v3 - Use ChayCodeso3 API
          const carrierMapping = {
            'main_3': ['Viettel', 'Vina', 'Mobi'],
            'vnmb': ['VNMB'],
            'itel': ['ITelecom'],
            'random': ['Viettel', 'Vina', 'Mobi', 'VNMB', 'ITelecom']
          };

          const carrierOptions = carrierMapping[carrier as keyof typeof carrierMapping];
          if (!carrierOptions) {
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            return res.status(400).json({ message: 'Carrier không hợp lệ cho OtisSim v3' });
          }

          // Get ChayCodeso3 API key from system config
          const v3Configs = await storage.getSystemConfigByType('api_key');
          const v3Keys = v3Configs.filter(config => config.configKey.startsWith('api_keychaycodes3'));
          if (v3Keys.length === 0) {
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            // Hoàn tiền khi không có cấu hình API - sử dụng function riêng cho v3
            await processOtissimV3Refund(req.user.id, sessionId, 'chưa cấu hình dịch vụ thuê sim v3', 'config_refund');
            return res.status(500).json({ message: 'Chưa cấu hình dịch vụ thuê sim v3. Đã hoàn tiền vào tài khoản.' });
          }

          const v3Key = v3Keys[Math.floor(Math.random() * v3Keys.length)];
          const apiKey = v3Key.configValue;

          // Try to get phone number - check exactly 3 different numbers
          let numbersChecked = 0;
          let totalAttempts = 0;
          const maxNumbersToCheck = 3;
          const maxTotalAttempts = 6; // Cho phép tối đa 6 lần gọi API để có 3 số check
          
          while (numbersChecked < maxNumbersToCheck && totalAttempts < maxTotalAttempts) {
            totalAttempts++;
            
            // Select random carrier from available options
            const selectedCarrier = carrierOptions[Math.floor(Math.random() * carrierOptions.length)];
            
            const response = await fetch(`https://chaycodeso3.com/api?act=number&apik=${apiKey}&appId=1002&carrier=${selectedCarrier}`, {
              method: 'GET',
              timeout: 10000
            } as any);

            if (!response.ok) {
              console.log(`Total attempt ${totalAttempts}: API connection failed - ${response.status}`);
              if (totalAttempts >= maxTotalAttempts) {
                // Update session to expire immediately (0 waiting time)
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                // Hoàn tiền sau tối đa 20 lần gọi API thất bại
                await processOtissimV3Refund(req.user.id, sessionId, `Kết nối API thất bại sau ${maxTotalAttempts} lần thử: ${response.status}`, 'api_connection_fail');
                return res.status(500).json({ message: `Không thể kết nối đến dịch vụ thuê sim v3 sau ${maxTotalAttempts} lần thử (${response.status}). Đã hoàn tiền vào tài khoản.` });
              }
              continue; // Retry API call, doesn't count as number check
            }

            const data = await response.json() as any;
            
            if (data.ResponseCode === 0 && data.Result && data.Result.Number) {
              numbersChecked++; // Count this as a number check since we got a number
              const number = data.Result.Number;
              
              console.log(`Number ${numbersChecked}/${maxNumbersToCheck} (Total API attempts: ${totalAttempts}): Got number ${number} from ChayCodeso3 API (carrier: ${selectedCarrier})`);
              
              // Check if number starts with forbidden prefixes
              if (number.startsWith('995')) {
                console.log(`Number ${numbersChecked}: Skipping number ${number} (forbidden prefix 995)`);
                // Cancel the number back to ChayCodeso3 API
                const cancelResult = await cancelChayCodeso3Number(apiKey, data.Result.Id);
                if (cancelResult) {
                  console.log(`Number ${numbersChecked}: Successfully canceled forbidden number ${number} (ID: ${data.Result.Id})`);
                } else {
                  console.warn(`Number ${numbersChecked}: Failed to cancel forbidden number ${number} (ID: ${data.Result.Id})`);
                }
                continue; // Continue to check next number
              }

              // Check if already registered with Shopee
              console.log(`Number ${numbersChecked}: Checking Shopee registration for ${number}`);
              const checkResult = await storage.checkPhoneShopeeRegistration(number);
              const isRegistered = checkResult.isRegistered;
              if (isRegistered) {
                console.log(`Number ${numbersChecked}: Number ${number} already registered with Shopee`);
                // Cancel the number back to ChayCodeso3 API
                const cancelResult = await cancelChayCodeso3Number(apiKey, data.Result.Id);
                if (cancelResult) {
                  console.log(`Number ${numbersChecked}: Successfully canceled Shopee-registered number ${number} (ID: ${data.Result.Id})`);
                } else {
                  console.warn(`Number ${numbersChecked}: Failed to cancel Shopee-registered number ${number} (ID: ${data.Result.Id})`);
                }
                continue; // Continue to check next number
              }

              // Valid number found
              console.log(`✅ Number ${numbersChecked}: Number ${number} is valid, using it`);
              phoneNumber = number;
              apiResponse = { 
                id: data.Result.Id, 
                number: data.Result.Number,
                cost: data.Result.Cost,
                balance: data.Result.Balance,
                carrier: selectedCarrier,
                apiKey
              };
              break;
            } else {
              const errorMessages = {
                1: 'Số dư không đủ',
                2: 'Ứng dụng không tồn tại',
                3: 'Kho số cho ứng dụng đang tạm hết'
              };
              const errorMsg = errorMessages[data.ResponseCode as keyof typeof errorMessages] || data.Msg || 'Lỗi không xác định';
              console.log(`Total attempt ${totalAttempts}: ChayCodeso3 API error - Code: ${data.ResponseCode}, Message: ${errorMsg}`);
              
              if (data.ResponseCode === 3) {
                // Try with different carrier if available
                continue;
              } else {
                // Nếu đã đạt giới hạn attempt, hoàn tiền
                if (totalAttempts >= maxTotalAttempts) {
                  // Update session to expire immediately (0 waiting time)
                  await storage.updatePhoneRentalHistory(sessionId, { 
                    expiresAt: new Date(),
                    status: 'failed' 
                  });
                  await processOtissimV3Refund(req.user.id, sessionId, `API thất bại sau ${maxTotalAttempts} lần thử - ${errorMsg}`, 'api_fail_refund');
                  return res.status(500).json({ message: `Dịch vụ thuê sim v3 thất bại sau ${maxTotalAttempts} lần thử: ${errorMsg}. Đã hoàn tiền vào tài khoản.` });
                }
                // Thử lại với carrier khác hoặc lần tiếp theo
                continue;
              }
            }
          }

          // Nếu đã check đủ 3 số mà vẫn không có số hợp lệ
          if (!phoneNumber && numbersChecked >= maxNumbersToCheck) {
            console.log(`[V3] Checked ${numbersChecked} numbers but no valid number found`);
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            await processOtissimV3Refund(req.user.id, sessionId, `Đã kiểm tra ${maxNumbersToCheck} số nhưng không tìm thấy số hợp lệ`, 'no_valid_number');
            return res.status(500).json({ message: `Đã kiểm tra ${maxNumbersToCheck} số điện thoại nhưng không tìm thấy số hợp lệ. Đã hoàn tiền vào tài khoản.` });
          }

          // Nếu đã đạt max total attempts mà vẫn chưa check đủ số
          if (!phoneNumber && totalAttempts >= maxTotalAttempts) {
            console.log(`[V3] Reached max total attempts (${maxTotalAttempts}) but only checked ${numbersChecked} numbers`);
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            await processOtissimV3Refund(req.user.id, sessionId, `Đã thử ${maxTotalAttempts} lần API nhưng chỉ kiểm tra được ${numbersChecked} số`, 'max_attempts_reached');
            return res.status(500).json({ message: `Không thể lấy đủ số điện thoại để kiểm tra sau ${maxTotalAttempts} lần thử. Đã hoàn tiền vào tài khoản.` });
          }

        } else if (service === 'otissim_v2') {
          // OtisSim v2 - Use FunOTP API
          const carrierMapping = {
            'main_3': 'viettel|mobifone|vinaphone',  // 3 mạng chính
            'VIETTEL': 'viettel',
            'MOBIFONE': 'mobifone', 
            'VINAPHONE': 'vinaphone',
            'VIETNAMOBILE': 'vietnamobile',
            'random': 'viettel|mobifone|vietnamobile|vinaphone'  // tất cả nhà mạng
          };

          const operatorValue = carrierMapping[carrier as keyof typeof carrierMapping];
          if (!operatorValue) {
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            return res.status(400).json({ message: 'Carrier không hợp lệ cho OtisSim v2' });
          }

          // Get API key from system config - look for sim_service_key (TOTP keys for v2)
          console.log('[OTISSIM V2 FUNOTP] Looking for sim_service_key configuration...');
          
          const apiTokenConfigs = await storage.getSystemConfigByType('sim_service_key');
          console.log(`[OTISSIM V2 FUNOTP] Found ${apiTokenConfigs.length} sim_service_key configs`);
          
          if (apiTokenConfigs.length === 0) {
            console.log('[OTISSIM V2 FUNOTP] No sim_service_key configs found - processing refund');
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            await processOtissimV2Refund(req.user.id, sessionId, 'chưa cấu hình dịch vụ thuê sim v2', 'config_refund');
            return res.status(500).json({ message: 'Chưa cấu hình dịch vụ thuê sim v2. Đã hoàn tiền vào tài khoản.' });
          }

          const tokenConfig = apiTokenConfigs[Math.floor(Math.random() * apiTokenConfigs.length)];
          const apiKey = tokenConfig.configValue;

          // Try to get phone number up to 3 times
          for (let attempt = 1; attempt <= 3; attempt++) {
            // Build FunOTP API URL for renting number
            const rentUrl = `https://funotp.com/api?action=number&service=shopee&apikey=${apiKey}&operator=${operatorValue}`;

            const response = await fetch(rentUrl, {
              method: 'GET',
              timeout: 10000
            } as any);

            if (!response.ok) {
              console.log(`Attempt ${attempt}: FunOTP API connection failed - ${response.status}`);
              if (attempt === 3) {
                // Update session to expire immediately (0 waiting time)
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                await processOtissimV2Refund(req.user.id, sessionId, `Kết nối FunOTP API thất bại sau 3 lần thử: ${response.status}`, 'api_connection_fail');
                return res.status(500).json({ message: `Không thể kết nối đến dịch vụ thuê sim v2 sau 3 lần thử (${response.status}). Đã hoàn tiền vào tài khoản.` });
              }
              continue; // Thử lại
            }

            const data = await response.json() as any;
            
            // FunOTP response: { "ResponseCode": 0, "Result": { "number": "84587982403", "id": "...", ... } }
            if (data.ResponseCode === 0 && data.Result && data.Result.number && data.Result.id) {
              const number = data.Result.number;
              const numberId = data.Result.id;
              
              console.log(`Attempt ${attempt}: Nhận được số ${number} từ FunOTP (operator: ${operatorValue}, id: ${numberId})`);
              
              // Check if number starts with forbidden prefixes
              if (number.startsWith('995')) {
                console.log(`Attempt ${attempt}: Skipping number ${number} (forbidden prefix 995)`);
                continue;
              }

              // Check if already registered with Shopee using same logic as v1 and v3
              console.log(`Attempt ${attempt}: Checking Shopee registration for ${number}`);
              const checkResult = await storage.checkPhoneShopeeRegistration(number);
              const isRegistered = checkResult.isRegistered;
              console.log(`Attempt ${attempt}: Shopee check result for ${number}: ${isRegistered ? 'REGISTERED/ERROR' : 'AVAILABLE'}`);
              if (isRegistered) {
                console.log(`Attempt ${attempt}: Skipping number ${number} (registered or API error)`);
                continue;
              }

              // Valid unregistered number found
              console.log(`Attempt ${attempt}: Number ${number} is available, using it`);
              phoneNumber = number;
              apiResponse = {
                id: numberId,
                number: data.Result.number,
                service: data.Result.service,
                price: data.Result.price,
                balance: data.Result.balance,
                start: data.Result.start,
                end: data.Result.end,
                numberno84: data.Result.numberno84,
                operator: operatorValue,
                apiKey
              };
              
              // Add to global queue for Shopee v2 
              addToShopeeV2GlobalQueue(req.user.id, number, sessionId);
              
              break;
            } else if (data.ResponseCode === 1) {
              // ResponseCode 1 = đang xử lý
              console.log(`Attempt ${attempt}: FunOTP đang xử lý request, thử lại...`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
              continue;
            } else if (data.ResponseCode === 2) {
              // ResponseCode 2 = lỗi
              const errorMessage = data.Message || 'Lỗi không xác định';
              console.log(`Attempt ${attempt}: FunOTP error - ${errorMessage}`);
              
              // Nếu là lần thử cuối cùng, hoàn tiền
              if (attempt === 3) {
                // Update session to expire immediately (0 waiting time)
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                await processOtissimV2Refund(req.user.id, sessionId, `FunOTP API thất bại sau 3 lần thử - ${errorMessage}`, 'api_fail_refund');
                return res.status(500).json({ message: `Dịch vụ thuê sim v2 thất bại sau 3 lần thử: ${errorMessage}. Đã hoàn tiền vào tài khoản.` });
              }
              // Thử lại lần tiếp theo
              continue;
            } else {
              // Unknown response
              console.log(`Attempt ${attempt}: FunOTP unknown response - ${JSON.stringify(data)}`);
              if (attempt === 3) {
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                await processOtissimV2Refund(req.user.id, sessionId, 'FunOTP API response không hợp lệ', 'api_fail_refund');
                return res.status(500).json({ message: 'Dịch vụ thuê sim v2 thất bại: Response không hợp lệ. Đã hoàn tiền vào tài khoản.' });
              }
              continue;
            }
          }

        } else if (service === 'otissim_v1') {
          // OtisSim v1 - Use 365otp.com API
          // Carrier mapping to networkId:
          // Viettel: 1, MobiFone: 2, VinaPhone: 3, Vietnamobile: 4, Itelecom: 5
          // main_3 (3 mạng chính): 1,2,3
          // random (tất cả nhà mạng): 1,2,3,4,5
          const carrierMapping = {
            'VIETTEL': '1',
            'MOBIFONE': '2',
            'VINAPHONE': '3',
            'VIETNAMOBILE': '4',
            'ITELECOM': '5',
            'main_3': '1,2,3',
            'random': '1,2,3,4,5'
          };

          const networkIds = carrierMapping[carrier as keyof typeof carrierMapping];
          if (!networkIds) {
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            return res.status(400).json({ message: 'Carrier không hợp lệ cho OtisSim v1' });
          }

          // Get API key from system config - look for sim_service_v1_key
          console.log('[OTISSIM V1 365OTP] Looking for sim_service_v1_key configuration...');
          
          const api365Keys = await storage.getSystemConfigByType('sim_service_v1_key');
          console.log(`[OTISSIM V1 365OTP] Found ${api365Keys.length} v1 API key configs`);
          
          if (api365Keys.length > 0) {
            console.log('[OTISSIM V1 365OTP] Available configs:', api365Keys.map(c => ({
              id: c.id,
              key: c.configKey,
              type: c.configType,
              active: c.isActive,
              valuePreview: c.configValue.substring(0, 8) + '...'
            })));
            
            // Filter only active configs
            const activeKeys = api365Keys.filter(c => c.isActive);
            console.log(`[OTISSIM V1 365OTP] Active configs: ${activeKeys.length}/${api365Keys.length}`);
            
            if (activeKeys.length === 0) {
              console.log('[OTISSIM V1 365OTP] No active configs - processing refund');
              await storage.updatePhoneRentalHistory(sessionId, { 
                expiresAt: new Date(),
                status: 'failed' 
              });
              await processOtissimV1Refund(req.user.id, sessionId, 'không có API key v1 active', 'config_refund');
              return res.status(500).json({ message: 'Không có API key v1 đang hoạt động. Đã hoàn tiền vào tài khoản.' });
            }
          }
          
          if (api365Keys.length === 0) {
            console.log('[OTISSIM V1 365OTP] No sim_service_v1_key configs found - processing refund');
            // Update session to expire immediately (0 waiting time)
            await storage.updatePhoneRentalHistory(sessionId, { 
              expiresAt: new Date(),
              status: 'failed' 
            });
            await processOtissimV1Refund(req.user.id, sessionId, 'chưa cấu hình dịch vụ thuê sim v1', 'config_refund');
            return res.status(500).json({ message: 'Chưa cấu hình dịch vụ thuê sim v1. Đã hoàn tiền vào tài khoản.' });
          }

          // Use only active configs
          const activeKeys = api365Keys.filter(c => c.isActive);
          const apiKeyConfig = activeKeys[Math.floor(Math.random() * activeKeys.length)];
          const apiKey = apiKeyConfig.configValue;
          console.log(`[OTISSIM V1 365OTP] Using API key: ${apiKeyConfig.configKey} (${apiKey.substring(0, 8)}...)`);

          // Try to get phone number up to 3 times
          for (let attempt = 1; attempt <= 3; attempt++) {
            // Build 365otp API URL for ordering number
            const orderUrl = `https://365otp.com/apiv1/orderv2?apikey=${apiKey}&serviceId=270&networkId=${networkIds}`;

            const response = await fetch(orderUrl, {
              method: 'GET',
              timeout: 10000
            } as any);

            if (!response.ok) {
              console.log(`Attempt ${attempt}: 365otp API connection failed - ${response.status}`);
              if (attempt === 3) {
                // Update session to expire immediately (0 waiting time)
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                await processOtissimV1Refund(req.user.id, sessionId, `Kết nối 365otp API thất bại sau 3 lần thử: ${response.status}`, 'api_connection_fail');
                return res.status(500).json({ message: `Không thể kết nối đến dịch vụ thuê sim v1 sau 3 lần thử (${response.status}). Đã hoàn tiền vào tài khoản.` });
              }
              continue; // Thử lại
            }

            const data = await response.json() as any;
            
            // 365otp response: { "status": 1, "id": 40253541, "phone": "0347413565", "message": "..." }
            if (data.status === 1 && data.phone && data.id) {
              const number = data.phone;
              const orderId = data.id;
              
              console.log(`Attempt ${attempt}: Nhận được số ${number} từ 365otp (networkId: ${networkIds}, id: ${orderId})`);
              
              // Check if number starts with forbidden prefixes
              if (number.startsWith('995')) {
                console.log(`Attempt ${attempt}: Skipping number ${number} (forbidden prefix 995)`);
                continue;
              }

              // Check if already registered with Shopee
              console.log(`Attempt ${attempt}: Checking Shopee registration for ${number}`);
              const checkResult = await storage.checkPhoneShopeeRegistration(number);
              const isRegistered = checkResult.isRegistered;
              console.log(`Attempt ${attempt}: Shopee check result for ${number}: ${isRegistered ? 'REGISTERED/ERROR' : 'AVAILABLE'}`);
              if (isRegistered) {
                console.log(`Attempt ${attempt}: Skipping number ${number} (registered or API error)`);
                continue;
              }

              // Valid unregistered number found
              console.log(`Attempt ${attempt}: Number ${number} is available, using it`);
              phoneNumber = number;
              apiResponse = {
                id: orderId,
                phone: data.phone,
                message: data.message,
                networkIds: networkIds,
                apiKey
              };
              break;
            } else if (data.status < 0) {
              // Status < 0 = lỗi
              const errorMessage = data.message || 'Lỗi không xác định';
              console.log(`Attempt ${attempt}: 365otp error - Status: ${data.status}, Message: ${errorMessage}`);
              
              // Nếu là lần thử cuối cùng, hoàn tiền
              if (attempt === 3) {
                // Update session to expire immediately (0 waiting time)
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                await processOtissimV1Refund(req.user.id, sessionId, `365otp API thất bại sau 3 lần thử - ${errorMessage}`, 'api_fail_refund');
                return res.status(500).json({ message: `Dịch vụ thuê sim v1 thất bại sau 3 lần thử: ${errorMessage}. Đã hoàn tiền vào tài khoản.` });
              }
              // Thử lại lần tiếp theo
              continue;
            } else {
              // Unknown response
              console.log(`Attempt ${attempt}: 365otp unknown response - ${JSON.stringify(data)}`);
              if (attempt === 3) {
                await storage.updatePhoneRentalHistory(sessionId, { 
                  expiresAt: new Date(),
                  status: 'failed' 
                });
                await processOtissimV1Refund(req.user.id, sessionId, '365otp API response không hợp lệ', 'api_fail_refund');
                return res.status(500).json({ message: 'Dịch vụ thuê sim v1 thất bại: Response không hợp lệ. Đã hoàn tiền vào tài khoản.' });
              }
              continue;
            }
          }
        }

        if (!phoneNumber) {
          // ❌ API THẤT BẠI - Update session status và hoàn tiền - expires immediately (0 waiting time)
          await storage.updatePhoneRentalHistory(sessionId, {
            status: 'failed',
            expiresAt: new Date(),
            apiResponseData: 'Failed to get phone number after 10 attempts'
          });

          // Hoàn tiền khi không thuê được số - sử dụng function riêng cho từng service
          if (service === 'otissim_v1') {
            await processOtissimV1Refund(req.user.id, sessionId, 'không tìm được số phù hợp sau 10 lần thử', 'phone_refund');
          } else if (service === 'otissim_v2') {
            await processOtissimV2Refund(req.user.id, sessionId, 'không tìm được số phù hợp sau 10 lần thử', 'phone_refund');
          } else if (service === 'otissim_v3') {
            await processOtissimV3Refund(req.user.id, sessionId, 'không tìm được số phù hợp sau 10 lần thử', 'phone_refund');
          } else {
            await processOtissimV1Refund(req.user.id, sessionId, 'không tìm được số phù hợp sau 10 lần thử', 'phone_refund');
          }

          console.log(`[NEW FLOW] ❌ Session ${sessionId} failed, refunded for user ${req.user.id}`);

          return res.status(400).json({ 
            message: 'Không tìm được số phù hợp sau 10 lần thử. Đã hoàn tiền vào tài khoản.' 
          });
        }

        // ✅ API THÀNH CÔNG - Update session đã tạo với phone number
        await storage.updatePhoneRentalHistory(sessionId, {
          phoneNumber: phoneNumber,
          status: 'waiting', // Giữ status waiting để auto-refund scheduler hoạt động
          apiResponseData: JSON.stringify(apiResponse)
        });

        // Create session for in-memory tracking (for compatibility)
        const session = {
          sessionId,
          service,
          carrier,
          phoneNumber,
          userId: req.user.id,
          status: 'waiting',
          apiResponse,
          startTime: new Date(),
          expiresAt
        };

        rentalSessions.set(sessionId, session);

        console.log(`[NEW FLOW] ✅ Session ${sessionId} updated with phone ${phoneNumber} for user ${req.user.id}`);

        // Log service usage
        await storage.createServiceUsage({
          userId: req.user.id,
          serviceType: service,
          serviceName: `Thuê số ${service}`,
          description: `Thuê số ${phoneNumber} - ${carrier}`,
          status: 'active',
          cost: serviceCost.toString()
        });

        res.json({
          sessionId,
          service,
          carrier,
          phoneNumber,
          cost: serviceCost,
          expiresAt: expiresAt.toISOString(),
          message: 'Đã thuê số thành công, đang chờ OTP'
        });

      } catch (error: any) {
        console.error('Phone rental error:', error);
        // Hoàn tiền ngay lập tức khi có exception chung
        try {
          // Update session to expire immediately (0 waiting time) for exceptions
          await storage.updatePhoneRentalHistory(sessionId, { 
            expiresAt: new Date(),
            status: 'failed' 
          });
          
          if (service === 'otissim_v1') {
            await processOtissimV1Refund(req.user.id, sessionId, `exception trong quá trình thuê số - ${error.message}`, 'exception_refund');
          } else if (service === 'otissim_v2') {
            await processOtissimV2Refund(req.user.id, sessionId, `exception trong quá trình thuê số - ${error.message}`, 'exception_refund');
          } else if (service === 'otissim_v3') {
            await processOtissimV3Refund(req.user.id, sessionId, `exception trong quá trình thuê số - ${error.message}`, 'exception_refund');
          } else {
            await processOtissimV1Refund(req.user.id, sessionId, `exception trong quá trình thuê số - ${error.message}`, 'exception_refund');
          }
        } catch (refundError) {
          console.error('Exception refund error:', refundError);
        }
        
        return res.status(500).json({ 
          message: 'Có lỗi xảy ra trong quá trình thuê số. Đã hoàn tiền vào tài khoản.',
          error: error.message
        });
      }



    } catch (mainError) {
      console.error('Phone rental start error:', mainError);
      
      // HOÀN TIỀN KHI LỖI HỆ THỐNG - Refund on system error
      try {
        const fallbackSessionId = 'system_error_' + Date.now();
        const fallbackServiceCost = serviceCost || 1900; // Use default if serviceCost not set
        
        if (service === 'otissim_v1') {
          await processOtissimV1Refund(req.user.id, fallbackSessionId, 'lỗi hệ thống', 'system_refund');
        } else if (service === 'otissim_v2') {
          await processOtissimV2Refund(req.user.id, fallbackSessionId, 'lỗi hệ thống', 'system_refund');
        } else if (service === 'otissim_v3') {
          await processOtissimV3Refund(req.user.id, fallbackSessionId, 'lỗi hệ thống', 'system_refund');
        } else {
          await processOtissimV1Refund(req.user.id, fallbackSessionId, 'lỗi hệ thống', 'system_refund');
        }
      } catch (refundError) {
        console.error('Refund error:', refundError);
      }
      
      return res.status(500).json({ message: 'Lỗi hệ thống. Đã hoàn tiền vào tài khoản.' });
    }
  });



  // Get OTP for rental session (support both GET and POST)
  app.get("/api/phone-rental/get-otp", authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const sessionId = req.query.sessionId;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID là bắt buộc' });
      }

      await handleGetOTP(sessionId, req, res);
    } catch (error) {
      console.error('Get OTP GET error:', error);
      res.status(500).json({ message: "Lỗi server khi lấy OTP" });
    }
  });

  app.post("/api/phone-rental/get-otp", authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID là bắt buộc' });
      }

      await handleGetOTP(sessionId, req, res);
    } catch (error) {
      console.error('Get OTP POST error:', error);
      res.status(500).json({ message: "Lỗi server khi lấy OTP" });
    }
  });

  // Proxy endpoint for v3 call files (hides original domain) - supports both GET and HEAD
  const handleCallFileRequest = async (req: any, res: any, isHeadRequest: boolean = false) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID là bắt buộc' });
      }

      // Get session to verify ownership and get call file URL
      const session = rentalSessions.get(sessionId);
      if (!session) {
        const dbSession = await storage.getPhoneRentalHistoryBySession(sessionId);
        if (!dbSession) {
          return res.status(404).json({ message: 'Session không tồn tại' });
        }
        
        if (dbSession.userId !== req.user.id) {
          return res.status(403).json({ message: 'Không có quyền truy cập session này' });
        }

        // Check if this session has completed with call file
        if (dbSession.status !== 'completed') {
          return res.status(400).json({ message: 'Session chưa hoàn thành hoặc không có file âm thanh' });
        }

        // Try to get call file URL from stored API response
        const apiResponseData = dbSession.apiResponseData ? JSON.parse(dbSession.apiResponseData) : {};
        
        // Check if we have v3 response with CallFile in the stored data
        if (apiResponseData.v3Response && apiResponseData.v3Response.Result && apiResponseData.v3Response.Result.CallFile) {
          const callFileUrl = apiResponseData.v3Response.Result.CallFile;
          
          // Fetch the audio file from the original URL and stream it
          const audioResponse = await fetch(callFileUrl, {
            method: 'GET',
            timeout: 30000 // 30 seconds timeout for audio file
          } as any);

          if (!audioResponse.ok) {
            console.error(`Failed to fetch call file from ${callFileUrl}: ${audioResponse.status}`);
            return res.status(502).json({ message: 'Không thể tải file âm thanh' });
          }

          // Set appropriate headers for audio streaming
          const contentType = audioResponse.headers.get('content-type') || 'audio/wav';
          const contentLength = audioResponse.headers.get('content-length');
          
          res.setHeader('Content-Type', contentType);
          if (contentLength) {
            res.setHeader('Content-Length', contentLength);
          }
          res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
          res.setHeader('Accept-Ranges', 'bytes'); // Enable audio seeking
          res.setHeader('Access-Control-Allow-Origin', '*'); // CORS support
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization');
          res.setHeader('Content-Disposition', 'inline'); // Allow inline playback
          
          // For HEAD requests, only send headers without body
          if (isHeadRequest) {
            return res.status(200).end();
          }
          
          // Stream the audio file for GET requests with error handling
          if (!audioResponse.body) {
            console.error('Audio response body is null');
            return res.status(502).json({ message: 'Không thể stream file âm thanh' });
          }
          
          audioResponse.body.pipe(res).on('error', (err: any) => {
            console.error('Error streaming audio:', err);
            if (!res.headersSent) {
              res.status(500).json({ message: 'Lỗi khi stream file âm thanh' });
            }
          });
          
          return;
        }
        
        return res.status(404).json({ message: 'Không tìm thấy file âm thanh cho session này' });
      }

      if (session.userId !== req.user.id) {
        return res.status(403).json({ message: 'Không có quyền truy cập session này' });
      }

      // Check if session is v3 and has call file URL
      if (session.service !== 'otissim_v3' || !session.v3Response?.Result?.CallFile) {
        return res.status(404).json({ message: 'Không tìm thấy file âm thanh cho session này' });
      }

      const callFileUrl = session.v3Response.Result.CallFile;
      
      // Fetch the audio file from the original URL and stream it
      const audioResponse = await fetch(callFileUrl, {
        method: 'GET',
        timeout: 30000 // 30 seconds timeout for audio file
      } as any);

      if (!audioResponse.ok) {
        console.error(`Failed to fetch call file from ${callFileUrl}: ${audioResponse.status}`);
        return res.status(502).json({ message: 'Không thể tải file âm thanh' });
      }

      // Set appropriate headers for audio streaming
      const contentType = audioResponse.headers.get('content-type') || 'audio/wav';
      const contentLength = audioResponse.headers.get('content-length');
      
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.setHeader('Accept-Ranges', 'bytes'); // Enable audio seeking
      res.setHeader('Access-Control-Allow-Origin', '*'); // CORS support
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      res.setHeader('Content-Disposition', 'inline'); // Allow inline playback
      
      // For HEAD requests, only send headers without body
      if (isHeadRequest) {
        return res.status(200).end();
      }
      
      // Stream the audio file for GET requests with error handling
      if (!audioResponse.body) {
        console.error('Audio response body is null');
        return res.status(502).json({ message: 'Không thể stream file âm thanh' });
      }
      
      audioResponse.body.pipe(res).on('error', (err: any) => {
        console.error('Error streaming audio:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Lỗi khi stream file âm thanh' });
        }
      });
      
      return;
      
    } catch (error) {
      console.error('Call file proxy error:', error);
      res.status(500).json({ message: "Lỗi server khi tải file âm thanh" });
    }
  };

  // GET route for downloading audio files
  app.get("/api/phone-rental/call-file/:sessionId", authenticateToken, async (req: any, res) => {
    await handleCallFileRequest(req, res, false);
  });

  // HEAD route for checking audio file availability
  app.head("/api/phone-rental/call-file/:sessionId", authenticateToken, async (req: any, res) => {
    await handleCallFileRequest(req, res, true);
  });

  // Helper function for both GET and POST
  async function handleGetOTP(sessionId: string, req: any, res: any) {

      let session = rentalSessions.get(sessionId);
      
      // If session not in memory, try to get from database
      if (!session) {
        const dbSession = await storage.getPhoneRentalHistoryBySession(sessionId);
        if (!dbSession) {
          return res.status(404).json({ message: 'Session không tồn tại' });
        }
        
        if (dbSession.userId !== req.user.id) {
          return res.status(403).json({ message: 'Không có quyền truy cập session này' });
        }
        
        // Restore session to memory if still active
        if (dbSession.status === 'waiting' && new Date() < new Date(dbSession.expiresAt)) {
          const apiResponseData = dbSession.apiResponseData ? JSON.parse(dbSession.apiResponseData) : {};
          session = {
            sessionId: dbSession.sessionId,
            service: dbSession.service,
            carrier: dbSession.carrier,
            phoneNumber: dbSession.phoneNumber,
            userId: dbSession.userId,
            status: dbSession.status,
            apiResponse: apiResponseData,
            startTime: new Date(dbSession.startTime),
            expiresAt: new Date(dbSession.expiresAt),
            otp: dbSession.otpCode || undefined
          };
          rentalSessions.set(sessionId, session);
        } else {
          // Session expired or completed
          return res.json({ 
            status: dbSession.status, 
            message: dbSession.status === 'expired' ? 'Session đã hết hạn' : 'Session đã hoàn thành',
            otp: dbSession.otpCode || undefined
          });
        }
      }

      if (session.userId !== req.user.id) {
        return res.status(403).json({ message: 'Không có quyền truy cập session này' });
      }

      // Check if session expired
      if (new Date() > new Date(session.expiresAt)) {
        session.status = 'expired';
        rentalSessions.set(sessionId, session);
        
        // Update database status
        await storage.updatePhoneRentalHistory(sessionId, {
          status: 'expired',
          completedTime: new Date()
        });
        
        // Process refund based on service type
        const userId = req.user.id;
        
        // Remove from global queue before refund
        if (session.service === 'otissim_v2' && session.phoneNumber) {
          console.log(`[SHOPEE V2 GLOBAL QUEUE] Removing number ${session.phoneNumber} for user ${userId} (expired in expiry check)`);
          removeFromShopeeV2GlobalQueue(parseInt(userId), session.phoneNumber);
        }
        if (session.service === 'otissim_v1') {
          await processOtissimV1Refund(userId, sessionId, 'Session hết thời gian chờ OTP', 'expiry_refund');
        } else if (session.service === 'otissim_v2') {
          await processOtissimV2Refund(userId, sessionId, 'Session hết thời gian chờ OTP', 'expiry_refund');
        } else if (session.service === 'otissim_v3') {
          await processOtissimV3Refund(userId, sessionId, 'Session hết thời gian chờ OTP', 'expiry_refund');
        }
        
        return res.json({ 
          status: 'expired', 
          message: 'Hết thời gian chờ OTP. Đã hoàn tiền vào tài khoản.',
          refunded: true
        });
      }

      // Check if already completed
      if (session.status === 'completed' && session.otp) {
        return res.json({ status: 'completed', otp: session.otp });
      }

      try {
        let otpResult = null;

        if (session.service === 'otissim_v3') {
          // Get OTP from ChayCodeso3 API
          const { id, apiKey } = session.apiResponse;
          
          try {
            const response = await fetch(`https://chaycodeso3.com/api?act=code&apik=${apiKey}&id=${id}`, {
              method: 'GET',
              timeout: 10000  // Reduced timeout to 10 seconds for better responsiveness
            } as any);

            if (!response.ok) {
              throw new Error(`Lỗi lấy mã OTP từ dịch vụ thuê sim v3: ${response.status}`);
            }

            const data = await response.json() as any;
            
            if (data.ResponseCode === 0 && data.Result && data.Result.Code) {
              // Found OTP - store the enhanced v3 response data
              otpResult = data.Result.Code;
              session.v3Response = data; // Store full v3 response for enhanced features
              
              // CRITICAL FIX: Store v3Response in session.apiResponse to persist to database
              session.apiResponse.v3Response = data;
              
              console.log(`Sim v3: Đã nhận được OTP cho session ${sessionId}: ${otpResult}`);
              console.log(`[V3 ENHANCED] Storing enhanced data - CallFile: ${data.Result?.CallFile ? 'YES' : 'NO'}, Content: ${data.Result?.Content ? 'YES' : 'NO'}`);
            } else if (data.ResponseCode === 1) {
              // No OTP yet
              console.log(`Sim v3: Chưa có mã OTP cho session ${sessionId}`);
            } else if (data.ResponseCode === 2) {
              // No OTP yet, but phone is still active - continue waiting
              console.log(`Sim v3: Chưa có mã OTP cho session ${sessionId}, tiếp tục chờ...`);
              // Don't auto-refund here - ResponseCode 2 means "no OTP yet", not "expired"
            } else if (data.ResponseCode === -1) {
              // API Error - số không tồn tại hoặc lỗi hệ thống - cần hoàn tiền
              console.log(`ChayCodeso3 API Error (Code: ${data.ResponseCode}): ${data.Msg} - Processing refund for session ${sessionId}`);
              
              // Update session status to expired
              session.status = 'expired';
              rentalSessions.set(sessionId, session);
              
              // Update database
              await storage.updatePhoneRentalHistory(sessionId, {
                status: 'expired',
                completedTime: new Date()
              });
              
              // Process refund for API error
              const refundResult = await processOtissimV3Refund(session.userId.toString(), sessionId, `API Error: ${data.Msg}`, 'api_error_refund');
              
              if (refundResult?.success) {
                console.log(`[OTISSIM V3 API ERROR REFUND] Refunded ${refundResult.amount} VND for session ${sessionId} due to API error`);
                return res.json({
                  status: 'expired',
                  message: `Lỗi API: ${data.Msg}. Đã hoàn tiền vào tài khoản của bạn.`,
                  refunded: true
                });
              } else {
                return res.json({
                  status: 'error',
                  message: `Lỗi API: ${data.Msg}. Vui lòng liên hệ admin để được hoàn tiền.`,
                  refunded: false
                });
              }
            } else {
              console.log(`ChayCodeso3 OTP error - Code: ${data.ResponseCode}, Message: ${data.Msg}`);
              // For other error codes, continue waiting but log the error
            }
          } catch (apiConnectionError: any) {
            // Network error, timeout, hoặc lỗi kết nối khác - trigger refund
            console.log(`ChayCodeso3 API Connection Error for session ${sessionId}: ${apiConnectionError.message}`);
            
            // Update session status to expired
            session.status = 'expired';
            rentalSessions.set(sessionId, session);
            
            // Update database
            await storage.updatePhoneRentalHistory(sessionId, {
              status: 'expired',
              completedTime: new Date()
            });
            
            // Process refund for connection error
            const refundResult = await processOtissimV3Refund(session.userId.toString(), sessionId, `Lỗi kết nối API: ${apiConnectionError.message}`, 'connection_error_refund');
            
            if (refundResult?.success) {
              console.log(`[OTISSIM V3 CONNECTION ERROR REFUND] Refunded ${refundResult.amount} VND for session ${sessionId} due to connection error`);
              return res.json({
                status: 'expired',
                message: `Lỗi kết nối với dịch vụ OTP (timeout/network). Đã hoàn tiền vào tài khoản của bạn.`,
                refunded: true
              });
            } else {
              return res.json({
                status: 'error',
                message: `Lỗi kết nối với dịch vụ OTP. Vui lòng liên hệ admin để được hoàn tiền.`,
                refunded: false
              });
            }
          }


        } else if (session.service === 'otissim_v2') {
          // Get OTP from FunOTP API
          const { id, apiKey } = session.apiResponse;
          
          try {
            // Build FunOTP API URL for getting OTP
            const otpUrl = `https://funotp.com/api?action=code&id=${id}&apikey=${apiKey}`;
            
            const response = await fetch(otpUrl, {
              method: 'GET',
              timeout: 10000
            } as any);

            if (!response.ok) {
              throw new Error(`FunOTP API connection failed: ${response.status}`);
            }

            const data = await response.json() as any;
            
            // FunOTP OTP response: { "ResponseCode": 0, "Result": { "id": "...", "SMS": "...", "otp": "965907" } }
            if (data.ResponseCode === 0 && data.Result && data.Result.otp) {
              // Found OTP
              otpResult = data.Result.otp;
              console.log(`[OTISSIM V2 FUNOTP] Found OTP: ${otpResult} for session ${sessionId}`);
            } else if (data.ResponseCode === 1) {
              // ResponseCode 1 = đang xử lý
              console.log(`[OTISSIM V2 FUNOTP] Still waiting for OTP for session ${sessionId}`);
            } else if (data.ResponseCode === 2) {
              // ResponseCode 2 = lỗi - process refund
              const errorMessage = data.Message || 'Lỗi không xác định';
              console.log(`[OTISSIM V2 FUNOTP] Error getting OTP - ${errorMessage}, processing refund for session ${sessionId}`);
              
              // Update session status to expired
              session.status = 'expired';
              rentalSessions.set(sessionId, session);
              
              // Update database
              await storage.updatePhoneRentalHistory(sessionId, {
                status: 'expired',
                completedTime: new Date()
              });
              
              // Process refund for API error
              const refundResult = await processOtissimV2Refund(session.userId.toString(), sessionId, `FunOTP API Error: ${errorMessage}`, 'funotp_api_error');
              
              if (refundResult?.success) {
                console.log(`[OTISSIM V2 FUNOTP REFUND] Refunded ${refundResult.amount} VND for session ${sessionId} due to API error`);
                return res.json({
                  status: 'expired',
                  message: `Lỗi dịch vụ OTP: ${errorMessage}. Đã hoàn tiền vào tài khoản của bạn.`,
                  refunded: true
                });
              } else {
                return res.json({
                  status: 'error',
                  message: `Lỗi dịch vụ OTP: ${errorMessage}. Vui lòng liên hệ admin để được hoàn tiền.`,
                  refunded: false
                });
              }
            } else {
              // Unknown response
              console.log(`[OTISSIM V2 FUNOTP] Unknown response - ${JSON.stringify(data)}`);
            }
          } catch (funOtpError: any) {
            console.log(`[OTISSIM V2 FUNOTP] API Error for session ${sessionId}: ${funOtpError.message}`);
            
            // Update session status to expired
            session.status = 'expired';
            rentalSessions.set(sessionId, session);
            
            // Update database
            await storage.updatePhoneRentalHistory(sessionId, {
              status: 'expired',
              completedTime: new Date()
            });
            
            // Process refund for connection error
            const refundResult = await processOtissimV2Refund(session.userId.toString(), sessionId, `FunOTP connection error: ${funOtpError.message}`, 'funotp_connection_error');
            
            if (refundResult?.success) {
              console.log(`[OTISSIM V2 FUNOTP ERROR REFUND] Refunded ${refundResult.amount} VND for session ${sessionId} due to connection error`);
              return res.json({
                status: 'expired',
                message: `Lỗi kết nối dịch vụ OTP. Đã hoàn tiền vào tài khoản của bạn.`,
                refunded: true
              });
            } else {
              return res.json({
                status: 'error',
                message: `Lỗi kết nối dịch vụ OTP. Vui lòng liên hệ admin để được hoàn tiền.`,
                refunded: false
              });
            }
          }

        } else if (session.service === 'otissim_v1') {
          // Get OTP from 365otp API
          const { id, apiKey } = session.apiResponse;
          
          const response = await fetch(`https://365otp.com/apiv1/ordercheck?apikey=${apiKey}&id=${id}`, {
            method: 'GET',
            timeout: 15000
          } as any);
          
          if (!response.ok) {
            throw new Error(`Lỗi lấy mã OTP từ dịch vụ thuê sim v1: ${response.status}`);
          }

          const data = await response.json() as any;
          
          // 365otp response: {"status":1,"message":"thành công","data":{"id":40253541,"phone":"0347413565","message":"","haveVoice":false,"audioUrl":"","code":"","statusOrder":0}}
          // status: 1 = thành công, <0 = thất bại
          // data.statusOrder: 1 = success (OTP received), 0 = waiting, <0 = failed
          if (data.status === 1 && data.data) {
            const statusOrder = data.data.statusOrder;
            
            if (statusOrder === 1 && data.data.code) {
              // Found OTP
              otpResult = data.data.code;
              console.log(`[OTISSIM V1 365OTP] Received OTP for session ${sessionId}: ${otpResult}`);
            } else if (statusOrder < 0) {
              // Failed - refund
              throw new Error(`365otp failed to get OTP - statusOrder: ${statusOrder}`);
            }
            // else statusOrder === 0: still waiting, don't throw error
          } else if (data.status < 0) {
            // API error
            const errorMessage = data.message || 'Lỗi không xác định';
            throw new Error(`365otp error: ${errorMessage}`);
          }
        }

        if (otpResult) {
          // Update session with OTP
          session.otp = otpResult;
          session.status = 'completed';
          rentalSessions.set(sessionId, session);

          // Update database history with completed status and OTP
          const updateData: any = {
            status: 'completed',
            otpCode: otpResult,
            completedTime: new Date()
          };
          
          // CRITICAL FIX: For v3 sessions with enhanced data, also update apiResponseData
          if (session.service === 'otissim_v3' && session.apiResponse.v3Response) {
            updateData.apiResponseData = JSON.stringify(session.apiResponse);
            console.log(`[V3 ENHANCED] Persisting enhanced data to database for session ${sessionId}`);
          }
          
          await storage.updatePhoneRentalHistory(sessionId, updateData);

          // Remove from global queue when session completes
          if (session.service === 'otissim_v2' && session.phoneNumber) {
            console.log(`[SHOPEE V2 GLOBAL QUEUE] Removing number ${session.phoneNumber} for user ${session.userId} (completed)`);
            removeFromShopeeV2GlobalQueue(parseInt(session.userId), session.phoneNumber);
          }

          // Prepare response with potential v3 enhanced data
          const response: any = {
            status: 'completed', 
            otp: otpResult,
            message: 'Đã nhận được OTP thành công'
          };

          // Add v3-specific enhanced data if available
          if (session.service === 'otissim_v3' && session.v3Response) {
            response.v3Response = session.v3Response;
          }

          return res.json(response);
        } else {
          // Check if session has expired
          const currentTime = new Date();
          if (currentTime > new Date(session.expiresAt)) {
            // Session expired - refund money and update status
            try {
              // Update session status to expired
              session.status = 'expired';
              rentalSessions.set(sessionId, session);

              // Update database
              await storage.updatePhoneRentalHistory(sessionId, {
                status: 'expired',
                completedTime: new Date()
              });

              // Remove from global queue before refund
              if (session.service === 'otissim_v2' && session.phoneNumber) {
                console.log(`[SHOPEE V2 GLOBAL QUEUE] Removing number ${session.phoneNumber} for user ${session.userId} (expired in OTP)`);
                removeFromShopeeV2GlobalQueue(parseInt(session.userId), session.phoneNumber);
              }

              // Refund money to user - sử dụng function riêng cho từng service
              let refundResult;
              if (session.service === 'otissim_v1') {
                refundResult = await processOtissimV1Refund(session.userId, sessionId, `Session hết hạn`, 'auto_refund_phone');
              } else if (session.service === 'otissim_v2') {
                refundResult = await processOtissimV2Refund(session.userId, sessionId, `Session hết hạn`, 'auto_refund_phone');
              } else if (session.service === 'otissim_v3') {
                refundResult = await processOtissimV3Refund(session.userId, sessionId, `Session hết hạn`, 'auto_refund_phone');
              } else {
                refundResult = await processOtissimV1Refund(session.userId, sessionId, `Session hết hạn`, 'auto_refund_phone');
              }

              console.log(`[AUTO-REFUND] Session ${sessionId} expired - Refunded ${refundResult.amount} VND to user ${session.userId}`);

              const refundAmountDisplay = session.service === 'otissim_v3' ? '2,000' : '1,900';
              return res.json({
                status: 'expired',
                message: `Session đã hết hạn. Đã hoàn ${refundAmountDisplay} VND vào tài khoản của bạn.`,
                refunded: true
              });
            } catch (refundError) {
              console.error('[AUTO-REFUND ERROR]', refundError);
              return res.json({
                status: 'expired',
                message: 'Session đã hết hạn nhưng gặp lỗi khi hoàn tiền. Vui lòng liên hệ admin.',
                refunded: false
              });
            }
          }

          // Still waiting for OTP
          return res.json({ 
            status: 'waiting',
            message: 'Đang chờ OTP...'
          });
        }

      } catch (error: any) {
        console.error('OTP fetch error:', error);
        return res.json({ 
          status: 'error',
          message: error.message || 'Lỗi khi lấy OTP'
        });
      }
  }

  // Active sessions endpoint with automatic refund for expired sessions
  app.get("/api/phone-rental/active-sessions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      let sessions = await storage.getActivePhoneRentalSessions(userId);
      
      // Check for expired sessions and auto-refund
      const currentTime = new Date();
      let refundedCount = 0;
      
      for (const session of sessions) {
        if (session.status === 'waiting' && new Date(session.expiresAt) < currentTime) {
          console.log(`[AUTO-REFUND] Processing expired session: ${session.sessionId}, service: ${session.service}`);
          
          // Update session status
          await storage.updatePhoneRentalHistory(session.sessionId, {
            status: 'expired',
            completedTime: currentTime
          });
          
          // Remove from global queue before refund
          if (session.service === 'otissim_v2' && session.phoneNumber) {
            console.log(`[SHOPEE V2 GLOBAL QUEUE] Removing number ${session.phoneNumber} for user ${userId} (expired in active-sessions)`);
            removeFromShopeeV2GlobalQueue(userId, session.phoneNumber);
          }

          // Process refund based on service type
          let refundResult;
          if (session.service === 'otissim_v1') {
            refundResult = await processOtissimV1Refund(userId, session.sessionId, 'Session hết hạn (auto-check)', 'auto_expiry_refund');
          } else if (session.service === 'otissim_v2') {
            refundResult = await processOtissimV2Refund(userId, session.sessionId, 'Session hết hạn (auto-check)', 'auto_expiry_refund');
          } else if (session.service === 'otissim_v3') {
            refundResult = await processOtissimV3Refund(userId, session.sessionId, 'Session hết hạn (auto-check)', 'auto_expiry_refund');
          } else {
            refundResult = await processOtissimV1Refund(userId, session.sessionId, 'Session hết hạn (auto-check)', 'auto_expiry_refund');
          }
          
          if (refundResult) {
            refundedCount++;
            console.log(`[AUTO-REFUND] Successfully refunded ${refundResult.amount} VND for session ${session.sessionId}`);
          }
        }
      }
      
      // Re-fetch sessions after potential updates
      sessions = await storage.getActivePhoneRentalSessions(userId);
      
      res.json(sessions);
    } catch (error) {
      console.error('Phone rental active sessions error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Shopee v2 global queue status endpoint
  app.get('/api/phone-rental/shopee-v2-status', authenticateTokenOrApiKey, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const status = getShopeeV2GlobalQueueStatus(userId);
      
      res.json({
        userId: userId,
        globalPending: status.globalPending,
        maxPending: status.maxPending,
        userPending: status.userPending,
        userPendingNumbers: status.userPendingNumbers,
        canRequestNow: status.canRequest,
        nextAllowedTime: status.nextAllowedTime,
        timeUntilNextRequest: status.nextAllowedTime ? Math.max(0, status.nextAllowedTime - Date.now()) : 0
      });
    } catch (error) {
      console.error('Global queue status check error:', error);
      res.status(500).json({ error: 'Lỗi khi kiểm tra trạng thái global queue' });
    }
  });

  // Debug endpoint để kiểm tra và sửa session hết hạn chưa hoàn tiền
  app.post("/api/phone-rental/fix-expired", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // Tìm tất cả session hết hạn nhưng chưa được refund
      const expiredSessions = await storage.getExpiredPhoneRentalSessions(userId);
      
      console.log(`[FIX-EXPIRED] Found ${expiredSessions.length} expired sessions for user ${userId}`);
      
      let fixedSessions = 0;
      let totalRefunded = 0;
      
      for (const session of expiredSessions) {
        console.log(`[FIX-EXPIRED] Processing session ${session.sessionId}, service: ${session.service}, cost: ${session.cost}`);
        
        // Update status to expired
        await storage.updatePhoneRentalHistory(session.sessionId, {
          status: 'expired',
          completedTime: new Date()
        });
        
        // Process refund
        let refundResult;
        if (session.service === 'otissim_v1') {
          refundResult = await processOtissimV1Refund(userId, session.sessionId, 'Fix expired session - manual refund', 'manual_fix_refund');
        } else if (session.service === 'otissim_v2') {
          refundResult = await processOtissimV2Refund(userId, session.sessionId, 'Fix expired session - manual refund', 'manual_fix_refund');
        } else if (session.service === 'otissim_v3') {
          refundResult = await processOtissimV3Refund(userId, session.sessionId, 'Fix expired session - manual refund', 'manual_fix_refund');
        }
        
        if (refundResult) {
          fixedSessions++;
          totalRefunded += refundResult.amount;
          console.log(`[FIX-EXPIRED] Refunded ${refundResult.amount} VND for session ${session.sessionId}`);
        }
      }
      
      res.json({
        success: true,
        message: `Đã sửa ${fixedSessions} session hết hạn và hoàn ${totalRefunded} VND`,
        fixedSessions,
        totalRefunded
      });
      
    } catch (error) {
      console.error('[FIX-EXPIRED ERROR]', error);
      res.status(500).json({ error: "Lỗi khi sửa session hết hạn" });
    }
  });

  // Auto-refund expired sessions endpoint 
  app.post("/api/phone-rental/check-expired", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      let refundedSessions = 0;
      let totalRefunded = 0;
      
      // Get all waiting sessions for this user
      const activeSessions = await storage.getActivePhoneRentalSessions(userId);
      const currentTime = new Date();
      
      for (const session of activeSessions) {
        const sessionExpiry = new Date(session.expiresAt);
        const timeDiff = sessionExpiry.getTime() - currentTime.getTime();
        const minutesRemaining = Math.floor(timeDiff / (1000 * 60));
        
        console.log(`[AUTO-REFUND] Session ${session.sessionId}: expires at ${sessionExpiry.toISOString()}, current time ${currentTime.toISOString()}, minutes remaining: ${minutesRemaining}`);
        
        if (session.status === 'waiting' && sessionExpiry < currentTime) {
          console.log(`[AUTO-REFUND] Processing expired phone rental session: ${session.sessionId}`);
          
          // Update session status to expired
          await storage.updatePhoneRentalHistory(session.sessionId, {
            status: 'expired',
            completedTime: currentTime
          });
          
          // Refund money to user - sử dụng function riêng cho từng service
          let refundResult;
          if (session.service === 'otissim_v1') {
            refundResult = await processOtissimV1Refund(userId, session.sessionId, 'Session hết hạn (check-expired)', 'auto_refund_phone');
          } else if (session.service === 'otissim_v2') {
            refundResult = await processOtissimV2Refund(userId, session.sessionId, 'Session hết hạn (check-expired)', 'auto_refund_phone');
          } else if (session.service === 'otissim_v3') {
            refundResult = await processOtissimV3Refund(userId, session.sessionId, 'Session hết hạn (check-expired)', 'auto_refund_phone');
          } else {
            refundResult = await processOtissimV1Refund(userId, session.sessionId, 'Session hết hạn (check-expired)', 'auto_refund_phone');
          }
          
          refundedSessions++;
          totalRefunded += refundResult.amount;
          
          console.log(`[AUTO-REFUND] Refunded ${refundResult.amount} VND for expired session: ${session.sessionId}`);
        }
      }
      
      if (refundedSessions > 0) {
        res.json({
          success: true,
          refundedSessions,
          totalRefunded,
          message: `Đã hoàn tiền ${refundedSessions} session hết hạn - Tổng: ${totalRefunded.toLocaleString('vi-VN')} VND`
        });
      } else {
        res.json({
          success: true,
          refundedSessions: 0,
          message: 'Không có session nào cần hoàn tiền'
        });
      }
    } catch (error) {
      console.error('[AUTO-REFUND] Error checking expired phone rental sessions:', error);
      res.status(500).json({ message: 'Lỗi khi kiểm tra session hết hạn' });
    }
  });



  // Helper function to cancel phone number on ChayCodeso3 API
  async function cancelChayCodeso3Number(apiKey: string, numberId: string): Promise<boolean> {
    try {
      console.log(`[CHAYCODESO3 CANCEL] Canceling number ID: ${numberId} with API key: ${apiKey.substring(0, 10)}...`);
      
      const apiUrl = `https://chaycodeso3.com/api?act=expired&apik=${apiKey}&id=${numberId}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        timeout: 10000
      } as any);

      if (!response.ok) {
        console.error(`[CHAYCODESO3 CANCEL] API connection failed - ${response.status}`);
        return false;
      }

      const data = await response.json() as any;
      
      if (data.ResponseCode === 0) {
        console.log(`[CHAYCODESO3 CANCEL] Successfully canceled number ID: ${numberId}`);
        return true;
      } else {
        console.error(`[CHAYCODESO3 CANCEL] Failed to cancel number ID: ${numberId}, error: ${data.Msg || 'Unknown error'}`);
        return false;
      }

    } catch (error: any) {
      console.error(`[CHAYCODESO3 CANCEL] Error canceling number ID ${numberId}:`, error.message);
      return false;
    }
  }

  // Phone Rental History API endpoints
  app.get("/api/phone-rental-history", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      
      // EGRESS OPTIMIZATION: Support pagination to prevent loading massive user history
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500); // Cap at 500
      const offset = (page - 1) * limit;
      
      // Simply return phone rental records only, no transaction mixing
      // This eliminates duplicate entries since transactions are just financial records
      // while phone rental records contain the actual rental information
      const phoneRentals = await storage.getPhoneRentalHistoryByUser(userId!, limit, offset);
      
      // Check if we have pagination parameters to return paginated response
      if (req.query.page || req.query.limit) {
        res.json({
          data: phoneRentals,
          pagination: { page, limit, hasMore: phoneRentals.length === limit }
        });
      } else {
        // Backward compatibility - return raw array
        res.json(phoneRentals);
      }
    } catch (error) {
      console.error('Error fetching phone rental history:', error);
      res.status(500).json({ error: "Lỗi server khi lấy lịch sử thuê số" });
    }
  });

  app.get("/api/phone-rental-history/:sessionId", authenticateToken, async (req: any, res: any) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id;
      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
      
      const history = await storage.getPhoneRentalHistoryBySession(sessionId);
      
      if (!history) {
        return res.status(404).json({ error: "Không tìm thấy lịch sử thuê số" });
      }
      
      // Check if user owns this record or is admin
      if (!isAdmin && history.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }
      
      res.json(history);
    } catch (error) {
      console.error('Error fetching phone rental history by session:', error);
      res.status(500).json({ error: "Lỗi server khi lấy lịch sử thuê số" });
    }
  });

  // API Keys management endpoints
  app.get("/api/api-keys", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      
      // Mỗi user chỉ có thể xem API keys của chính họ
      const apiKeys = await storage.getApiKeysByUser(userId);
      
      res.json(apiKeys);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      res.status(500).json({ error: "Lỗi server khi lấy danh sách API keys" });
    }
  });

  app.post("/api/api-keys", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { keyName, keyValue, permissions, monthlyRequestLimit } = req.body;

      if (!keyName?.trim()) {
        return res.status(400).json({ error: "Tên API key không được để trống" });
      }

      if (!keyValue?.trim()) {
        return res.status(400).json({ error: "Giá trị API key không được để trống" });
      }

      if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ error: "Vui lòng chọn ít nhất một quyền truy cập" });
      }

      // Check if API key already exists
      const existingKey = await storage.getApiKeyByValue(keyValue);
      if (existingKey) {
        return res.status(400).json({ error: "API key này đã tồn tại" });
      }

      const apiKey = await storage.createApiKey({
        userId,
        keyName: keyName.trim(),
        keyValue: keyValue.trim(),
        permissions,
        monthlyRequestLimit: monthlyRequestLimit || 1000,
        isActive: true
      });

      res.json(apiKey);
    } catch (error) {
      console.error('Error creating API key:', error);
      res.status(500).json({ error: "Lỗi server khi tạo API key" });
    }
  });

  app.patch("/api/api-keys/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const updates = req.body;

      // Chỉ lấy API keys của user hiện tại
      const apiKeys = await storage.getApiKeysByUser(userId);
      const existingKey = apiKeys.find(key => key.id === parseInt(id));
      
      if (!existingKey) {
        return res.status(404).json({ error: "Không tìm thấy API key hoặc bạn không có quyền truy cập" });
      }

      // Kiểm tra ownership - chỉ có thể sửa API key của chính mình
      if (existingKey.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền cập nhật API key này" });
      }

      const updatedKey = await storage.updateApiKey(parseInt(id), updates);
      if (!updatedKey) {
        return res.status(404).json({ error: "Không tìm thấy API key" });
      }

      res.json(updatedKey);
    } catch (error) {
      console.error('Error updating API key:', error);
      res.status(500).json({ error: "Lỗi server khi cập nhật API key" });
    }
  });

  app.delete("/api/api-keys/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      // Chỉ lấy API keys của user hiện tại
      const apiKeys = await storage.getApiKeysByUser(userId);
      const existingKey = apiKeys.find(key => key.id === parseInt(id));
      
      if (!existingKey) {
        return res.status(404).json({ error: "Không tìm thấy API key hoặc bạn không có quyền truy cập" });
      }

      // Kiểm tra ownership - chỉ có thể xóa API key của chính mình
      if (existingKey.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền xóa API key này" });
      }

      const deleted = await storage.deleteApiKey(parseInt(id));
      if (!deleted) {
        return res.status(404).json({ error: "Không tìm thấy API key" });
      }

      res.json({ message: "API key đã được xóa thành công" });
    } catch (error) {
      console.error('Error deleting API key:', error);
      res.status(500).json({ error: "Lỗi server khi xóa API key" });
    }
  });

  // External API Keys management endpoints
  app.get("/api/external-api-keys", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      
      // Lấy tất cả API keys của user cho các providers
      const externalApiKeys = await storage.getExternalApiKeysByUser(userId);
      
      res.json(externalApiKeys);
    } catch (error) {
      console.error('Error fetching external API keys:', error);
      res.status(500).json({ error: "Lỗi server khi lấy danh sách API keys của nhà cung cấp" });
    }
  });

  app.post("/api/external-api-keys", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { provider, keyName, keyValue } = req.body;

      if (!provider?.trim()) {
        return res.status(400).json({ error: "Nhà cung cấp không được để trống" });
      }

      if (!["viotp", "chaycodes3", "365otp", "funotp", "ironsim", "bossotp"].includes(provider)) {
        return res.status(400).json({ error: "Nhà cung cấp không hợp lệ" });
      }

      if (!keyName?.trim()) {
        return res.status(400).json({ error: "Tên API key không được để trống" });
      }

      if (!keyValue?.trim()) {
        return res.status(400).json({ error: "API key không được để trống" });
      }

      // Kiểm tra xem user đã có API key cho provider này chưa
      const existingKey = await storage.getExternalApiKeyByUserAndProvider(userId, provider);
      if (existingKey) {
        return res.status(400).json({ error: "Bạn đã có API key cho nhà cung cấp này" });
      }

      // Kiểm tra API key có hợp lệ bằng cách gọi API balance trước khi lưu
      console.log(`[EXTERNAL-API] Validating API key for provider: ${provider}`);
      
      let balanceCheckResult = null;
      let validationError = null;
      
      try {
        switch (provider) {
          case 'viotp':
            balanceCheckResult = await checkViotpBalance(keyValue.trim());
            break;
            
          case 'chaycodes3':
            balanceCheckResult = await checkChaycodesBalance(keyValue.trim());
            break;
            
          case '365otp':
            balanceCheckResult = await check365OtpBalance(keyValue.trim());
            break;
            
          case 'funotp':
            balanceCheckResult = await checkFunOtpBalance(keyValue.trim());
            break;
            
          case 'ironsim':
            balanceCheckResult = await checkIronSimBalance(keyValue.trim());
            break;
            
          case 'bossotp':
            balanceCheckResult = await checkBossOtpBalance(keyValue.trim());
            break;
            
          default:
            validationError = "Nhà cung cấp không được hỗ trợ";
        }
      } catch (balanceError: any) {
        console.error(`[EXTERNAL-API] Balance check failed for provider ${provider}:`, balanceError);
        validationError = balanceError.message || "Lỗi khi kiểm tra API key";
      }

      // Kiểm tra kết quả validation
      if (validationError) {
        console.log(`[EXTERNAL-API] ❌ API key validation failed: ${validationError}`);
        return res.status(400).json({ 
          error: `API key không hợp lệ: ${validationError}` 
        });
      }

      if (balanceCheckResult?.error) {
        console.log(`[EXTERNAL-API] ❌ API key validation failed: ${balanceCheckResult.error}`);
        return res.status(400).json({ 
          error: `API key không hợp lệ: ${balanceCheckResult.error}` 
        });
      }

      if (balanceCheckResult?.balance === undefined || balanceCheckResult?.balance === null) {
        console.log(`[EXTERNAL-API] ❌ Cannot retrieve balance from API key`);
        return res.status(400).json({ 
          error: "API key không thể kết nối hoặc không có số dư" 
        });
      }

      console.log(`[EXTERNAL-API] ✅ API key validated successfully. Balance: ${balanceCheckResult.balance}`);

      // Tạo API key với balance đã kiểm tra
      const newApiKey = await storage.createExternalApiKey({
        userId,
        provider: provider.trim(),
        keyName: keyName.trim(),
        keyValue: keyValue.trim(),
        isActive: true
      });

      // Cập nhật balance ngay sau khi tạo
      await storage.updateExternalApiKeyBalance(newApiKey.id, balanceCheckResult.balance, null);

      res.json(newApiKey);
    } catch (error) {
      console.error('Error creating external API key:', error);
      res.status(500).json({ error: "Lỗi server khi tạo API key" });
    }
  });

  app.patch("/api/external-api-keys/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const updates = req.body;

      // Lấy API key và kiểm tra ownership
      const externalApiKeys = await storage.getExternalApiKeysByUser(userId);
      const existingKey = externalApiKeys.find(key => key.id === parseInt(id));
      
      if (!existingKey) {
        return res.status(404).json({ error: "Không tìm thấy API key hoặc bạn không có quyền truy cập" });
      }

      if (existingKey.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền cập nhật API key này" });
      }

      const updatedKey = await storage.updateExternalApiKey(parseInt(id), updates);
      if (!updatedKey) {
        return res.status(404).json({ error: "Không tìm thấy API key" });
      }

      res.json(updatedKey);
    } catch (error) {
      console.error('Error updating external API key:', error);
      res.status(500).json({ error: "Lỗi server khi cập nhật API key" });
    }
  });

  app.delete("/api/external-api-keys/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      // Lấy API key và kiểm tra ownership
      const externalApiKeys = await storage.getExternalApiKeysByUser(userId);
      const existingKey = externalApiKeys.find(key => key.id === parseInt(id));
      
      if (!existingKey) {
        return res.status(404).json({ error: "Không tìm thấy API key hoặc bạn không có quyền truy cập" });
      }

      if (existingKey.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền xóa API key này" });
      }

      const deleted = await storage.deleteExternalApiKey(parseInt(id));
      if (!deleted) {
        return res.status(404).json({ error: "Không tìm thấy API key" });
      }

      res.json({ message: "API key đã được xóa thành công" });
    } catch (error) {
      console.error('Error deleting external API key:', error);
      res.status(500).json({ error: "Lỗi server khi xóa API key" });
    }
  });

  // Helper functions for checking balance on external providers
  async function checkViotpBalance(apiKey: string) {
    try {
      // Viotp API để check balance
      const response = await fetch(`https://api.viotp.com/users/balance?token=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Response format: {"status_code":200,"message":"successful","success":true,"data":{"balance":150}}
      if (data.success && data.data && typeof data.data.balance !== 'undefined') {
        return {
          balance: parseFloat(data.data.balance),
          error: null
        };
      } else {
        return {
          balance: 0,
          error: data.message || "Không thể lấy số dư từ Viotp"
        };
      }
    } catch (error: any) {
      return {
        balance: 0,
        error: `Lỗi Viotp: ${error.message}`
      };
    }
  }

  async function checkChaycodesBalance(apiKey: string) {
    try {
      // Chaycodes3 API để check balance
      const response = await fetch(`https://chaycodeso3.com/api?act=account&apik=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Response format: { "ResponseCode": 0, "Msg": "OK", "Result": { "Phone": "0399900112", "Name": "NGUYEN VAN A", "Balance": 500000 } }
      if (data.ResponseCode === 0 && data.Result && typeof data.Result.Balance !== 'undefined') {
        return {
          balance: parseFloat(data.Result.Balance),
          error: null
        };
      } else {
        return {
          balance: 0,
          error: data.Msg || "Không thể lấy số dư từ Chaycodes3"
        };
      }
    } catch (error: any) {
      return {
        balance: 0,
        error: `Lỗi Chaycodes3: ${error.message}`
      };
    }
  }

  async function check365OtpBalance(apiKey: string) {
    try {
      // 365OTP API để check balance 
      const response = await fetch(`https://365otp.com/apiv1/getbalance?apikey=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Response format: {"status":1,"message":"thành công","balance":2}
      if (data.status === 1 && typeof data.balance !== 'undefined') {
        return {
          balance: parseFloat(data.balance),
          error: null
        };
      } else {
        return {
          balance: 0,
          error: data.message || "Không thể lấy số dư từ 365OTP"
        };
      }
    } catch (error: any) {
      return {
        balance: 0,
        error: `Lỗi 365OTP: ${error.message}`
      };
    }
  }

  async function checkFunOtpBalance(apiKey: string) {
    try {
      // FunOTP API để check balance
      const response = await fetch(`https://funotp.com/api?action=account&apikey=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Response format: {"ResponseCode": 0, "Result": { "email": "your_email@gmail.com", "balance": 100000 }}
      if (data.ResponseCode === 0 && data.Result && typeof data.Result.balance !== 'undefined') {
        return {
          balance: parseFloat(data.Result.balance),
          error: null
        };
      } else {
        return {
          balance: 0,
          error: data.message || data.error || "Không thể lấy số dư từ FunOTP"
        };
      }
    } catch (error: any) {
      return {
        balance: 0,
        error: `Lỗi FunOTP: ${error.message}`
      };
    }
  }

  async function checkIronSimBalance(apiKey: string) {
    try {
      // IronSim API để check balance
      const response = await fetch(`https://ironsim.com/api/user/balance?token=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Response format: {"status_code":200,"success":true,"message":"successful","data":{"balance":0}}
      if (data.status_code === 200 && data.success && data.data && typeof data.data.balance !== 'undefined') {
        return {
          balance: parseFloat(data.data.balance),
          error: null
        };
      } else {
        return {
          balance: 0,
          error: "Định dạng response từ IronSim không đúng hoặc API key không hợp lệ"
        };
      }
    } catch (error: any) {
      return {
        balance: 0,
        error: `Lỗi IronSim: ${error.message}`
      };
    }
  }

  async function checkBossOtpBalance(apiKey: string) {
    try {
      // BossOTP API để check balance
      const response = await fetch(`https://bossotp.net/api/v4/users/me/balance?api_token=${apiKey}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Response format: {"balance":168417}
      if (typeof data.balance !== 'undefined') {
        return {
          balance: parseFloat(data.balance),
          error: null
        };
      } else {
        return {
          balance: 0,
          error: data.message || data.error || "Không thể lấy số dư từ BossOTP"
        };
      }
    } catch (error: any) {
      return {
        balance: 0,
        error: `Lỗi BossOTP: ${error.message}`
      };
    }
  }

  // Check balance for external API providers
  app.post("/api/external-api-keys/:id/check-balance", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      // Lấy API key và kiểm tra ownership
      const externalApiKeys = await storage.getExternalApiKeysByUser(userId);
      const apiKey = externalApiKeys.find(key => key.id === parseInt(id));
      
      if (!apiKey) {
        return res.status(404).json({ error: "Không tìm thấy API key hoặc bạn không có quyền truy cập" });
      }

      if (apiKey.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền truy cập API key này" });
      }

      // Implement balance checking for each provider
      let balance = 0;
      let error = null;

      try {
        switch (apiKey.provider) {
          case 'viotp':
            const viotpResult = await checkViotpBalance(apiKey.keyValue);
            balance = viotpResult.balance;
            error = viotpResult.error;
            break;
            
          case 'chaycodes3':
            const chaycodesResult = await checkChaycodesBalance(apiKey.keyValue);
            balance = chaycodesResult.balance;
            error = chaycodesResult.error;
            break;
            
          case '365otp':
            const otpResult = await check365OtpBalance(apiKey.keyValue);
            balance = otpResult.balance;
            error = otpResult.error;
            break;
            
          case 'funotp':
            const funOtpResult = await checkFunOtpBalance(apiKey.keyValue);
            balance = funOtpResult.balance;
            error = funOtpResult.error;
            break;
            
          case 'ironsim':
            const ironSimResult = await checkIronSimBalance(apiKey.keyValue);
            balance = ironSimResult.balance;
            error = ironSimResult.error;
            break;
            
          case 'bossotp':
            const bossOtpResult = await checkBossOtpBalance(apiKey.keyValue);
            balance = bossOtpResult.balance;
            error = bossOtpResult.error;
            break;
            
          default:
            error = "Nhà cung cấp không được hỗ trợ";
        }
      } catch (balanceError: any) {
        console.error(`Error checking balance for provider ${apiKey.provider}:`, balanceError);
        error = balanceError.message || "Lỗi khi kiểm tra số dư";
      }

      await storage.updateExternalApiKeyBalance(parseInt(id), balance, error);

      res.json({ 
        balance, 
        error,
        lastChecked: new Date().toISOString() 
      });
    } catch (error) {
      console.error('Error checking balance:', error);
      res.status(500).json({ error: "Lỗi server khi kiểm tra số dư" });
    }
  });

  // Refresh all API keys balances
  app.post("/api/external-api-keys/refresh-all-balances", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const externalApiKeys = await storage.getExternalApiKeysByUser(userId);
      
      if (externalApiKeys.length === 0) {
        return res.json({ 
          message: "Không có API keys nào để cập nhật",
          updated: 0,
          results: []
        });
      }

      const results = [];
      let successCount = 0;

      for (const apiKey of externalApiKeys) {
        try {
          let balance = 0;
          let error = null;

          switch (apiKey.provider) {
            case 'viotp':
              const viotpResult = await checkViotpBalance(apiKey.keyValue);
              balance = viotpResult.balance;
              error = viotpResult.error;
              break;
              
            case 'chaycodes3':
              const chaycodesResult = await checkChaycodesBalance(apiKey.keyValue);
              balance = chaycodesResult.balance;
              error = chaycodesResult.error;
              break;
              
            case '365otp':
              const otpResult = await check365OtpBalance(apiKey.keyValue);
              balance = otpResult.balance;
              error = otpResult.error;
              break;
              
            case 'funotp':
              const funOtpResult = await checkFunOtpBalance(apiKey.keyValue);
              balance = funOtpResult.balance;
              error = funOtpResult.error;
              break;
              
            case 'ironsim':
              const ironSimResult = await checkIronSimBalance(apiKey.keyValue);
              balance = ironSimResult.balance;
              error = ironSimResult.error;
              break;
              
            case 'bossotp':
              const bossOtpResult = await checkBossOtpBalance(apiKey.keyValue);
              balance = bossOtpResult.balance;
              error = bossOtpResult.error;
              break;
              
            default:
              error = "Nhà cung cấp không được hỗ trợ";
          }

          await storage.updateExternalApiKeyBalance(apiKey.id, balance, error);
          
          results.push({
            id: apiKey.id,
            keyName: apiKey.keyName,
            provider: apiKey.provider,
            balance,
            error,
            success: !error
          });

          if (!error) successCount++;

        } catch (keyError: any) {
          console.error(`Error refreshing balance for key ${apiKey.id}:`, keyError);
          results.push({
            id: apiKey.id,
            keyName: apiKey.keyName,
            provider: apiKey.provider,
            balance: 0,
            error: keyError.message || "Lỗi khi cập nhật",
            success: false
          });
        }
      }

      res.json({
        message: `Đã cập nhật ${successCount}/${externalApiKeys.length} API keys`,
        updated: successCount,
        total: externalApiKeys.length,
        results
      });
    } catch (error) {
      console.error('Error refreshing all balances:', error);
      res.status(500).json({ error: "Lỗi server khi cập nhật số dư" });
    }
  });

  // External API rental endpoints
  app.get("/api/external-api-rentals", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const rentals = await storage.getExternalApiRentalsByUser(userId);
      
      // AUTO-EXPIRE old allocated sessions that haven't been checked for OTP for 30+ minutes
      const now = new Date();
      const expiredSessions = [];
      
      for (const rental of rentals) {
        if (rental.status === 'allocated' && rental.createdAt) {
          const sessionAge = now.getTime() - new Date(rental.createdAt).getTime();
          if (sessionAge > 5 * 60 * 1000) { // 5 minutes (temporary for testing)
            expiredSessions.push(rental.sessionId);
          }
        }
      }
      
      // Update expired sessions to failed status
      for (const sessionId of expiredSessions) {
        await storage.updateExternalApiRental(sessionId, {
          status: "failed",
          completedAt: new Date(),
          notes: "Auto-expired: Session quá lâu không được check OTP"
        });
        console.log(`[AUTO-EXPIRE] Session ${sessionId} đã được đánh dấu failed vì quá hạn`);
      }
      
      // Re-fetch if any sessions were expired
      const finalRentals = expiredSessions.length > 0 
        ? await storage.getExternalApiRentalsByUser(userId)
        : rentals;
      
      res.json(finalRentals);
    } catch (error) {
      console.error('Error fetching external API rentals:', error);
      res.status(500).json({ error: "Lỗi server khi lấy danh sách thuê số" });
    }
  });

  app.post("/api/external-api-rentals", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { provider, carrier = 'random', apiKeyId } = req.body;

      if (!provider?.trim()) {
        return res.status(400).json({ error: "Nhà cung cấp không được để trống" });
      }

      if (!["viotp", "chaycodes3", "365otp", "funotp", "ironsim", "bossotp"].includes(provider)) {
        return res.status(400).json({ error: "Nhà cung cấp không hợp lệ" });
      }

      // Kiểm tra số dư user >= 100đ trước khi sử dụng dịch vụ
      const userBalance = await storage.getUserBalance(userId);
      if (userBalance < 100) {
        return res.status(400).json({ 
          error: "Số dư tài khoản không đủ. Bạn cần ít nhất 100đ để sử dụng dịch vụ tích hợp API." 
        });
      }

      // Lấy API key theo apiKeyId hoặc provider
      let apiKey;
      if (apiKeyId) {
        const userApiKeys = await storage.getExternalApiKeysByUser(userId);
        apiKey = userApiKeys.find(key => key.id === apiKeyId && key.provider === provider);
        if (!apiKey) {
          return res.status(400).json({ error: "API key không tồn tại hoặc không thuộc về provider này" });
        }
      } else {
        // Fallback to getting by provider for backward compatibility
        apiKey = await storage.getExternalApiKeyByUserAndProvider(userId, provider);
        if (!apiKey) {
          return res.status(400).json({ error: "Bạn cần cấu hình API key cho nhà cung cấp này trước" });
        }
      }

      // BƯỚC 1: KIỂM TRA API BALANCE TRƯỚC KHI TẠO SESSION
      console.log(`[EXTERNAL-API] Checking API balance for provider: ${provider}`);
      let apiBalanceResult = null;
      let apiBalanceError = null;
      
      try {
        switch (provider) {
          case 'viotp':
            apiBalanceResult = await checkViotpBalance(apiKey.keyValue);
            break;
            
          case 'chaycodes3':
            apiBalanceResult = await checkChaycodesBalance(apiKey.keyValue);
            break;
            
          case '365otp':
            apiBalanceResult = await check365OtpBalance(apiKey.keyValue);
            break;
            
          case 'funotp':
            apiBalanceResult = await checkFunOtpBalance(apiKey.keyValue);
            break;
            
          case 'ironsim':
            apiBalanceResult = await checkIronSimBalance(apiKey.keyValue);
            break;
            
          case 'bossotp':
            apiBalanceResult = await checkBossOtpBalance(apiKey.keyValue);
            break;
            
          default:
            apiBalanceError = "Nhà cung cấp không được hỗ trợ";
        }
      } catch (balanceError: any) {
        console.error(`[EXTERNAL-API] API balance check failed for provider ${provider}:`, balanceError);
        apiBalanceError = balanceError.message || "Lỗi khi kiểm tra số dư API";
      }

      // Kiểm tra kết quả API balance check
      if (apiBalanceError) {
        console.log(`[EXTERNAL-API] ❌ API balance check failed: ${apiBalanceError}`);
        return res.status(400).json({ 
          error: `Không thể kiểm tra số dư API: ${apiBalanceError}` 
        });
      }

      if (apiBalanceResult?.error) {
        console.log(`[EXTERNAL-API] ❌ API balance check failed: ${apiBalanceResult.error}`);
        return res.status(400).json({ 
          error: `API không khả dụng: ${apiBalanceResult.error}` 
        });
      }

      if (apiBalanceResult?.balance !== null && apiBalanceResult.balance <= 0) {
        console.log(`[EXTERNAL-API] ❌ API balance insufficient: ${apiBalanceResult.balance}`);
        return res.status(400).json({ 
          error: `Số dư API key không đủ để thuê số. Vui lòng nạp thêm số dư cho ${provider}.` 
        });
      }

      console.log(`[EXTERNAL-API] ✅ API balance check passed - Balance: ${apiBalanceResult?.balance || 'Available'}`);

      // Generate session ID
      const sessionId = `ext_${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

      // Implement number rental logic for each provider
      const rental = await storage.createExternalApiRental({
        userId,
        sessionId,
        provider,
        status: "requesting",
        maxAttempts: 10,
        attemptNumber: 1
      });

      // Start async process to rent number from external provider
      rentNumberFromProvider(rental.id, apiKey.keyValue, provider, carrier)
        .then(async (result) => {
          // Update rental with result - chuyển sang "failed" để ngừng auto-check OTP khi thất bại
          await storage.updateExternalApiRental(rental.sessionId, {
            status: result.success ? "allocated" : "failed",
            phoneNumber: result.phoneNumber,
            formattedPhoneNumber: result.formattedPhoneNumber,
            carrier: result.carrier,
            price: result.price,
            isShopeeRegistered: result.isShopeeRegistered,
            errorMessage: result.errorMessage,
            allocatedAt: result.success ? new Date() : null,
            completedAt: result.success ? null : new Date(),
            attemptNumber: result.attemptNumber || 1,
            providerRequestId: result.providerRequestId
          });
        })
        .catch(async (error) => {
          console.error('Error in number rental process:', error);
          await storage.updateExternalApiRental(rental.sessionId, {
            status: "failed", // Chuyển sang failed khi có lỗi
            errorMessage: error.message || "Lỗi không xác định trong quá trình thuê số",
            completedAt: new Date(),
            attemptNumber: 10 // Mark as max attempts reached
          });
        });

      res.json(rental);
    } catch (error) {
      console.error('Error creating external API rental:', error);
      res.status(500).json({ error: "Lỗi server khi tạo phiên thuê số" });
    }
  });

  app.get("/api/external-api-rentals/:sessionId", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      const rental = await storage.getExternalApiRental(sessionId);
      
      if (!rental) {
        return res.status(404).json({ error: "Không tìm thấy phiên thuê số" });
      }

      // Kiểm tra ownership
      if (rental.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền truy cập phiên thuê số này" });
      }

      res.json(rental);
    } catch (error) {
      console.error('Error fetching external API rental:', error);
      res.status(500).json({ error: "Lỗi server khi lấy thông tin phiên thuê số" });
    }
  });

  // Global throttle map for ALL OTP requests: sessionId -> lastRequestTime
  const globalOtpThrottleMap = new Map<string, number>();

  // Poll OTP for external API rental
  app.post("/api/external-api-rentals/:sessionId/get-otp", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      // AGGRESSIVE THROTTLE: Prevent spam - min 5 seconds between requests
      const now = Date.now();
      const lastRequest = globalOtpThrottleMap.get(sessionId);
      if (lastRequest && (now - lastRequest) < 5000) {
        return res.status(429).json({ 
          error: 'Đang chờ, vui lòng thử lại sau 5 giây',
          waitMs: 5000 - (now - lastRequest),
          status: 'throttled'
        });
      }
      globalOtpThrottleMap.set(sessionId, now);

      const rental = await storage.getExternalApiRental(sessionId);
      
      if (!rental) {
        return res.status(404).json({ error: "Không tìm thấy phiên thuê số" });
      }

      // Kiểm tra ownership
      if (rental.userId !== userId) {
        return res.status(403).json({ error: "Không có quyền truy cập phiên thuê số này" });
      }

      // Kiểm tra xem OTP đã được lấy chưa - CHECK FIRST!
      if (rental.otpCode) {
        return res.json({ 
          success: true, 
          otpCode: rental.otpCode,
          alreadyRetrieved: true,
          message: "OTP đã được lấy trước đó"
        });
      }

      // Kiểm tra xem số đã được cấp phát chưa (chỉ check khi chưa có OTP)
      if (rental.status !== "allocated" || !rental.phoneNumber || !rental.providerRequestId) {
        return res.status(400).json({ 
          error: "Số điện thoại chưa sẵn sàng để nhận OTP", 
          status: rental.status 
        });
      }

      // Lấy API key cho provider
      const apiKey = await storage.getExternalApiKeyByUserAndProvider(userId, rental.provider);
      if (!apiKey) {
        return res.status(400).json({ error: "Không tìm thấy API key cho nhà cung cấp này" });
      }

      // Poll OTP từ provider
      const otpResult = await pollOtpFromProvider(rental.provider, apiKey.keyValue, rental.providerRequestId);
      
      if (otpResult.success && otpResult.otpCode) {
        // TRỪ 100Đ SAU KHI LẤY THÀNH CÔNG OTP - Sử dụng atomic operation
        const chargeResult = await storage.chargeUserForOtp({
          userId,
          amount: 100,
          reference: `otp_${sessionId}`,
          description: `Trừ phí lấy OTP từ ${rental.provider} - ${rental.phoneNumber}`,
          metadata: {
            sessionId: sessionId,
            provider: rental.provider,
            phoneNumber: rental.phoneNumber
          }
        });

        if (!chargeResult.success) {
          return res.status(400).json({
            success: false,
            error: chargeResult.error || "Không thể trừ phí dịch vụ"
          });
        }

        // Chỉ cập nhật rental sau khi charge thành công
        await storage.updateExternalApiRental(sessionId, {
          status: "otp_received",
          otpCode: otpResult.otpCode,
          completedAt: new Date()
        });

        res.json({
          success: true,
          otpCode: otpResult.otpCode,
          message: "Lấy OTP thành công",
          charged: 100,
          newBalance: chargeResult.newBalance
        });
      } else if (otpResult.expired) {
        // Session hết hạn - tự động chuyển sang failed và ngừng check OTP
        await storage.updateExternalApiRental(sessionId, {
          status: "failed",
          completedAt: new Date(),
          notes: "Session hết hạn từ provider"
        });

        res.json({
          success: false,
          expired: true,
          message: otpResult.error || "Phiên thuê đã hết hạn",
          status: "failed"
        });
      } else {
        res.json({
          success: false,
          message: otpResult.error || "Chưa có OTP, vui lòng thử lại sau",
          status: "waiting_otp"
        });
      }
    } catch (error) {
      console.error('Error polling OTP:', error);
      res.status(500).json({ error: "Lỗi server khi lấy OTP" });
    }
  });

  // Webhook token management (admin only)
  app.get("/api/admin/webhook-token", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      const webhookConfig = await storage.getSystemConfigByKey('webhook_token');
      res.json({ 
        token: webhookConfig?.configValue || "785498fe70db1a226c3900d25385e3166268704f8b117ac87fd94b84a9a8c3dd",
        lastUpdated: webhookConfig?.createdAt 
      });
    } catch (error) {
      console.error('Error fetching webhook token:', error);
      res.status(500).json({ error: "Lỗi server khi lấy webhook token" });
    }
  });

  app.post("/api/admin/webhook-token", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền cập nhật" });
      }

      const { token } = req.body;
      if (!token?.trim()) {
        return res.status(400).json({ error: "Token không được để trống" });
      }

      // Check if webhook_token config exists
      const existingConfig = await storage.getSystemConfigByKey('webhook_token');
      
      if (existingConfig) {
        // Update existing config
        await storage.updateSystemConfig(existingConfig.id, {
          configValue: token.trim()
        });
      } else {
        // Create new config
        await storage.createSystemConfig({
          configKey: 'webhook_token',
          configValue: token.trim(),
          configType: 'security'
        });
      }

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'WEBHOOK_TOKEN_UPDATE',
        description: `Cập nhật webhook token`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json({ message: "Webhook token đã được cập nhật thành công" });
    } catch (error) {
      console.error('Error updating webhook token:', error);
      res.status(500).json({ error: "Lỗi server khi cập nhật webhook token" });
    }
  });

  // Top-up QR Code Generation
  app.post("/api/topup/generate-qr", authenticateTokenOrApiKey, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount, description } = req.body;
      const userId = req.user!.id;

      // Validate amount (minimum 20,000 VND)
      if (!amount || amount < 20000) {
        return res.status(400).json({ 
          error: "Số tiền nạp tối thiểu là 20,000 VND" 
        });
      }

      // Generate 8-character random string for tracking
      const randomCode = Math.random().toString(36).substr(2, 8).toUpperCase();
      const requestId = `TOP${Date.now()}${randomCode}`;
      
      // Create QR code URL using VietQR with random tracking code as addInfo
      const qrImageUrl = `https://img.vietqr.io/image/MB-6662691999-compact2.png?amount=${amount}&addInfo=${randomCode}&accountName=CU%20DUC%20HIEN`;
      
      try {
        // Fetch QR image and convert to base64 for HTTPS compatibility
        const qrResponse = await fetch(qrImageUrl);
        if (!qrResponse.ok) {
          throw new Error(`VietQR API error: ${qrResponse.status}`);
        }
        
        const qrBuffer = await qrResponse.arrayBuffer();
        const qrBase64 = `data:image/png;base64,${Buffer.from(qrBuffer).toString('base64')}`;
        
        // Set expiration time (30 minutes)
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        // Create topup request (save the random code as description for tracking)
        const topupRequest = await storage.createTopupRequest({
          id: requestId,
          userId,
          amount,
          description: randomCode, // Store only the 8-character tracking code for webhook matching
          qrUrl: qrBase64, // Store base64 image instead of external URL
          expiresAt
        });

        res.json(topupRequest);
      } catch (qrError) {
        console.error('Error fetching QR code from VietQR:', qrError);
        
        // Fallback: still create the request but with original URL (user may need to allow mixed content)
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        const topupRequest = await storage.createTopupRequest({
          id: requestId,
          userId,
          amount,
          description: randomCode,
          qrUrl: qrImageUrl, // Fallback to original URL
          expiresAt
        });

        res.json({
          ...topupRequest,
          warning: "QR code có thể không hiển thị được trên HTTPS. Vui lòng cho phép Mixed Content trong trình duyệt."
        });
      }
    } catch (error) {
      console.error("Error generating QR code:", error);
      res.status(500).json({ 
        error: "Không thể tạo mã QR. Vui lòng thử lại." 
      });
    }
  });

  // Get pending top-up requests for user
  app.get("/api/topup/pending", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // Expire old requests first
      await storage.expireOldTopupRequests();
      
      // Get pending requests
      const pendingRequests = await storage.getPendingTopupRequests(userId);
      
      res.json(pendingRequests);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      res.status(500).json({ 
        error: "Không thể lấy danh sách yêu cầu nạp tiền" 
      });
    }
  });

  // Get top-up history for user
  app.get("/api/topup/history", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // Get user's top-up history (QR code requests)
      const topupHistory = await storage.getTopupRequestsByUser(userId);
      
      // Get admin balance adjustments (admin_credit and admin_debit transactions)
      const adminTransactions = await storage.getTransactionsByUserAndTypes(userId, ['admin_credit', 'admin_debit']);
      // Remove debug logs for production
      
      // Convert topup requests to match frontend interface
      const qrHistory = topupHistory.map(request => ({
        id: request.id,
        userId: request.userId,
        amount: request.amount,
        status: request.status,
        qrUrl: request.qrUrl,
        createdAt: request.createdAt.toISOString(),
        expiresAt: request.expiresAt.toISOString(),
        description: request.description,
        balanceBefore: request.balanceBefore,
        balanceAfter: request.balanceAfter,
        adminNote: request.adminNote
      }));
      
      // Convert admin transactions to match frontend interface
      const adminHistory = adminTransactions.map(transaction => ({
        id: `ADM${transaction.id}`,
        userId: transaction.userId,
        amount: Math.abs(parseFloat(transaction.amount)),
        status: 'completed' as const,
        qrUrl: '',
        createdAt: transaction.createdAt.toISOString(),
        expiresAt: transaction.createdAt.toISOString(),
        description: transaction.description,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        adminNote: transaction.adminNote
      }));
      
      // Combine and sort by creation date (newest first)
      const combinedHistory = [...qrHistory, ...adminHistory]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json(combinedHistory);
    } catch (error) {
      console.error("Error fetching top-up history:", error);
      res.status(500).json({ 
        error: "Không thể lấy lịch sử nạp tiền" 
      });
    }
  });

  // HTTP Proxy management endpoints (admin only)
  app.get("/api/http-proxies", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      const proxies = await storage.getAllHttpProxies();
      res.json(proxies);
    } catch (error) {
      console.error('Error fetching HTTP proxies:', error);
      res.status(500).json({ error: "Lỗi server khi lấy danh sách proxy" });
    }
  });

  app.post("/api/http-proxies", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền tạo proxy" });
      }

      const { ip, port, username, password, label } = req.body;

      if (!ip?.trim() || !port || !username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "IP, port, username và password là bắt buộc" });
      }

      const proxy = await storage.createHttpProxy({
        ip: ip.trim(),
        port: parseInt(port),
        username: username.trim(),
        password: password.trim(),
        label: label?.trim() || null,
        isActive: true
      });

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'HTTP_PROXY_CREATE',
        description: `Tạo HTTP proxy: ${ip}:${port}`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json(proxy);
    } catch (error) {
      console.error('Error creating HTTP proxy:', error);
      res.status(500).json({ error: "Lỗi server khi tạo proxy" });
    }
  });

  app.post("/api/http-proxies/bulk", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền tạo proxy" });
      }

      const { proxiesText } = req.body;
      if (!proxiesText?.trim()) {
        return res.status(400).json({ error: "Danh sách proxy không được để trống" });
      }

      const lines = proxiesText.trim().split('\n');
      const proxies = [];
      const errors = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(':');
        if (parts.length !== 4) {
          errors.push(`Dòng ${i + 1}: Định dạng không đúng (cần ip:port:user:pass)`);
          continue;
        }

        const [ip, portStr, username, password] = parts;
        const port = parseInt(portStr);

        if (!ip || isNaN(port) || !username || !password) {
          errors.push(`Dòng ${i + 1}: Thông tin không hợp lệ`);
          continue;
        }

        proxies.push({
          ip: ip.trim(),
          port,
          username: username.trim(),
          password: password.trim(),
          label: `Bulk Import ${new Date().toISOString().split('T')[0]}`,
          isActive: true
        });
      }

      if (errors.length > 0 && proxies.length === 0) {
        return res.status(400).json({ error: errors.join(', ') });
      }

      const createdProxies = await storage.createBulkHttpProxies(proxies);

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'HTTP_PROXY_BULK_CREATE',
        description: `Tạo ${createdProxies.length} HTTP proxy hàng loạt`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json({ 
        success: true, 
        created: createdProxies.length, 
        errors: errors.length > 0 ? errors : undefined,
        proxies: createdProxies
      });
    } catch (error) {
      console.error('Error creating bulk HTTP proxies:', error);
      res.status(500).json({ error: "Lỗi server khi tạo proxy hàng loạt" });
    }
  });

  app.patch("/api/http-proxies/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền cập nhật proxy" });
      }

      const id = parseInt(req.params.id);
      const updates = req.body;

      const proxy = await storage.updateHttpProxy(id, updates);
      if (!proxy) {
        return res.status(404).json({ error: "Proxy không tồn tại" });
      }

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'HTTP_PROXY_UPDATE',
        description: `Cập nhật HTTP proxy: ${proxy.ip}:${proxy.port}`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json(proxy);
    } catch (error) {
      console.error('Error updating HTTP proxy:', error);
      res.status(500).json({ error: "Lỗi server khi cập nhật proxy" });
    }
  });

  app.delete("/api/http-proxies/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền xóa proxy" });
      }

      const id = parseInt(req.params.id);
      
      // Get proxy info before deletion for audit log
      const proxy = await storage.getHttpProxy(id);
      if (!proxy) {
        return res.status(404).json({ error: "Proxy không tồn tại" });
      }

      const success = await storage.deleteHttpProxy(id);
      if (!success) {
        return res.status(400).json({ error: "Không thể xóa proxy" });
      }

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'HTTP_PROXY_DELETE',
        description: `Xóa HTTP proxy: ${proxy.ip}:${proxy.port}`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json({ message: "Xóa proxy thành công" });
    } catch (error) {
      console.error('Error deleting HTTP proxy:', error);
      res.status(500).json({ error: "Lỗi server khi xóa proxy" });
    }
  });

  // Manual proxy test endpoint for debugging
  app.post("/api/http-proxies/test-manual", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền test proxy" });
      }

      const { ip, port, username, password } = req.body;
      if (!ip || !port || !username || !password) {
        return res.status(400).json({ error: "Thiếu thông tin proxy (ip, port, username, password)" });
      }

      const testProxy = { ip, port: parseInt(port), username, password };
      console.log(`=== MANUAL PROXY TEST START ===`);
      const isLive = await testProxyConnection(testProxy);
      console.log(`=== MANUAL PROXY TEST END: ${isLive ? 'LIVE' : 'DEAD'} ===`);

      res.json({
        proxy: `${ip}:${port}`,
        username: username,
        result: isLive ? 'LIVE' : 'DEAD',
        message: isLive ? 'Proxy hoạt động bình thường' : 'Proxy không hoạt động hoặc có lỗi'
      });

    } catch (error) {
      console.error('Error in manual proxy test:', error);
      res.status(500).json({ error: "Lỗi server khi test proxy" });
    }
  });

  // Check proxy liveness endpoint
  app.post("/api/http-proxies/check-live", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền kiểm tra proxy" });
      }

      const { proxyIds } = req.body;
      if (!Array.isArray(proxyIds) || proxyIds.length === 0) {
        return res.status(400).json({ error: "Danh sách proxy ID không hợp lệ" });
      }

      const results = [];
      let disabledCount = 0;
      let enabledCount = 0;

      // Process proxies in parallel batches of 15 for much faster checking
      const batchSize = 15;
      for (let i = 0; i < proxyIds.length; i += batchSize) {
        const batchIds = proxyIds.slice(i, i + batchSize);
        
        const batchPromises = batchIds.map(async (id) => {
          try {
            const proxy = await storage.getHttpProxy(id);
            if (!proxy) {
              return { id, status: 'not_found', live: false };
            }

            // Test proxy connectivity
            const isLive = await testProxyConnection(proxy);
            
            console.log(`Proxy ${proxy.ip}:${proxy.port} - Live: ${isLive}, Currently Active: ${proxy.isActive}`);
            
            if (isLive && !proxy.isActive) {
              // Enable proxy if it's live but currently inactive
              console.log(`Enabling proxy ${proxy.ip}:${proxy.port} - was inactive, now setting to active`);
              await storage.updateHttpProxy(id, { isActive: true, lastUsed: new Date() });
              enabledCount++;
            } else if (!isLive && proxy.isActive) {
              // Disable proxy if it's not live but currently active
              console.log(`Disabling proxy ${proxy.ip}:${proxy.port} - was active, now setting to inactive`);
              await storage.updateHttpProxy(id, { isActive: false });
              disabledCount++;
            } else if (isLive && proxy.isActive) {
              console.log(`Proxy ${proxy.ip}:${proxy.port} - already active and live, no change needed`);
            } else {
              console.log(`Proxy ${proxy.ip}:${proxy.port} - already inactive and dead, no change needed`);
            }

            return {
              id,
              ip: proxy.ip,
              port: proxy.port,
              live: isLive,
              status: isLive ? 'live' : 'dead',
              wasDisabled: !isLive && proxy.isActive
            };

          } catch (error) {
            console.error(`Error checking proxy ${id}:`, error);
            return { id, status: 'error', live: false, error: (error as Error).message };
          }
        });

        // Wait for current batch to complete
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'HTTP_PROXY_CHECK_LIVE',
        description: `Kiểm tra ${proxyIds.length} proxy, bật ${enabledCount} proxy live, tắt ${disabledCount} proxy chết`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json({
        success: true,
        totalChecked: proxyIds.length,
        liveCount: results.filter(r => r.live).length,
        deadCount: results.filter(r => !r.live).length,
        enabledCount,
        disabledCount,
        message: `Đã kiểm tra ${proxyIds.length} proxy: ${results.filter(r => r.live).length} live (bật ${enabledCount}), ${results.filter(r => !r.live).length} dead (tắt ${disabledCount})`,
        results
      });

    } catch (error) {
      console.error('Error checking proxy liveness:', error);
      res.status(500).json({ error: "Lỗi server khi kiểm tra proxy" });
    }
  });

  // Bulk delete proxies endpoint
  app.post("/api/http-proxies/bulk-delete", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền xóa proxy" });
      }

      const { proxyIds } = req.body;
      if (!Array.isArray(proxyIds) || proxyIds.length === 0) {
        return res.status(400).json({ error: "Danh sách proxy ID không hợp lệ" });
      }

      let deletedCount = 0;
      const deletedProxies = [];

      for (const id of proxyIds) {
        try {
          const proxy = await storage.getHttpProxy(id);
          if (proxy) {
            await storage.deleteHttpProxy(id);
            deletedCount++;
            deletedProxies.push(`${proxy.ip}:${proxy.port}`);
          }
        } catch (error) {
          console.error(`Error deleting proxy ${id}:`, error);
        }
      }

      // Log audit trail
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'HTTP_PROXY_BULK_DELETE',
        description: `Xóa hàng loạt ${deletedCount} proxy: ${deletedProxies.join(', ')}`,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      });

      res.json({
        success: true,
        deletedCount,
        message: `Đã xóa thành công ${deletedCount} proxy`,
        deletedProxies
      });

    } catch (error) {
      console.error('Error bulk deleting proxies:', error);
      res.status(500).json({ error: "Lỗi server khi xóa proxy" });
    }
  });


  // Webhook endpoint for bank transaction notifications
  app.post("/api/webhook/topup", async (req: Request, res: Response) => {
    try {
      console.log('Webhook received:', {
        headers: req.headers,
        body: req.body,
        timestamp: new Date().toISOString()
      });
      
      const authHeader = req.headers.authorization;
      
      // Always get fresh token from database on each request
      const webhookConfig = await storage.getSystemConfigByKey('webhook_token');
      let expectedToken = webhookConfig?.configValue;
      
      // Fallback to environment variable if database token not found
      if (!expectedToken) {
        expectedToken = process.env.WEBHOOK_TOKEN;
        console.log('Using environment WEBHOOK_TOKEN as fallback');
      } else {
        console.log('Using fresh database token:', expectedToken?.substring(0, 20) + "...");
      }
      
      // Final fallback to default if both sources empty
      if (!expectedToken) {
        expectedToken = "785498fe70db1a226c3900d25385e3166268704f8b117ac87fd94b84a9a8c3dd";
        console.log('Using default fallback token');
      }
      
      // Validate webhook authentication
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
      
      console.log('Token validation:', {
        authHeaderExists: !!authHeader,
        authHeaderFormat: authHeader?.substring(0, 20) + "...",
        extractedToken: token?.substring(0, 20) + "...",
        expectedToken: expectedToken?.substring(0, 20) + "...",
        tokenLength: { received: token?.length, expected: expectedToken?.length },
        exactMatch: token === expectedToken,
        receivedTokenFull: token,
        expectedTokenFull: expectedToken
      });
      
      if (!authHeader || !token || token !== expectedToken) {
        console.log('Webhook authentication FAILED - details logged above');
        return res.status(401).json({ error: "Unauthorized webhook request" });
      }
      
      console.log('Webhook authentication SUCCESS');

      const webhookData = req.body;
      
      if (!webhookData.status || !Array.isArray(webhookData.data)) {
        return res.status(400).json({ error: "Invalid webhook data format" });
      }

      // Process each transaction in the webhook
      for (const transaction of webhookData.data) {
        if (transaction.type === "IN" && transaction.description) {
          // Look for 8-character random code in transaction description
          const description = transaction.description.toString();
          
          // Find topup request by matching 8-character code in description
          const allRequests = await storage.getAllTopupRequests();
          const topupRequest = allRequests.find(req => 
            req.status === 'pending' && description.includes(req.description)
          );
          
          if (topupRequest) {
            const transactionAmount = parseInt(transaction.amount);
            
            // Verify amount matches (allow small variations)
            if (Math.abs(transactionAmount - topupRequest.amount) <= 1000) {
              
              // ⚠️ CRITICAL: Check for existing transaction with same reference to prevent duplicates
              const existingTransaction = await storage.getTransactionByReference(topupRequest.id);
              if (existingTransaction) {
                console.log(`🚫 DUPLICATE PREVENTED: Transaction with reference ${topupRequest.id} already exists (ID: ${existingTransaction.id})`);
                continue; // Skip this transaction to prevent duplicate processing
              }

              // Get current balance before update
              const balanceBefore = await storage.getUserBalance(topupRequest.userId);
              const balanceAfter = balanceBefore + transactionAmount;
              
              try {
                // Create transaction record with reference to prevent future duplicates
                const transactionRecord = await storage.createTransaction({
                  userId: topupRequest.userId,
                  type: 'top_up',
                  amount: transactionAmount.toString(),
                  description: `Nạp tiền QR Code thành công - Mã: ${topupRequest.description}`,
                  reference: topupRequest.id, // This reference will be checked for duplicates
                  status: 'completed',
                  balanceBefore: balanceBefore.toString(),
                  balanceAfter: balanceAfter.toString(),
                  skipBalanceUpdate: true // Webhook handles balance update manually below
                });

                console.log(`✅ Created transaction record ${transactionRecord.id} for topup ${topupRequest.id}`);

                // Update user balance (without admin user to avoid duplicate transaction)
                await storage.updateUserBalance(topupRequest.userId, balanceAfter);
                
                console.log(`✅ [WEBHOOK] Updated balance for user ${topupRequest.userId}: ${balanceBefore} → ${balanceAfter} VND`);

                // Update topup request status to completed with balance tracking (ONLY ONCE)
                await storage.updateTopupRequest(topupRequest.id, {
                  status: 'completed',
                  transactionId: transaction.transactionID,
                  bankReference: transaction.id,
                  balanceBefore: balanceBefore.toString(),
                  balanceAfter: balanceAfter.toString()
                });

              } catch (transactionError) {
                console.error(`❌ Error creating transaction for topup ${topupRequest.id}:`, transactionError);
                continue; // Skip this transaction on error
              }

              console.log(`✅ Webhook processed topup: ${topupRequest.id} - ${transactionAmount} VND for user ${topupRequest.userId}`);
            }
          }
        }
      }

      // Return required response format
      res.json({ 
        status: true, 
        msg: "Ok" 
      });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ 
        status: false, 
        msg: "Error processing webhook" 
      });
    }
  });

  // System Performance Monitoring API endpoints (admin only)
  app.get("/api/admin/system/performance", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      const queueStats = getQueueStats();
      const memoryStats = getMemoryStats();
      const monitoringStatus = getMonitoringStatus();

      res.json({
        queues: queueStats,
        memory: {
          current: {
            rssMB: memoryStats.rssMB,
            heapUsedMB: memoryStats.heapUsedMB,
            heapTotalMB: memoryStats.heapTotalMB,
            usagePercent: memoryStats.usagePercent,
            heapUsagePercent: memoryStats.heapUsagePercent
          },
          monitoring: {
            isCleaningUp: monitoringStatus.isCleaningUp,
            lastCleanupAgo: monitoringStatus.lastCleanupAgo ? `${Math.round(monitoringStatus.lastCleanupAgo / 1000)}s ago` : 'Never',
            thresholds: monitoringStatus.thresholds
          }
        },
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error getting system performance:', error);
      res.status(500).json({ error: "Lỗi server khi lấy thông tin hiệu suất" });
    }
  });

  // CMD Cleanup Service API endpoints (admin only)
  app.get("/api/admin/cleanup-service/status", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      const status = getCleanupServiceStatus();
      res.json({
        ...status,
        interval: "30 phút",
        description: "Dịch vụ tự động xóa CMD console"
      });
    } catch (error) {
      console.error('Error getting cleanup service status:', error);
      res.status(500).json({ error: "Lỗi server khi lấy trạng thái cleanup service" });
    }
  });

  app.post("/api/admin/cleanup-service/manual", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      await manualCleanup();
      res.json({ 
        success: true,
        message: "CMD đã được xóa thành công",
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error performing manual cleanup:', error);
      res.status(500).json({ error: "Lỗi khi thực hiện cleanup thủ công" });
    }
  });

  app.post("/api/admin/cleanup-service/restart", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      stopCleanupService();
      startCleanupService();
      
      res.json({ 
        success: true,
        message: "Cleanup service đã được khởi động lại",
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error restarting cleanup service:', error);
      res.status(500).json({ error: "Lỗi khi khởi động lại cleanup service" });
    }
  });

  // Force Windows cleanup endpoint
  app.post("/api/admin/cleanup-service/force-windows", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      console.log('[API] Force Windows cleanup requested by admin');
      const result = await forceWindowsCleanup();
      
      res.json({ 
        success: result.success,
        method: result.method,
        error: result.error,
        message: result.success ? 
          `Windows CMD đã được xóa thành công bằng phương pháp: ${result.method}` : 
          `Cleanup thất bại: ${result.error}`,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error performing force Windows cleanup:', error);
      res.status(500).json({ error: "Lỗi khi thực hiện force Windows cleanup" });
    }
  });

  // Test cleanup methods endpoint
  app.get("/api/admin/cleanup-service/test-methods", authenticateToken, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
      }

      console.log('[API] Testing all cleanup methods requested by admin');
      const results = await testAllCleanupMethods();
      
      res.json({ 
        success: true,
        platform: results.platform,
        results: results.results,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error testing cleanup methods:', error);
      res.status(500).json({ error: "Lỗi khi test cleanup methods" });
    }
  });

  // Database Cleanup Management API endpoints
  app.get("/api/database-cleanup/status", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      const status = getDatabaseCleanupServiceStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting database cleanup status:', error);
      res.status(500).json({ error: "Lỗi server khi lấy trạng thái dọn dẹp database" });
    }
  });

  app.post("/api/database-cleanup/manual", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      await manualDatabaseCleanup();
      res.json({ success: true, message: "Dọn dẹp database thủ công hoàn thành" });
    } catch (error) {
      console.error('Error performing manual database cleanup:', error);
      res.status(500).json({ error: "Lỗi server khi thực hiện dọn dẹp database" });
    }
  });

  // Database Integrity Check API endpoint
  app.get("/api/admin/database/integrity-check", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('🔍 Starting comprehensive database integrity check...');
      
      const results: any = {
        timestamp: new Date().toISOString(),
        summary: {
          totalChecks: 0,
          issues: 0,
          status: 'healthy'
        },
        checks: []
      };

      // 1. Check foreign key constraints
      console.log('Checking foreign key constraints...');
      try {
        const fkQuery = `
          SELECT 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            tc.constraint_name
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
          ORDER BY tc.table_name;
        `;
        
        const fkResult = await db.execute(sql.raw(fkQuery));
        results.checks.push({
          name: 'Foreign Key Constraints',
          status: 'pass',
          count: fkResult.rowCount || (fkResult as any).rows?.length || 0,
          message: `Found ${fkResult.rowCount || (fkResult as any).rows?.length || 0} foreign key constraints`
        });
        results.summary.totalChecks++;
      } catch (error) {
        results.checks.push({
          name: 'Foreign Key Constraints',
          status: 'error',
          message: `Error checking FK constraints: ${error}`
        });
        results.summary.issues++;
      }

      // 2. Check for orphaned records
      console.log('Checking for orphaned records...');
      const orphanChecks = [
        { table: 'transactions', column: 'user_id', foreignTable: 'users', foreignColumn: 'id' },
        { table: 'shopee_cookies', column: 'user_id', foreignTable: 'users', foreignColumn: 'id' },
        { table: 'phone_rental_history', column: 'user_id', foreignTable: 'users', foreignColumn: 'id' },
        { table: 'tiktok_rentals', column: 'user_id', foreignTable: 'users', foreignColumn: 'id' },
        { table: 'voucher_saving_operations', column: 'user_id', foreignTable: 'users', foreignColumn: 'id' },
        { table: 'voucher_save_results', column: 'operation_id', foreignTable: 'voucher_saving_operations', foreignColumn: 'id' }
      ];
      
      let totalOrphans = 0;
      for (const check of orphanChecks) {
        try {
          const orphanQuery = `
            SELECT COUNT(*) as orphan_count
            FROM ${check.table} t
            WHERE t.${check.column} IS NOT NULL 
            AND NOT EXISTS (
              SELECT 1 FROM ${check.foreignTable} f 
              WHERE f.${check.foreignColumn} = t.${check.column}
            );
          `;
          
          const orphanResult = await db.execute(sql.raw(orphanQuery));
          const orphanCount = parseInt((orphanResult as any).rows?.[0]?.orphan_count || (orphanResult as any)[0]?.orphan_count || '0');
          totalOrphans += orphanCount;
          
          results.checks.push({
            name: `Orphaned Records: ${check.table}.${check.column}`,
            status: orphanCount > 0 ? 'warning' : 'pass',
            count: orphanCount,
            message: orphanCount > 0 ? `${orphanCount} orphaned records found` : 'No orphaned records'
          });
        } catch (error) {
          results.checks.push({
            name: `Orphaned Records: ${check.table}.${check.column}`,
            status: 'error',
            message: `Check failed: ${error}`
          });
          results.summary.issues++;
        }
      }
      results.summary.totalChecks += orphanChecks.length;
      if (totalOrphans > 0) results.summary.issues++;

      // 3. Check table statistics
      console.log('Checking table statistics...');
      try {
        const statsQuery = `
          SELECT COUNT(*) as table_count
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `;
        
        const statsResult = await db.execute(sql.raw(statsQuery));
        console.log('Table stats raw result:', JSON.stringify(statsResult, null, 2));
        const tableCount = parseInt(statsResult.rows?.[0]?.table_count || (statsResult as any)[0]?.table_count || '0');
        
        if (tableCount === 0) {
          results.checks.push({
            name: 'Table Statistics',
            status: 'error',
            message: 'No tables found in public schema - this indicates a serious database issue'
          });
          results.summary.issues++;
        } else {
          results.checks.push({
            name: 'Table Statistics',
            status: 'info',
            count: tableCount,
            message: `Found ${tableCount} tables in public schema`
          });
        }
        
        results.summary.totalChecks++;
      } catch (error) {
        results.checks.push({
          name: 'Table Statistics',
          status: 'error',
          message: `Error checking table stats: ${error}`
        });
        results.summary.issues++;
      }

      // Final status determination
      if (results.summary.issues === 0) {
        results.summary.status = 'healthy';
      } else if (results.summary.issues <= 3) {
        results.summary.status = 'warning';
      } else {
        results.summary.status = 'critical';
      }
      
      console.log(`🎯 Database integrity check completed: ${results.summary.issues} issues found`);
      res.json(results);
    } catch (error) {
      console.error('Error performing database integrity check:', error);
      res.status(500).json({ message: 'Lỗi khi kiểm tra database integrity' });
    }
  });

  // Helper function: Retry with exponential backoff
  async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          console.log(`[RETRY] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  // Username check endpoints
  app.post("/api/username-checks/bulk", authenticateTokenOrApiKey, checkApiKeyPermission('username_check'), async (req: any, res: any) => {
    try {
      const { usernames } = req.body;
      const userId = req.user?.id;
      const userIp = req.ip || req.connection.remoteAddress || 'unknown';

      if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
        return res.status(400).json({ error: "Danh sách username không hợp lệ" });
      }

      if (usernames.length > 20) {
        return res.status(400).json({ error: "Tối đa 20 username mỗi lần kiểm tra" });
      }

      // Free service - no cost validation needed
      console.log(`Username check request from user ${userId}: ${usernames.length} usernames`);

      const results = await storage.checkShopeeUsernames(usernames, userId, userIp);

      res.json({
        success: true,
        results,
        totalChecked: results.length,
        activeCount: results.filter(r => r.isAvailable).length,
        bannedCount: results.filter(r => r.status === 2).length,
        errorCount: results.filter(r => r.status === null).length
      });

    } catch (error) {
      console.error('Error in bulk username check:', error);
      res.status(500).json({ 
        error: "Lỗi server khi kiểm tra username",
        details: (error as Error).message || 'Unknown error' 
      });
    }
  });

  app.get("/api/username-checks/history", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      let checks;
      if (userRole === 'admin' || userRole === 'superadmin') {
        checks = await storage.getAllUsernameChecks();
      } else {
        checks = await storage.getUsernameChecksByUser(userId);
      }

      res.json(checks);
    } catch (error) {
      console.error('Error fetching username check history:', error);
      res.status(500).json({ error: "Lỗi server khi lấy lịch sử kiểm tra username" });
    }
  });

  // Phone number LIVE check endpoint (check_unbind_phone API)
  app.post("/api/phone-live-checks/bulk", authenticateTokenOrApiKey, checkApiKeyPermission('phone_live_check'), async (req: any, res: any) => {
    try {
      const { phoneNumbers } = req.body;
      const userId = req.user?.id;
      const userIp = req.ip || req.connection.remoteAddress || 'unknown';

      if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        return res.status(400).json({ error: "Danh sách số điện thoại không hợp lệ" });
      }

      if (phoneNumbers.length > 20) {
        return res.status(400).json({ error: "Tối đa 20 số điện thoại mỗi lần kiểm tra" });
      }

      // Get cookie from system_config (same as username check)
      const spcStConfig = await storage.getSystemConfig('SPC_ST_check');
      if (!spcStConfig?.configValue) {
        return res.status(500).json({ error: "Chưa cấu hình SPC_ST_check cho kiểm tra số điện thoại" });
      }

      // Function to normalize phone number to 84+9 digits format
      const normalizePhoneNumber = (phone: string): string => {
        // Remove all spaces and special characters
        const cleanPhone = phone.replace(/[^\d]/g, '');
        
        if (cleanPhone.length === 9) {
          // 9 digits -> add 84
          return `84${cleanPhone}`;
        } else if (cleanPhone.length === 10 && cleanPhone.startsWith('0')) {
          // 0+9 digits -> replace 0 with 84
          return `84${cleanPhone.substring(1)}`;
        } else if (cleanPhone.length === 11 && cleanPhone.startsWith('84')) {
          // 84+9 digits -> keep as is
          return cleanPhone;
        } else {
          // Invalid format, return as is for error handling
          return cleanPhone;
        }
      };

      const results = [];
      let checkedCount = 0;
      let liveCount = 0;
      let blockedCount = 0;
      let errorCount = 0;

      for (const phone of phoneNumbers) {
        try {
          const normalizedPhone = normalizePhoneNumber(phone.trim());
          
          if (normalizedPhone.length !== 11 || !normalizedPhone.startsWith('84')) {
            results.push({
              phone: phone.trim(),
              normalizedPhone,
              status: 'error',
              statusMessage: 'Định dạng số điện thoại không hợp lệ',
              errorCode: null
            });
            errorCount++;
            continue;
          }

          // Make API call to Shopee WITH RETRY (3 attempts with exponential backoff)
          const { response, responseText } = await retryWithBackoff(async () => {
            const res = await fetch('https://mall.shopee.vn/api/v4/account/management/check_unbind_phone', {
              method: 'POST',
              headers: {
                'Host': 'mall.shopee.vn',
                'Cookie': `SPC_ST=${spcStConfig.configValue}`,
                'User-Agent': 'Android app Shopee appver=28320 app_type=1',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                phone: normalizedPhone,
                device_sz_fingerprint: "On1l+HEh5WP1R432v1wJYQ==|+X8mQLzsfazeQO/HkWUkowXyKnzYCRrpDzrY9GDBJoshtkFLBc13gkZd1ONKyVBr3iyWo6QAY7epgE01ofqPjg==|3ScuPqJgABhbu9m4|08|2"
              })
            });
            
            if (!res.ok && res.status >= 500) {
              throw new Error(`Server error: ${res.status}`);
            }
            
            const text = await res.text();
            return { response: res, responseText: text };
          }, 3, 1000);
          
          let responseData: any;
          try {
            responseData = JSON.parse(responseText);
          } catch (parseError) {
            throw new Error(`Invalid JSON response: ${responseText}`);
          }
          
          let status = 'error';
          let statusMessage = 'Lỗi không xác định';
          let errorCode = null;

          if (responseData.error) {
            errorCode = responseData.error;
            
            if (responseData.error === 12301116) {
              status = 'blocked';
              statusMessage = 'Số điện thoại đã bị khóa';
              blockedCount++;
            } else if (responseData.error === 10013 || responseData.error === 0) {
              status = 'live';
              statusMessage = 'Số điện thoại live (khả dụng)';
              liveCount++;
            } else {
              status = 'error';
              statusMessage = `Mã lỗi: ${responseData.error} - Vui lòng liên hệ admin để biết thêm chi tiết`;
              errorCount++;
            }
          } else {
            // If no error field, consider it live
            status = 'live';
            statusMessage = 'Số điện thoại live (khả dụng)';
            liveCount++;
          }

          results.push({
            phone: phone.trim(),
            normalizedPhone,
            status,
            statusMessage,
            errorCode
          });

          checkedCount++;

        } catch (error) {
          console.error(`Error checking phone ${phone}:`, error);
          results.push({
            phone: phone.trim(),
            normalizedPhone: normalizePhoneNumber(phone.trim()),
            status: 'error',
            statusMessage: 'Lỗi kết nối API',
            errorCode: null
          });
          errorCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      res.json({
        success: true,
        results,
        totalChecked: checkedCount,
        liveCount,
        blockedCount,
        errorCount
      });

    } catch (error) {
      console.error('Bulk phone check error:', error);
      res.status(500).json({ error: "Lỗi server khi kiểm tra số điện thoại" });
    }
  });

  // AUTO-REFUND SCHEDULER MANAGEMENT - ADMIN ONLY
  app.get("/api/admin/auto-refund-status", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      const status = getAutoRefundSchedulerStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting auto-refund status:', error);
      res.status(500).json({ error: "Lỗi server khi lấy trạng thái auto-refund" });
    }
  });

  app.post("/api/admin/auto-refund-manual-check", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      const result = await runManualRefundCheck();
      res.json({
        success: true,
        message: `Đã kiểm tra và xử lý ${result.phoneRentals + result.tiktokRentals} session hết hạn`,
        phoneRentals: result.phoneRentals,
        tiktokRentals: result.tiktokRentals
      });
    } catch (error) {
      console.error('Error running manual refund check:', error);
      res.status(500).json({ error: "Lỗi server khi chạy manual refund check" });
    }
  });

  // REFUND AUDIT & RECOVERY SERVICE - ADMIN ONLY
  app.get("/api/admin/refund-audit", async (req: any, res: any) => {
    try {
      // Temporarily disabled auth for testing
      // if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      //   return res.status(403).json({ error: "Không có quyền truy cập" });
      // }

      const auditResult = await auditRefundSystem();
      res.json({
        success: true,
        data: auditResult,
        message: `Tìm thấy ${auditResult.summary.duplicateCount} hoàn tiền duplicate và ${auditResult.summary.overRefundCount} hoàn tiền thừa`
      });
    } catch (error) {
      console.error('Error running refund audit:', error);
      res.status(500).json({ error: "Lỗi server khi kiểm tra refund" });
    }
  });

  app.post("/api/admin/refund-recovery", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      // First run audit to get current data
      const auditResult = await auditRefundSystem();
      
      if (auditResult.summary.totalRecoveryAmount === 0) {
        return res.json({
          success: true,
          message: "Không có tiền hoàn sai cần thu hồi",
          recoveredAmount: 0,
          affectedUsers: 0
        });
      }

      // Perform recovery
      const recoveryResult = await recoverIncorrectRefunds(auditResult);
      
      res.json({
        success: recoveryResult.success,
        message: `Thu hồi thành công ${recoveryResult.recoveredAmount.toLocaleString()} VND từ ${recoveryResult.affectedUsers} user`,
        recoveredAmount: recoveryResult.recoveredAmount,
        affectedUsers: recoveryResult.affectedUsers,
        details: {
          duplicateRefunds: auditResult.duplicateRefunds.length,
          overRefunds: auditResult.overRefunds.length
        }
      });
    } catch (error) {
      console.error('Error running refund recovery:', error);
      res.status(500).json({ error: "Lỗi server khi thu hồi tiền hoàn sai" });
    }
  });

  app.get("/api/admin/refund-validation", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      const validationResult = await validateRefundMechanism();
      res.json({
        success: true,
        data: validationResult,
        message: validationResult.isAccurate ? 
          "Cơ chế hoàn tiền 100% chính xác" : 
          `Phát hiện ${validationResult.issues.length} vấn đề cần khắc phục`
      });
    } catch (error) {
      console.error('Error validating refund mechanism:', error);
      res.status(500).json({ error: "Lỗi server khi kiểm tra cơ chế hoàn tiền" });
    }
  });

  // TEMPORARY TEST ENDPOINT FOR REFUND AUDIT (NO AUTH)
  app.get("/api/test/refund-audit", async (req: any, res: any) => {
    try {
      console.log('🔍 [TEST] Starting refund audit...');
      const auditResult = await auditRefundSystem();
      res.json({
        success: true,
        data: auditResult,
        message: `Tìm thấy ${auditResult.summary.duplicateCount} hoàn tiền duplicate và ${auditResult.summary.overRefundCount} hoàn tiền thừa`
      });
    } catch (error) {
      console.error('Error running refund audit:', error);
      res.status(500).json({ 
        error: "Lỗi server khi kiểm tra refund",
        details: (error as Error).message || 'Unknown error' 
      });
    }
  });

  app.post("/api/test/refund-recovery", async (req: any, res: any) => {
    try {
      console.log('🔧 [TEST] Starting refund recovery...');
      // First run audit to get current data
      const auditResult = await auditRefundSystem();
      
      if (auditResult.summary.totalRecoveryAmount === 0) {
        return res.json({
          success: true,
          message: "Không có tiền hoàn sai cần thu hồi",
          recoveredAmount: 0,
          affectedUsers: 0
        });
      }

      // Perform recovery
      const recoveryResult = await recoverIncorrectRefunds(auditResult);
      
      res.json({
        success: recoveryResult.success,
        message: `Thu hồi thành công ${recoveryResult.recoveredAmount.toLocaleString()} VND từ ${recoveryResult.affectedUsers} user`,
        recoveredAmount: recoveryResult.recoveredAmount,
        affectedUsers: recoveryResult.affectedUsers,
        details: {
          duplicateRefunds: auditResult.duplicateRefunds.length,
          overRefunds: auditResult.overRefunds.length
        }
      });
    } catch (error) {
      console.error('Error running refund recovery:', error);
      res.status(500).json({ 
        error: "Lỗi server khi thu hồi tiền hoàn sai",
        details: (error as Error).message || 'Unknown error' 
      });
    }
  });

  app.get("/api/test/refund-validation", async (req: any, res: any) => {
    try {
      console.log('✅ [TEST] Starting refund validation...');
      const validationResult = await validateRefundMechanism();
      res.json({
        success: true,
        data: validationResult,
        message: validationResult.isAccurate ? 
          "Cơ chế hoàn tiền 100% chính xác" : 
          `Phát hiện ${validationResult.issues.length} vấn đề cần khắc phục`
      });
    } catch (error) {
      console.error('Error validating refund mechanism:', error);
      res.status(500).json({ 
        error: "Lỗi server khi kiểm tra cơ chế hoàn tiền",
        details: (error as Error).message || 'Unknown error' 
      });
    }
  });

  app.post("/api/test/recover-today-refunds-for-old-sessions", async (req: any, res: any) => {
    try {
      console.log('🔧 [TODAY REFUNDS] Thu hồi hoàn tiền hôm nay cho sessions đã kết thúc trước đây...');
      
      // Get today's date range
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      
      console.log('📅 Thu hồi hoàn tiền từ:', startOfToday.toLocaleString('vi-VN'), 'đến', endOfToday.toLocaleString('vi-VN'));
      
      // Get all refund transactions from today with complete pagination
      let allTransactions: any[] = [];
      let offset = 0;
      const batchSize = 500;
      
      while (true) {
        const batch = await storage.getTransactionsWithFilter({ 
          limit: batchSize, 
          offset: offset, 
          types: ['refund'],
          dateFrom: startOfToday 
        });
        
        if (batch.length === 0) break;
        allTransactions = allTransactions.concat(batch);
        
        if (batch.length < batchSize) break; // Last batch
        offset += batchSize;
      }
      const todayRefunds = allTransactions.filter(tx => 
        tx.type === 'refund' && 
        parseFloat(tx.amount) > 0 &&
        new Date(tx.createdAt) >= startOfToday &&
        new Date(tx.createdAt) <= endOfToday
      );
      
      console.log(`💰 Found ${todayRefunds.length} refund transactions today`);
      
      if (todayRefunds.length === 0) {
        return res.json({
          success: true,
          message: "Không có khoản hoàn tiền nào hôm nay",
          recoveredAmount: 0,
          affectedUsers: 0,
          recoveredTransactions: 0
        });
      }
      
      // Get all phone rental sessions  
      const allSessions = await storage.getPhoneRentalsWithPagination(1, 10000, {});
      
      let totalRecovered = 0;
      const affectedUserIds = new Set();
      let recoveredCount = 0;
      const recoveryDetails = [];
      const sessionsProcessed = new Set();
      
      // Process each refund transaction from today
      for (const refund of todayRefunds) {
        try {
          // Find the session this refund belongs to
          let matchedSession = null;
          
          // Try to find session by reference or description
          if (refund.reference) {
            for (const session of allSessions) {
              const sessionId = (session as any).sessionId || session.id;
              if (refund.reference.includes(sessionId) || 
                  refund.description?.includes(sessionId)) {
                matchedSession = session;
                break;
              }
            }
          }
          
          // If no session found by reference, try by user and timing
          if (!matchedSession && refund.description) {
            for (const session of allSessions) {
              const sessionId = (session as any).sessionId || session.id;
              if (session.userId === refund.userId && 
                  refund.description.includes(sessionId)) {
                matchedSession = session;
                break;
              }
            }
          }
          
          if (!matchedSession) {
            console.log(`⚠️  Không tìm thấy session cho refund TX #${refund.id}`);
            continue;
          }
          
          // Check if session ended before today
          const sessionId = (matchedSession as any).sessionId || matchedSession.id;
          const sessionEndDate = new Date(matchedSession.expiresAt || matchedSession.createdAt);
          if (sessionEndDate >= startOfToday) {
            console.log(`✅ Session ${sessionId} kết thúc hôm nay, bỏ qua`);
            continue;
          }
          
          // Avoid processing same session multiple times
          if (sessionsProcessed.has(sessionId)) {
            console.log(`🔄 Session ${sessionId} đã được xử lý, bỏ qua duplicate`);
            continue;
          }
          
          sessionsProcessed.add(sessionId);
          
          const recoveryAmount = -Math.abs(refund.amount); // Negative to recover money
          
          // Create recovery transaction
          const recoveryTransaction = await storage.createTransaction({
            userId: refund.userId,
            type: 'old_session_refund_recovery',
            amount: recoveryAmount.toString(),
            description: `Thu hồi hoàn tiền hôm nay cho session cũ ${sessionId} (kết thúc ${sessionEndDate.toLocaleDateString('vi-VN')}) - TX #${refund.id}`,
            reference: `old_session_recovery_${Date.now()}_${sessionId}_${refund.id}`
          });
          
          // Update user balance
          await storage.updateUserBalance(refund.userId, recoveryAmount);
          
          // Add audit log
          await storage.createAuditLog({
            userId: refund.userId,
            action: 'old_session_refund_recovery',
            description: `Thu hồi ${Math.abs(refund.amount)} VND hoàn tiền hôm nay cho session cũ ${sessionId} (${(matchedSession as any).service || 'unknown'}, kết thúc ${sessionEndDate.toLocaleDateString('vi-VN')}) - TX #${refund.id}`,
            ipAddress: 'system'
          });
          
          totalRecovered += Math.abs(refund.amount);
          affectedUserIds.add(refund.userId);
          recoveredCount++;
          
          recoveryDetails.push({
            userId: refund.userId,
            sessionId: matchedSession.sessionId,
            service: matchedSession.service,
            phoneNumber: matchedSession.phoneNumber,
            amount: refund.amount,
            sessionEndDate: sessionEndDate.toLocaleDateString('vi-VN'),
            refundDate: new Date(refund.createdAt).toLocaleDateString('vi-VN'),
            transactionId: refund.id
          });
          
          console.log(`✅ Thu hồi ${Math.abs(refund.amount)} VND từ user ${refund.userId} cho session cũ ${matchedSession.sessionId} (kết thúc ${sessionEndDate.toLocaleDateString('vi-VN')})`);
          
        } catch (error) {
          console.error(`❌ Lỗi thu hồi TX #${refund.id}:`, error);
        }
      }
      
      res.json({
        success: true,
        message: `Thu hồi thành công ${totalRecovered.toLocaleString()} VND từ ${affectedUserIds.size} user (${recoveredCount} sessions cũ được hoàn tiền hôm nay)`,
        recoveredAmount: totalRecovered,
        affectedUsers: affectedUserIds.size,
        recoveredTransactions: recoveredCount,
        todayRefundsFound: todayRefunds.length,
        oldSessionsRecovered: sessionsProcessed.size,
        details: recoveryDetails.slice(0, 10) // First 10 for preview
      });
      
    } catch (error) {
      console.error('Error during today refunds recovery:', error);
      res.status(500).json({ 
        error: "Lỗi server khi thu hồi hoàn tiền hôm nay",
        details: (error as Error).message || 'Unknown error' 
      });
    }
  });

  app.post("/api/test/expired-session-refund-recovery", async (req: any, res: any) => {
    try {
      const { fromTime } = req.body;
      console.log('🔧 [EXPIRED SESSION RECOVERY] Thu hồi hoàn tiền cho sessions hết hạn từ:', fromTime);
      
      // Default to 8:45 AM today if no time specified
      const today = new Date();
      const defaultTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 45, 0);
      const recoveryFromTime = fromTime ? new Date(fromTime) : defaultTime;
      
      console.log('📅 Thu hồi từ thời điểm:', recoveryFromTime.toLocaleString('vi-VN'));
      
      // Get all phone rental sessions that expired after the specified time
      const expiredSessions = await storage.getExpiredPhoneRentalSessions();
      const targetExpiredSessions = expiredSessions.filter(session => 
        new Date(session.expiresAt) >= recoveryFromTime
      );
      
      console.log(`🔍 Found ${targetExpiredSessions.length} expired sessions since ${recoveryFromTime.toLocaleString('vi-VN')}`);
      
      // Get all transactions to find refunds for these sessions
      const allTransactions = await storage.getTransactionsWithFilter({ 
        limit: 1000, 
        offset: 0,
        types: ['refund']
      });
      const refundsToRecover = [];
      
      for (const session of targetExpiredSessions) {
        // Find refund transactions for this session
        const sessionRefunds = allTransactions.filter(tx => 
          tx.type === 'refund' && 
          tx.userId === session.userId &&
          (tx.reference?.includes(session.sessionId) || 
           tx.description?.includes(session.sessionId)) &&
          tx.amount > 0
        );
        
        refundsToRecover.push(...sessionRefunds.map(refund => ({
          ...refund,
          sessionId: session.sessionId,
          service: session.service,
          phoneNumber: session.phoneNumber,
          expiresAt: session.expiresAt
        })));
      }
      
      console.log(`💰 Found ${refundsToRecover.length} refund transactions to recover`);
      
      if (refundsToRecover.length === 0) {
        return res.json({
          success: true,
          message: "Không có khoản hoàn tiền nào cho sessions hết hạn sau thời điểm chỉ định",
          recoveredAmount: 0,
          affectedUsers: 0,
          recoveredTransactions: 0,
          expiredSessions: targetExpiredSessions.length
        });
      }
      
      let totalRecovered = 0;
      const affectedUserIds = new Set();
      let recoveredCount = 0;
      const recoveryDetails = [];
      
      // Process each refund transaction
      for (const refund of refundsToRecover) {
        try {
          const recoveryAmount = -Math.abs(refund.amount); // Negative to recover money
          
          // Create recovery transaction
          const recoveryTransaction = await storage.createTransaction({
            userId: refund.userId,
            type: 'expired_session_recovery',
            amount: recoveryAmount,
            description: `Thu hồi hoàn tiền session hết hạn ${refund.sessionId} (${refund.service}) - TX #${refund.id}`,
            reference: `expired_recovery_${Date.now()}_${refund.sessionId}_${refund.id}`
          });
          
          // Update user balance
          await storage.updateUserBalance(refund.userId, recoveryAmount);
          
          // Add audit log
          await storage.createAuditLog({
            userId: refund.userId,
            action: 'expired_session_recovery',
            description: `Thu hồi ${Math.abs(refund.amount)} VND từ session hết hạn ${refund.sessionId} (${refund.service}, số ${refund.phoneNumber}) - TX #${refund.id}`,
            ipAddress: 'system'
          });
          
          totalRecovered += Math.abs(refund.amount);
          affectedUserIds.add(refund.userId);
          recoveredCount++;
          
          recoveryDetails.push({
            userId: refund.userId,
            sessionId: refund.sessionId,
            service: refund.service,
            phoneNumber: refund.phoneNumber,
            amount: refund.amount,
            expiredAt: refund.expiresAt,
            transactionId: refund.id
          });
          
          console.log(`✅ Thu hồi ${Math.abs(refund.amount)} VND từ user ${refund.userId} session ${refund.sessionId} (${refund.service})`);
          
        } catch (error) {
          console.error(`❌ Lỗi thu hồi TX #${refund.id} session ${refund.sessionId}:`, error);
        }
      }
      
      res.json({
        success: true,
        message: `Thu hồi thành công ${totalRecovered.toLocaleString()} VND từ ${affectedUserIds.size} user (${recoveredCount} sessions hết hạn)`,
        recoveredAmount: totalRecovered,
        affectedUsers: affectedUserIds.size,
        recoveredTransactions: recoveredCount,
        expiredSessionsFound: targetExpiredSessions.length,
        fromTime: recoveryFromTime.toLocaleString('vi-VN'),
        details: recoveryDetails.slice(0, 10) // First 10 for preview
      });
      
    } catch (error) {
      console.error('Error during expired session refund recovery:', error);
      res.status(500).json({ 
        error: "Lỗi server khi thu hồi hoàn tiền sessions hết hạn",
        details: (error as Error).message || 'Unknown error' 
      });
    }
  });

  // CMD CLEANUP SERVICE - ADMIN ONLY
  app.get("/api/cmd-cleanup/status", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      const status = getCleanupServiceStatus();
      const config = getCleanupConfig();
      res.json({ ...status, ...config });
    } catch (error) {
      console.error('Error getting CMD cleanup status:', error);
      res.status(500).json({ error: "Lỗi server khi lấy trạng thái CMD cleanup" });
    }
  });

  app.post("/api/cmd-cleanup/manual", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      await manualCleanup();
      res.json({
        success: true,
        message: "CMD cleanup đã được thực hiện thủ công",
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error running manual CMD cleanup:', error);
      res.status(500).json({ error: "Lỗi server khi chạy manual CMD cleanup" });
    }
  });

  app.get("/api/cmd-cleanup/test-methods", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
        return res.status(403).json({ error: "Không có quyền truy cập" });
      }

      const results = await testAllCleanupMethods();
      res.json({
        success: true,
        message: "Đã test tất cả phương pháp CMD cleanup",
        ...results,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('Error testing CMD cleanup methods:', error);
      res.status(500).json({ error: "Lỗi server khi test CMD cleanup methods" });
    }
  });

  // ========================================================================
  // REFUND DUPLICATE PROTECTION AUDIT ROUTES (Super Admin only)
  // ========================================================================

  // Comprehensive audit of duplicate protection across all services
  app.get("/api/admin/refund-duplicate-audit", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      console.log('[DUPLICATE AUDIT] Starting comprehensive duplicate protection audit...');
      
      const auditResult = await auditSystemDuplicateProtection();
      
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'DUPLICATE_AUDIT',
        description: `Thực hiện kiểm tra toàn diện cơ chế chống trùng lặp hoàn tiền`,
        ipAddress: req.ip || 'unknown'
      });

      res.json({
        success: true,
        message: "Hoàn tất kiểm tra cơ chế chống trùng lặp",
        audit: auditResult,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('[DUPLICATE AUDIT] Error:', error);
      res.status(500).json({ 
        success: false,
        message: "Lỗi server khi kiểm tra cơ chế chống trùng lặp",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Test duplicate protection mechanisms with a specific session
  app.post("/api/admin/test-duplicate-protection", authenticateToken, requireSuperadmin, async (req: any, res) => {
    try {
      const { userId, sessionId } = req.body;
      
      if (!userId || !sessionId) {
        return res.status(400).json({ 
          success: false,
          message: "userId và sessionId là bắt buộc" 
        });
      }
      
      console.log(`[DUPLICATE TEST] Testing protection for user ${userId}, session ${sessionId}`);
      
      const testResult = await testDuplicateProtection(userId, sessionId);
      
      await storage.createAuditLog({
        userId: req.user.id,
        action: 'DUPLICATE_TEST',
        description: `Test cơ chế chống trùng lặp cho session ${sessionId}, user ${userId}`,
        ipAddress: req.ip || 'unknown'
      });

      res.json({
        success: true,
        message: "Hoàn tất test cơ chế chống trùng lặp",
        test: testResult,
        timestamp: new Date().toLocaleString('vi-VN')
      });
    } catch (error) {
      console.error('[DUPLICATE TEST] Error:', error);
      res.status(500).json({ 
        success: false,
        message: "Lỗi server khi test cơ chế chống trùng lặp",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Quick status check of duplicate protection health
  app.get("/api/admin/refund-protection-status", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[PROTECTION STATUS] Checking refund protection mechanisms...');
      
      const allTransactions = await storage.getTransactionsWithFilter({ 
        limit: 1000, 
        offset: 0,
        types: ['refund']
      });
      const refundTransactions = allTransactions.filter(t => t.type === 'refund');
      
      // Count refunds by service
      const refundsByService = {
        otissim_v1: refundTransactions.filter(t => t.reference?.includes('otissim_v1_refund_')).length,
        otissim_v2: refundTransactions.filter(t => t.reference?.includes('otissim_v2_refund_')).length,
        otissim_v3: refundTransactions.filter(t => t.reference?.includes('otissim_v3_refund_')).length,
        tiktok_v1: refundTransactions.filter(t => t.reference?.includes('tiktok_refund_')).length
      };
      
      // Check for any potential duplicates (quick scan)
      const refundReferences = refundTransactions.map(t => t.reference).filter(Boolean);
      const uniqueReferences = new Set(refundReferences);
      const hasDuplicates = refundReferences.length !== uniqueReferences.size;
      
      const protectionStatus = {
        totalRefunds: refundTransactions.length,
        refundsByService,
        potentialDuplicates: hasDuplicates ? refundReferences.length - uniqueReferences.size : 0,
        protectionMechanisms: {
          referenceBasedProtection: true,
          schemaBasedProtection: true,
          legacyCutoffProtection: true,
          autoSchedulerActive: true
        },
        lastCheck: new Date().toLocaleString('vi-VN')
      };

      res.json({
        success: true,
        message: "Trạng thái cơ chế bảo vệ chống trùng lặp",
        status: protectionStatus
      });
    } catch (error) {
      console.error('[PROTECTION STATUS] Error:', error);
      res.status(500).json({ 
        success: false,
        message: "Lỗi server khi kiểm tra trạng thái bảo vệ",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Database pricing cleanup endpoint (Admin only)
  app.post("/api/admin/pricing-cleanup", authenticateToken, requireAdmin, async (req: any, res) => {
    try {
      console.log('[PRICING CLEANUP] Starting database pricing cleanup...');
      console.log(`[PRICING CLEANUP] Initiated by user ID: ${req.user.id} (${req.user.username})`);
      
      const summary = await runPricingCleanup();
      
      // Log the cleanup action
      await storage.logUserAction(
        req.user.id,
        'pricing_cleanup',
        `Thực hiện cleanup pricing database - Fixed ${summary.fixes_applied.length} issues`,
        getUserIP(req)
      );
      
      res.json({
        success: true,
        message: "Database pricing cleanup completed successfully",
        summary: summary
      });
    } catch (error) {
      console.error('[PRICING CLEANUP] Error:', error);
      res.status(500).json({ 
        success: false,
        message: "Lỗi server khi cleanup pricing database",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // System statistics endpoint
  app.get('/api/system-stats', async (req, res) => {
    try {
      const autoRefundModule = await import('./auto-refund-scheduler');
      const { getCleanupConfig } = await import('./cleanup-service');
      
      // Get memory usage
      const memoryUsage = process.memoryUsage();
      
      // Database pool info (if available)
      let databaseInfo = { status: 'unknown', activeConnections: 0, totalConnections: 0 };
      try {
        // Basic database connectivity test
        await storage.getUserById(1);
        databaseInfo = {
          status: 'connected',
          activeConnections: 10, // Estimate since we can't get exact count from Drizzle
          totalConnections: 20
        };
      } catch (error) {
        databaseInfo.status = 'error';
      }
      
      // Get auto-refund scheduler status
      const autoRefundStatus = autoRefundModule.getAutoRefundSchedulerStatus();
      
      // Get cleanup service status
      const cleanupStatus = getCleanupConfig();
      
      const stats = {
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024) // MB
        },
        database: databaseInfo,
        services: {
          autoRefund: {
            running: autoRefundStatus.isRunning,
            lastCheck: autoRefundStatus.lastCheck,
            nextCheck: autoRefundStatus.nextCheck,
            totalChecks: autoRefundStatus.totalChecks,
            cacheSize: autoRefundStatus.processedCache?.size || 0
          },
          cleanup: {
            enabled: cleanupStatus.enabled,
            running: cleanupStatus.running,
            intervalMinutes: cleanupStatus.intervalMinutes,
            platform: cleanupStatus.platform
          }
        },
        platform: {
          node: process.version,
          platform: process.platform,
          arch: process.arch
        }
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error getting system stats:', error);
      res.status(500).json({ 
        error: 'Failed to get system statistics',
        timestamp: new Date().toISOString()
      });
    }
  });

  // API endpoint for cookie rapid check using API key
  app.post("/api/cookie-rapid-api", authenticateApiKey, checkApiKeyPermission('cookie_rapid_check'), async (req: any, res) => {
    
    try {
      const { cookie } = req.body;
      
      // Validate required fields
      if (!cookie) {
        return res.status(400).json({ 
          success: false,
          message: 'Cookie string is required' 
        });
      }

      const cookieValue = cookie;
      const actualCookieId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;


      // Generate idempotency key for this request
      const idempotencyKey = `cookie_rapid_api_${req.user.id}_${actualCookieId}_${Date.now()}`;

      // Step 1: Check if there's a recent successful check within 3 days (atomic phase 1)
      const recentCheckResult = await storage.atomicCookieRapidCheck({
        userId: req.user.id,
        cookieId: actualCookieId,
        cookiePreview: cookieValue.substring(0, 50), // First 50 chars for preview
        userIp: req.ip || null,
        idempotencyKey
      });

      if (!recentCheckResult.success) {
        return res.json({ 
          success: false,
          message: recentCheckResult.message 
        });
      }

      // If we found a recent successful check, return it
      if (recentCheckResult.foundRecentCheck) {
        
        const recentCheck = recentCheckResult.recentCheck!;
        
        // Create activity log for free re-check
        await storage.createActivity({
          description: `[API] ${req.user.fullName} đã thực hiện Cookie hỏa tốc (Miễn phí trong 3 ngày)`,
          type: 'info'
        });

        // 🔒 For history checks, also check if original check had driver phone
        const hasDriverFromHistory = !!recentCheck.driverPhone;
        const historyOrders = hasDriverFromHistory ? (recentCheck.orders || []) : [];
        const historyMessage = hasDriverFromHistory 
          ? 'Sử dụng kết quả kiểm tra trong vòng 3 ngày (miễn phí)' 
          : 'Sử dụng kết quả kiểm tra trong vòng 3 ngày (miễn phí) - Chưa có số shipper';

        // 🔒 Remove orders from recentCheck to avoid override
        const { orders: _, ...recentCheckWithoutOrders } = recentCheck;
        
        return res.json({
          success: true,
          ...recentCheckWithoutOrders,
          message: historyMessage,
          charged: false,
          amount_charged: 0,
          isFromHistory: true,
          orders: historyOrders,
          orderCount: historyOrders.length,
          hasDriver: hasDriverFromHistory
        });
      }

      // Step 2: No recent check found, charge upfront and proceed with new check
      
      // Get service pricing
      const rapidCheckPrice = await storage.requireServicePrice('cookie_rapid_check');
      
      // Step 2a: Charge upfront using atomic charge method
      const chargeResult = await storage.atomicCookieRapidCharge({
        userId: req.user.id,
        cookieId: actualCookieId,
        cookiePreview: cookieValue.substring(0, 50),
        serviceCost: rapidCheckPrice,
        idempotencyKey,
        userIp: req.ip || null,
        userFullName: req.user.fullName || req.user.username || 'API User'
      });

      if (!chargeResult.success) {
        return res.json({
          success: false,
          message: chargeResult.message
        });
      }


      let rapidResult;
      let hasDriverPhone = false;
      let shouldRefund = true; // Default to refund unless proven successful
      
      try {
        // Step 2b: Execute API call with exception handling
        rapidResult = await get_rapid_order_details_with_retry(cookieValue, 3);
        
        // Step 2c: Check if we need to refund (if API failed or no driver found)
        hasDriverPhone = !!rapidResult.driver_phone;
        shouldRefund = !rapidResult.success || !hasDriverPhone;
        
      } catch (apiError) {
        console.error(`[COOKIE RAPID API] API call failed with exception:`, apiError);
        rapidResult = {
          success: false,
          message: `API call failed: ${(apiError as Error).message}`,
          error: (apiError as Error).message,
          orders: []
        };
        shouldRefund = true; // Always refund on exception
      }
      
      if (shouldRefund) {
        // Refund the charge
        const refundReason = !rapidResult.success 
          ? `API call failed: ${rapidResult.message || rapidResult.error}` 
          : 'No driver phone found in order details';
          
        
        const refundResult = await storage.refundFailedCookieRapid({
          userId: req.user.id,
          checkId: chargeResult.checkRecord!.id,
          originalTransactionId: chargeResult.transaction!.id,
          serviceCost: rapidCheckPrice,
          cookieId: actualCookieId,
          reason: refundReason,
          idempotencyKey: `${idempotencyKey}_refund`
        });

        // Create activity log for refund
        await storage.createActivity({
          description: `[API] ${req.user.fullName} - Cookie hỏa tốc thất bại, đã hoàn ${rapidCheckPrice}₫: ${refundReason}`,
          type: 'warning'
        });

        return res.json({
          success: rapidResult.success,
          message: refundResult.success 
            ? `${refundReason} - Đã hoàn ${rapidCheckPrice.toLocaleString('vi-VN')} VND` 
            : rapidResult.message || rapidResult.error,
          charged: false,
          amount_charged: 0,
          refunded: refundResult.success,
          refund_amount: refundResult.success ? rapidCheckPrice : 0,
          hasDriver: hasDriverPhone,
          orders: [],
          orderCount: 0
        });
      }

      // Step 2d: Success case - update check record with results
      await storage.updateCookieRapidCheck(chargeResult.checkRecord!.id, {
        status: true,
        message: `Thành công - Tìm thấy thông tin shipper`,
        orderCount: rapidResult.order_count || 0,
        driverPhone: rapidResult.driver_phone || null,
        driverName: rapidResult.driver_name || null,
        // Store first order details if available
        orderId: rapidResult.orders?.[0]?.order_id || null,
        trackingNumber: rapidResult.orders?.[0]?.tracking_number || null,
        trackingInfo: rapidResult.orders?.[0]?.description || null,
        shippingName: rapidResult.orders?.[0]?.shipping_name || null,
        shippingPhone: rapidResult.orders?.[0]?.shipping_phone || null,
        shippingAddress: rapidResult.orders?.[0]?.shipping_address || null,
        orderName: rapidResult.orders?.[0]?.name || null,
        orderPrice: rapidResult.orders?.[0]?.order_price ? (rapidResult.orders[0].order_price / 100000).toString() : null,
        orderTime: rapidResult.orders?.[0]?.order_time || null,
        metadata: JSON.stringify({
          ...JSON.parse(chargeResult.checkRecord!.metadata || '{}'),
          orders: rapidResult.orders || [],
          charged: true,
          chargedAmount: rapidCheckPrice,
          completedAt: new Date()
        })
      });

      // Create activity log for success
      await storage.createActivity({
        description: `[API] ${req.user.fullName} đã thực hiện Cookie hỏa tốc thành công (Trừ ${rapidCheckPrice}₫)`,
        type: 'info'
      });

      // Return success response with order details
      res.json({
        success: true,
        message: `Thành công - Tìm thấy thông tin shipper`,
        charged: true,
        amount_charged: rapidCheckPrice,
        orders: rapidResult.orders || [],
        orderCount: rapidResult.order_count || 0,
        hasDriver: true,
        driverPhone: rapidResult.driver_phone,
        driverName: rapidResult.driver_name,
        checkId: chargeResult.checkRecord!.id,
        isFromHistory: false
      });

    } catch (error) {
      console.error(`[COOKIE RAPID API] Error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName} - Cookie rapid check error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for EXPRESS TRACKING CHECK (check số shipper) using API key
  app.post("/api/express-tracking-check-api", authenticateApiKey, checkApiKeyPermission('express_tracking_check'), async (req: any, res) => {
    console.log(`[EXPRESS TRACKING CHECK API] Starting express tracking check for user ${req.user.id} via API key`);
    
    try {
      const { cookie } = req.body;
      
      // Validate required fields
      if (!cookie) {
        return res.status(400).json({ 
          success: false,
          message: 'Cookie string is required' 
        });
      }

      const cookieValue = cookie;
      const userIp = req.ip || null;
      const sessionId = `express_check_api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get service price
      const rapidCheckPrice = await storage.requireServicePrice('cookie_rapid_check');
      
      // Check user balance
      const userBalance = await storage.getUserBalance(req.user.id);
      if (userBalance < rapidCheckPrice) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Required: ${rapidCheckPrice.toLocaleString('vi-VN')} VND, Available: ${userBalance.toLocaleString('vi-VN')} VND`
        });
      }

      // Step 1: Charge user and create check record
      console.log(`[EXPRESS TRACKING CHECK API] Step 1: Charging ${rapidCheckPrice} VND`);
      const chargeResult = await storage.atomicCookieRapidCharge({
        userId: req.user.id,
        cookieId: sessionId,
        cookiePreview: cookieValue.substring(0, 50),
        serviceCost: rapidCheckPrice,
        userIp,
        userFullName: req.user.fullName || req.user.username || 'API User',
        idempotencyKey: `rapid_check_api_${req.user.id}_${sessionId}`
      });

      if (!chargeResult.success) {
        return res.status(400).json({
          success: false,
          message: chargeResult.message
        });
      }

      console.log(`[EXPRESS TRACKING CHECK API] Step 2: Charged successfully, performing rapid check`);

      // Step 2: Perform rapid cookie check to find orders with drivers
      const rapidResult = await get_rapid_order_details_with_retry(cookieValue, 3);
      
      if (!rapidResult.success) {
        // Check failed, attempt refund
        const refundReason = rapidResult.message || rapidResult.error || 'Cookie check failed';
        console.log(`[EXPRESS TRACKING CHECK API] Check failed: ${refundReason}, attempting refund`);
        
        const refundResult = await storage.refundFailedCookieRapid({
          userId: req.user.id,
          checkId: chargeResult.checkRecord!.id,
          originalTransactionId: chargeResult.transaction!.id,
          serviceCost: rapidCheckPrice,
          cookieId: sessionId,
          reason: `API: ${refundReason}`,
          idempotencyKey: `refund_rapid_api_${req.user.id}_${sessionId}`
        });

        await storage.createActivity({
          description: `[API] ${req.user.fullName} - Express tracking check failed: ${refundReason}`,
          type: 'warning'
        });

        return res.json({
          success: false,
          message: refundResult.success 
            ? `${refundReason} - Đã hoàn ${rapidCheckPrice.toLocaleString('vi-VN')} VND` 
            : refundReason,
          charged: false,
          amount_charged: 0,
          refunded: refundResult.success,
          refund_amount: refundResult.success ? rapidCheckPrice : 0,
          hasDriver: false,
          driverPhone: null,
          driverName: null,
          orders: [],
          orderCount: 0
        });
      }

      // Check if we found a driver
      const hasDriverPhone = !!rapidResult.driver_phone;
      
      if (!hasDriverPhone) {
        // No driver found, attempt refund
        console.log(`[EXPRESS TRACKING CHECK API] No driver found, attempting refund`);
        
        const refundResult = await storage.refundFailedCookieRapid({
          userId: req.user.id,
          checkId: chargeResult.checkRecord!.id,
          originalTransactionId: chargeResult.transaction!.id,
          serviceCost: rapidCheckPrice,
          reason: 'API: No driver/shipper phone found',
          idempotencyKey: `refund_rapid_api_${req.user.id}_${sessionId}`
        });

        await storage.createActivity({
          description: `[API] ${req.user.fullName} - Express tracking check: Không tìm thấy shipper - Đã hoàn ${rapidCheckPrice}₫`,
          type: 'warning'
        });

        return res.json({
          success: false,
          message: refundResult.success 
            ? `Không tìm thấy thông tin shipper - Đã hoàn ${rapidCheckPrice.toLocaleString('vi-VN')} VND` 
            : 'Không tìm thấy thông tin shipper',
          charged: false,
          amount_charged: 0,
          refunded: refundResult.success,
          refund_amount: refundResult.success ? rapidCheckPrice : 0,
          hasDriver: false,
          driverPhone: null,
          driverName: null,
          orders: [],
          orderCount: 0
        });
      }

      // Success - update check record with results
      await storage.updateCookieRapidCheck(chargeResult.checkRecord!.id, {
        status: true,
        message: `Thành công - Tìm thấy thông tin shipper`,
        orderCount: rapidResult.order_count || 0,
        driverPhone: rapidResult.driver_phone || null,
        driverName: rapidResult.driver_name || null,
        orderId: rapidResult.orders?.[0]?.order_id || null,
        trackingNumber: rapidResult.orders?.[0]?.tracking_number || null,
        trackingInfo: rapidResult.orders?.[0]?.description || null,
        shippingName: rapidResult.orders?.[0]?.shipping_name || null,
        shippingPhone: rapidResult.orders?.[0]?.shipping_phone || null,
        shippingAddress: rapidResult.orders?.[0]?.shipping_address || null,
        orderName: rapidResult.orders?.[0]?.name || null,
        orderPrice: rapidResult.orders?.[0]?.order_price ? (rapidResult.orders[0].order_price / 100000).toString() : null,
        orderTime: rapidResult.orders?.[0]?.order_time || null,
        metadata: JSON.stringify({
          orders: rapidResult.orders || [],
          charged: true,
          chargedAmount: rapidCheckPrice,
          completedAt: new Date()
        })
      });

      await storage.createActivity({
        description: `[API] ${req.user.fullName} đã thực hiện Express tracking check thành công (Trừ ${rapidCheckPrice}₫)`,
        type: 'info'
      });

      // Return success response
      res.json({
        success: true,
        message: `Thành công - Tìm thấy thông tin shipper`,
        charged: true,
        amount_charged: rapidCheckPrice,
        hasDriver: true,
        driverPhone: rapidResult.driver_phone,
        driverName: rapidResult.driver_name,
        orders: rapidResult.orders || [],
        orderCount: rapidResult.order_count || 0,
        checkId: chargeResult.checkRecord!.id
      });

    } catch (error) {
      console.error(`[EXPRESS TRACKING CHECK API] Error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName} - Express tracking check error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for VOUCHER SAVING (chỉ lưu voucher) using API key
  app.post("/api/voucher-saving-api", authenticateApiKey, checkApiKeyPermission('voucher_saving'), async (req: any, res) => {
    console.log(`[VOUCHER SAVING API] Starting voucher saving for user ${req.user.id} via API key`);
    
    try {
      const { cookie } = req.body;
      
      // Validate required fields
      if (!cookie) {
        return res.status(400).json({ 
          success: false,
          message: 'Cookie string is required' 
        });
      }

      const cookieValue = cookie;
      const userIp = getUserIP(req);
      const sessionId = `voucher_api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const cookieId = sessionId;
      const cookiePreview = cookieValue.substring(0, 50);

      // Get voucher saving price
      const voucherSavingPrice = await storage.requireServicePrice('voucher_saving');
      
      // Check balance
      const currentBalance = await storage.getUserBalance(req.user.id);
      if (currentBalance < voucherSavingPrice) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Need ${voucherSavingPrice.toLocaleString('vi-VN')} VND for voucher saving. Current balance: ${currentBalance.toLocaleString('vi-VN')} VND`
        });
      }

      // Generate idempotency key
      const idempotencyKey = `${req.user.id}-${sessionId}-${cookieId}`;

      // Step 1: Atomic charge and operation creation
      const atomicResult = await storage.atomicVoucherSaving({
        userId: req.user.id,
        cookieId,
        cookieValue,
        cookiePreview,
        sessionId,
        serviceCost: voucherSavingPrice,
        idempotencyKey,
        userIp,
        userFullName: req.user.fullName || req.user.username || 'API User'
      });

      if (!atomicResult.success || !atomicResult.operation) {
        return res.status(400).json({
          success: false,
          message: atomicResult.message
        });
      }

      console.log(`[VOUCHER SAVING API] Charged ${voucherSavingPrice} VND, proceeding with voucher fetch`);

      // Step 2: Try to get and save vouchers with retry logic
      let finalSuccessfulSaves = 0;
      let finalFailedSaves = 0;
      let finalVoucherCodes: string[] = [];
      let isOperationSuccess = false;
      const maxRetries = 3;

      for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
        try {
          // Get vouchers
          let vouchers: any[] | null = null;
          if (retryCount === 0) {
            vouchers = await VoucherCacheService.getVouchers(false, false);
          } else {
            console.log(`[VOUCHER SAVING API] Retry attempt ${retryCount}/${maxRetries - 1} - fetching fresh vouchers`);
            vouchers = await VoucherCacheService.getVouchers(true, true);
          }

          if (!vouchers || vouchers.length === 0) {
            console.log(`[VOUCHER SAVING API] No vouchers found (attempt ${retryCount + 1})`);
            if (retryCount < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
            break;
          }

          console.log(`[VOUCHER SAVING API] Found ${vouchers.length} vouchers (attempt ${retryCount + 1})`);

          // Filter target vouchers
          const targetVouchers = vouchers.filter(v => 
            v.voucherName && v.voucherName.includes('MPVC giảm tối đa 300k từ 0k')
          );

          // Try to save vouchers
          const { successfulSaves, failedSaves, saveResults } = await attemptVoucherSaving(vouchers, cookieValue);

          finalSuccessfulSaves = successfulSaves;
          finalFailedSaves = failedSaves;
          
          // Extract successfully saved voucher codes
          finalVoucherCodes = saveResults
            .filter(result => result.isSuccess && result.voucher?.voucherCode)
            .map(result => result.voucher.voucherCode);

          // Check success condition
          const targetSavedCount = targetVouchers.length > 0 ? 
            Math.min(successfulSaves, targetVouchers.length) : 0;
          isOperationSuccess = targetSavedCount > 0;

          console.log(`[VOUCHER SAVING API] Voucher saving completed with ${successfulSaves} successful saves on attempt ${retryCount + 1}`);
          
          if (successfulSaves > 0) {
            break; // Success! No need to retry
          }
          
          console.log(`[VOUCHER SAVING API] No vouchers saved on attempt ${retryCount + 1}, retrying...`);
        } catch (voucherError) {
          console.error(`[VOUCHER SAVING API] Error saving vouchers on attempt ${retryCount + 1}:`, voucherError);
          if (retryCount < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
      }

      // Step 3: Update operation with final results
      const finalStatus = isOperationSuccess ? 'success' : 'failed';
      
      await storage.updateVoucherSavingOperation(atomicResult.operation.id, {
        status: finalStatus,
        successfulSaves: finalSuccessfulSaves,
        failedSaves: finalFailedSaves,
        voucherCodes: JSON.stringify(finalVoucherCodes)
      });

      // Step 4: Auto-refund if operation failed
      if (!isOperationSuccess) {
        console.log(`[VOUCHER SAVING API] No vouchers saved, attempting refund`);
        
        const refundResult = await storage.refundFailedVoucherSaving({
          userId: req.user.id,
          operationId: atomicResult.operation.id,
          originalTransactionId: atomicResult.transaction!.id,
          serviceCost: voucherSavingPrice,
          sessionId,
          cookieId,
          reason: 'API: No vouchers could be saved',
          idempotencyKey: `refund-${idempotencyKey}`
        });

        await storage.createActivity({
          description: `[API] ${req.user.fullName} - Voucher saving failed: No vouchers saved - Refunded ${voucherSavingPrice}₫`,
          type: 'warning'
        });

        return res.json({
          success: false,
          message: `Failed to save vouchers - ${voucherSavingPrice.toLocaleString('vi-VN')} VND refunded`,
          refunded: refundResult.success,
          refund_amount: refundResult.success ? voucherSavingPrice : 0,
          voucherCodes: [],
          successfulSaves: 0,
          failedSaves: finalFailedSaves,
          operationId: atomicResult.operation.id
        });
      }

      // Success case
      await storage.createActivity({
        description: `[API] ${req.user.fullName} đã lưu ${finalSuccessfulSaves} mã voucher thành công (Trừ ${voucherSavingPrice}₫)`,
        type: 'info'
      });

      res.json({
        success: true,
        message: `Successfully saved ${finalSuccessfulSaves} voucher codes`,
        charged: true,
        amount_charged: voucherSavingPrice,
        voucherCodes: finalVoucherCodes,
        successfulSaves: finalSuccessfulSaves,
        failedSaves: finalFailedSaves,
        operationId: atomicResult.operation.id
      });

    } catch (error) {
      console.error(`[VOUCHER SAVING API] Error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName} - Voucher saving error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for cookie freeship check using API key
  app.post("/api/cookie-freeship-api", authenticateApiKey, checkApiKeyPermission('cookie_freeship'), async (req: any, res) => {
    console.log(`[COOKIE FREESHIP API] Starting freeship check for user ${req.user.id} via API key`);
    
    try {
      const { cookie } = req.body;
      
      // Validate required fields
      if (!cookie) {
        return res.status(400).json({ 
          success: false,
          message: 'Cookie string is required' 
        });
      }

      const cookieValue = cookie;
      const userIp = req.ip || null;
      const sessionId = `freeship_api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Step 1: Perform rapid cookie check to find orders with drivers
      console.log(`[COOKIE FREESHIP API] Step 1: Performing rapid check`);
      const rapidResult = await get_rapid_order_details_with_retry(cookieValue, 3);
      
      if (!rapidResult.success) {
        await storage.createActivity({
          description: `[API] ${req.user.fullName} - Cookie freeship check failed: ${rapidResult.message}`,
          type: 'warning'
        });
        
        return res.json({
          success: false,
          message: rapidResult.message,
          hasDriver: false,
          voucherCodes: []
        });
      }

      // Check if we found a driver (shipper)
      const hasDriver = !!rapidResult.driver_phone;
      console.log(`[COOKIE FREESHIP API] Driver found: ${hasDriver}`);

      let voucherCodes = [];
      let voucherSaveResult = null;

      // Step 2: If driver found, proceed with voucher saving
      if (hasDriver) {
        console.log(`[COOKIE FREESHIP API] Step 2: Driver found, proceeding with voucher saving`);
        
        // Get voucher saving price
        const voucherSavingPrice = await storage.requireServicePrice('voucher_saving');
        
        // Check balance
        const currentBalance = await storage.getUserBalance(req.user.id);
        if (currentBalance < voucherSavingPrice) {
          return res.json({
            success: false,
            message: `Insufficient balance. Need ${voucherSavingPrice.toLocaleString('vi-VN')} VND for voucher saving. Current balance: ${currentBalance.toLocaleString('vi-VN')} VND`,
            hasDriver: true,
            voucherCodes: []
          });
        }

        // Generate idempotency key
        const idempotencyKey = `voucher_api_${req.user.id}_${sessionId}`;

        try {
          // Atomic charge and voucher saving operation
          const atomicResult = await storage.atomicVoucherSavingCharge({
            userId: req.user.id,
            cookieId: sessionId,
            cookiePreview: cookieValue.substring(0, 50),
            serviceCost: voucherSavingPrice,
            userIp,
            userFullName: req.user.fullName || req.user.username || 'API User',
            idempotencyKey
          });

          if (!atomicResult.success) {
            return res.json({
              success: false,
              message: atomicResult.message,
              hasDriver: true,
              voucherCodes: []
            });
          }

          console.log(`[COOKIE FREESHIP API] Charged ${voucherSavingPrice} VND, proceeding with voucher fetch`);

          // Step 3: Get vouchers and attempt to save them
          const vouchersResult = await get_voucher_data_for_saving(cookieValue);
          
          if (vouchersResult.success && vouchersResult.vouchers && vouchersResult.vouchers.length > 0) {
            // Try to save vouchers
            const { successfulSaves, failedSaves, saveResults } = await attemptVoucherSaving(vouchersResult.vouchers, cookieValue);
            
            // Extract successfully saved voucher codes
            voucherCodes = saveResults
              .filter(result => result.isSuccess && result.voucher?.voucherCode)
              .map(result => result.voucher.voucherCode);

            // Update operation with results
            const finalStatus = successfulSaves > 0 ? 'success' : 'failed';
            let finalMessage = successfulSaves > 0 ? 
              `Successfully saved ${successfulSaves} voucher codes` : 
              `Failed to save vouchers - auto refund processed`;

            // If saving failed, automatically refund
            if (successfulSaves === 0) {
              try {
                const refundResult = await storage.refundFailedVoucherSaving({
                  userId: req.user.id,
                  operationId: atomicResult.operation.id,
                  originalTransactionId: atomicResult.transaction!.id,
                  serviceCost: voucherSavingPrice,
                  sessionId,
                  cookieId: sessionId,
                  reason: 'API: No vouchers could be saved',
                  idempotencyKey: `refund-${idempotencyKey}`
                });

                if (refundResult.success) {
                  finalMessage = `Failed to save vouchers - ${voucherSavingPrice.toLocaleString('vi-VN')} VND refunded`;
                }
              } catch (refundError) {
                console.error(`[COOKIE FREESHIP API] Refund failed:`, refundError);
              }
            }

            await storage.updateVoucherSavingOperation(atomicResult.operation.id, {
              status: finalStatus,
              successfulSaves,
              failedSaves,
              totalVouchersFound: vouchersResult.vouchers.length,
              message: finalMessage,
              completedAt: new Date()
            });

            voucherSaveResult = {
              success: successfulSaves > 0,
              savedCount: successfulSaves,
              totalFound: vouchersResult.vouchers.length,
              message: finalMessage
            };
          } else {
            // No vouchers found, refund automatically
            try {
              await storage.refundFailedVoucherSaving({
                userId: req.user.id,
                operationId: atomicResult.operation.id,
                originalTransactionId: atomicResult.transaction!.id,
                serviceCost: voucherSavingPrice,
                sessionId,
                cookieId: sessionId,
                reason: 'API: No vouchers found',
                idempotencyKey: `refund-${idempotencyKey}`
              });
            } catch (refundError) {
              console.error(`[COOKIE FREESHIP API] Refund failed:`, refundError);
            }

            voucherSaveResult = {
              success: false,
              savedCount: 0,
              totalFound: 0,
              message: 'No vouchers found - amount refunded'
            };
          }

        } catch (error) {
          console.error(`[COOKIE FREESHIP API] Error in voucher saving:`, error);
          voucherSaveResult = {
            success: false,
            savedCount: 0,
            totalFound: 0,
            message: `Error: ${(error as Error).message}`
          };
        }
      }

      // Create activity log
      await storage.createActivity({
        description: `[API] ${req.user.fullName} - Cookie freeship check: ${hasDriver ? 'Driver found' : 'No driver'}, ${voucherCodes.length} voucher codes retrieved`,
        type: hasDriver && voucherCodes.length > 0 ? 'success' : 'info'
      });

      // Return results
      const response = {
        success: true,
        hasDriver,
        driverPhone: hasDriver ? rapidResult.driver_phone : null,
        voucherCodes,
        voucherSaving: voucherSaveResult,
        message: hasDriver ? 
          `Driver found. ${voucherCodes.length} freeship codes retrieved.` : 
          'No driver found for current orders'
      };

      console.log(`[COOKIE FREESHIP API] Completed: Driver=${hasDriver}, Vouchers=${voucherCodes.length}`);
      res.json(response);

    } catch (error) {
      console.error(`[COOKIE FREESHIP API] Error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName} - Cookie freeship check error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error',
        hasDriver: false,
        voucherCodes: []
      });
    }
  });

  // ==========================================================================
  // EXTERNAL API INTEGRATION - API KEY ENDPOINTS  
  // ==========================================================================

  // API endpoint to list integrated external API keys
  app.get("/api/v1/external-api/providers", authenticateApiKey, checkApiKeyPermission('external_api_integration'), async (req: any, res) => {
    console.log(`[EXTERNAL API] GET /providers called for user ${req.user.id}`);
    try {
      const userId = req.user.id;
      console.log(`[EXTERNAL API] Getting external API keys for user ${userId}`);

      // Get user's external API keys
      const externalApiKeys = await storage.getExternalApiKeysByUser(userId);
      console.log(`[EXTERNAL API] Found ${externalApiKeys.length} external API keys`);
      
      // Filter only active keys and return provider info
      const providers = externalApiKeys
        .filter(key => key.isActive)
        .map(key => ({
          provider: key.provider,
          balance: key.balance,
          isActive: key.isActive,
          lastBalanceCheck: key.lastBalanceCheck
        }));

      res.json({
        success: true,
        providers,
        message: `Found ${providers.length} active provider(s)`
      });

    } catch (error) {
      console.error(`[EXTERNAL API] List providers error:`, error);
      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for renting phone numbers (simplified - returns phone number immediately)
  app.post("/api/v1/external-api/rent", authenticateApiKey, checkApiKeyPermission('external_api_integration'), async (req: any, res) => {
    console.log(`[EXTERNAL API] Starting simplified phone rental for user ${req.user.id} via API key`);
    
    try {
      const { provider, carrier = 'random' } = req.body;
      
      // Validate required fields
      if (!provider) {
        return res.status(400).json({ 
          success: false,
          message: 'Provider is required' 
        });
      }

      // Validate provider
      const validProviders = ['viotp', 'chaycodes3', '365otp', 'funotp', 'ironsim', 'bossotp'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({
          success: false,
          message: `Invalid provider. Valid providers: ${validProviders.join(', ')}`
        });
      }

      const userId = req.user.id;

      // Check user balance first (must have at least 100 VND)
      const userBalance = await storage.getUserBalance(userId);
      if (userBalance < 100) {
        return res.status(400).json({
          success: false,
          message: `Số dư không đủ. Cần tối thiểu 100đ để thuê số. Số dư hiện tại: ${userBalance.toLocaleString('vi-VN')}đ`
        });
      }

      // Check if user has external API key for this provider
      const apiKey = await storage.getExternalApiKeyByUserAndProvider(userId, provider);
      if (!apiKey || !apiKey.isActive) {
        return res.status(400).json({
          success: false,
          message: `No active external API key found for provider: ${provider}`
        });
      }

      // Generate session ID
      const sessionId = `ext_${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

      // Create external API rental record
      const rental = await storage.createExternalApiRental({
        userId,
        sessionId,
        provider,
        status: "requesting",
        maxAttempts: 10,
        attemptNumber: 1
      });

      // Synchronously rent number from external provider
      const result = await rentNumberFromProvider(rental.id, apiKey.keyValue, provider, carrier);
      
      // Update rental with result
      await storage.updateExternalApiRental(rental.sessionId, {
        status: result.success ? "allocated" : "failed",
        phoneNumber: result.phoneNumber,
        formattedPhoneNumber: result.formattedPhoneNumber,
        carrier: result.carrier,
        price: result.price,
        isShopeeRegistered: result.isShopeeRegistered,
        errorMessage: result.errorMessage,
        allocatedAt: result.success ? new Date() : null,
        completedAt: result.success ? null : new Date(),
        attemptNumber: result.attemptNumber || 1,
        providerRequestId: result.providerRequestId
      });

      // Create activity log
      await storage.createActivity({
        description: `[API] ${req.user.fullName || req.user.username} - ${result.success ? 'Successfully rented' : 'Failed to rent'} phone from ${provider} (${carrier})`,
        type: result.success ? 'success' : 'warning'
      });

      if (result.success) {
        res.json({
          success: true,
          sessionId: rental.sessionId,
          phoneNumber: result.phoneNumber,
          formattedPhoneNumber: result.formattedPhoneNumber,
          provider,
          carrier: result.carrier,
          price: result.price,
          isShopeeRegistered: result.isShopeeRegistered,
          message: "Phone number rented successfully"
        });
      } else {
        res.status(400).json({
          success: false,
          sessionId: rental.sessionId,
          provider,
          message: result.errorMessage || "Failed to rent phone number",
          attemptNumber: result.attemptNumber
        });
      }

    } catch (error) {
      console.error(`[EXTERNAL API] Simplified phone rental error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName || req.user.username} - Phone rental error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for getting OTP by session ID (simplified)  
  app.post("/api/v1/external-api/otp", authenticateApiKey, checkApiKeyPermission('external_api_integration'), async (req: any, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ 
          success: false,
          message: 'Session ID is required' 
        });
      }

      const userId = req.user.id;

      // Get rental session
      const rental = await storage.getExternalApiRental(sessionId);
      
      if (!rental) {
        return res.status(404).json({ 
          success: false,
          message: "Session not found" 
        });
      }

      // Check ownership
      if (rental.userId !== userId) {
        return res.status(403).json({ 
          success: false,
          message: "Access denied to this session" 
        });
      }

      // Check if rental is ready for OTP polling
      if (rental.status !== "allocated") {
        return res.status(400).json({
          success: false,
          state: rental.status,
          message: rental.status === "requesting" ? 
            "Phone number not allocated yet" :
            rental.status === "failed" ? 
            `Phone rental failed: ${rental.errorMessage}` :
            `Invalid session status: ${rental.status}`
        });
      }

      if (!rental.providerRequestId) {
        return res.status(400).json({
          success: false,
          message: "No provider request ID found for OTP polling"
        });
      }

      // Get external API key for this provider
      const apiKey = await storage.getExternalApiKeyByUserAndProvider(userId, rental.provider);
      if (!apiKey || !apiKey.isActive) {
        return res.status(400).json({
          success: false,
          message: `External API key not found or inactive for provider: ${rental.provider}`
        });
      }

      // Poll OTP from provider
      let otpResult;
      switch (rental.provider) {
        case 'viotp':
          otpResult = await pollOtpFromViotp(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'chaycodes3':
          otpResult = await pollOtpFromChaycodes3(apiKey.keyValue, rental.providerRequestId);
          break;
        case '365otp':
          otpResult = await pollOtpFrom365otp(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'funotp':
          otpResult = await pollOtpFromFunOtp(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'ironsim':
          otpResult = await pollOtpFromIronSim(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'bossotp':
          otpResult = await pollOtpFromBossOtp(apiKey.keyValue, rental.providerRequestId);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: `Unsupported provider: ${rental.provider}`
          });
      }

      // Update rental with OTP result if successful
      if (otpResult.success && otpResult.state === 'completed' && otpResult.otpCode) {
        // Check if user has already been charged for this session
        const existingCharge = await storage.getTransactionByReference(`otp_charge_${sessionId}`);
        
        if (!existingCharge) {
          console.log(`[EXTERNAL API] Charging user ${userId} 100đ for OTP session ${sessionId}`);
          
          // Charge user 100 VND for successful OTP
          const chargeTransaction = await storage.createTransaction({
            userId,
            type: 'external_api_otp',
            amount: -100, // Deduct 100 VND
            reference: `otp_charge_${sessionId}`,
            description: `Phí nhận OTP từ ${rental.provider} - ${rental.phoneNumber}`,
            relatedId: rental.id
          });

          console.log(`[EXTERNAL API] Successfully charged user ${userId} 100đ (transaction ID: ${chargeTransaction.id})`);
        } else {
          console.log(`[EXTERNAL API] User ${userId} already charged for session ${sessionId}, skipping charge`);
        }

        await storage.updateExternalApiRental(sessionId, {
          otpCode: otpResult.otpCode,
          smsContent: otpResult.smsContent,
          completedAt: new Date(),
          status: "completed"
        });

        // Create activity log for successful OTP
        await storage.createActivity({
          description: `[API] ${req.user.fullName || req.user.username} - OTP received from ${rental.provider} for ${rental.phoneNumber}${!existingCharge ? ' (100đ charged)' : ' (already charged)'}`,
          type: 'success'
        });
      }

      res.json({
        success: otpResult.success,
        sessionId,
        phoneNumber: rental.phoneNumber,
        provider: rental.provider,
        otpCode: otpResult.otpCode || null,
        smsContent: otpResult.smsContent || null,
        state: otpResult.state,
        message: otpResult.success ? 
          (otpResult.state === 'completed' ? 'OTP received successfully' : 'Waiting for OTP...') :
          otpResult.error || 'Failed to get OTP'
      });

    } catch (error) {
      console.error(`[EXTERNAL API] Simplified OTP polling error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName || req.user.username} - OTP polling error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for renting phone numbers from external providers using API key
  app.post("/api/v1/external-api/rent-phone", authenticateApiKey, checkApiKeyPermission('external_api_integration'), async (req: any, res) => {
    console.log(`[EXTERNAL API] Starting phone rental for user ${req.user.id} via API key`);
    
    try {
      const { provider, carrier = 'random' } = req.body;
      
      // Validate required fields
      if (!provider) {
        return res.status(400).json({ 
          success: false,
          message: 'Provider is required' 
        });
      }

      // Validate provider
      const validProviders = ['viotp', 'chaycodes3', '365otp', 'funotp', 'ironsim', 'bossotp'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({
          success: false,
          message: `Invalid provider. Valid providers: ${validProviders.join(', ')}`
        });
      }

      const userId = req.user.id;
      const userIp = getUserIP(req);

      // Check if user has external API key for this provider
      const apiKey = await storage.getExternalApiKeyByUserAndProvider(userId, provider);
      if (!apiKey || !apiKey.isActive) {
        return res.status(400).json({
          success: false,
          message: `No active external API key found for provider: ${provider}`
        });
      }

      // Generate session ID
      const sessionId = `ext_${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

      // Create external API rental record
      const rental = await storage.createExternalApiRental({
        userId,
        sessionId,
        provider,
        status: "requesting",
        maxAttempts: 10,
        attemptNumber: 1
      });

      // Start async process to rent number from external provider
      rentNumberFromProvider(rental.id, apiKey.keyValue, provider, carrier)
        .then(async (result) => {
          // Update rental with result
          await storage.updateExternalApiRental(rental.sessionId, {
            status: result.success ? "allocated" : "failed",
            phoneNumber: result.phoneNumber,
            formattedPhoneNumber: result.formattedPhoneNumber,
            carrier: result.carrier,
            price: result.price,
            isShopeeRegistered: result.isShopeeRegistered,
            errorMessage: result.errorMessage,
            allocatedAt: result.success ? new Date() : null,
            completedAt: result.success ? null : new Date(),
            attemptNumber: result.attemptNumber || 1,
            providerRequestId: result.providerRequestId
          });
        })
        .catch(async (error) => {
          console.error('Error in number rental process:', error);
          await storage.updateExternalApiRental(rental.sessionId, {
            status: "failed",
            errorMessage: error.message || "Lỗi không xác định trong quá trình thuê số",
            completedAt: new Date(),
            attemptNumber: 10
          });
        });

      // Create activity log
      await storage.createActivity({
        description: `[API] ${req.user.fullName || req.user.username} - Requested phone rental from ${provider} (${carrier})`,
        type: 'info'
      });

      res.json({
        success: true,
        sessionId: rental.sessionId,
        provider,
        carrier,
        status: "requesting",
        message: "Phone rental request initiated. Use sessionId to check status and get OTP."
      });

    } catch (error) {
      console.error(`[EXTERNAL API] Phone rental error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName || req.user.username} - Phone rental error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for getting OTP from external provider using API key
  app.post("/api/v1/external-api/get-otp", authenticateApiKey, checkApiKeyPermission('external_api_integration'), async (req: any, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ 
          success: false,
          message: 'Session ID is required' 
        });
      }

      const userId = req.user.id;

      // Get rental session
      const rental = await storage.getExternalApiRental(sessionId);
      
      if (!rental) {
        return res.status(404).json({ 
          success: false,
          message: "Rental session not found" 
        });
      }

      // Check ownership
      if (rental.userId !== userId) {
        return res.status(403).json({ 
          success: false,
          message: "You don't have access to this rental session" 
        });
      }

      // Check if rental is ready for OTP polling
      if (rental.status !== "allocated") {
        return res.json({
          success: false,
          state: rental.status,
          message: rental.status === "requesting" ? 
            "Still allocating phone number. Please try again later." :
            rental.status === "failed" ? 
            `Phone rental failed: ${rental.errorMessage}` :
            `Session status: ${rental.status}`
        });
      }

      if (!rental.providerRequestId) {
        return res.status(400).json({
          success: false,
          message: "No provider request ID found for OTP polling"
        });
      }

      // Get external API key for this provider
      const apiKey = await storage.getExternalApiKeyByUserAndProvider(userId, rental.provider);
      if (!apiKey || !apiKey.isActive) {
        return res.status(400).json({
          success: false,
          message: `External API key not found or inactive for provider: ${rental.provider}`
        });
      }

      // Poll OTP from provider
      let otpResult;
      switch (rental.provider) {
        case 'viotp':
          otpResult = await pollOtpFromViotp(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'chaycodes3':
          otpResult = await pollOtpFromChaycodes3(apiKey.keyValue, rental.providerRequestId);
          break;
        case '365otp':
          otpResult = await pollOtpFrom365otp(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'funotp':
          otpResult = await pollOtpFromFunOtp(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'ironsim':
          otpResult = await pollOtpFromIronSim(apiKey.keyValue, rental.providerRequestId);
          break;
        case 'bossotp':
          otpResult = await pollOtpFromBossOtp(apiKey.keyValue, rental.providerRequestId);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: `Unsupported provider: ${rental.provider}`
          });
      }

      // Update rental with OTP result if successful
      if (otpResult.success && otpResult.state === 'completed' && otpResult.otpCode) {
        await storage.updateExternalApiRental(sessionId, {
          otpCode: otpResult.otpCode,
          smsContent: otpResult.smsContent,
          completedAt: new Date(),
          status: "completed"
        });

        // Create activity log for successful OTP
        await storage.createActivity({
          description: `[API] ${req.user.fullName || req.user.username} - OTP received from ${rental.provider} for ${rental.phoneNumber}`,
          type: 'success'
        });
      }

      res.json({
        success: otpResult.success,
        state: otpResult.state,
        otpCode: otpResult.otpCode || null,
        smsContent: otpResult.smsContent || null,
        phoneNumber: rental.phoneNumber,
        provider: rental.provider,
        message: otpResult.success ? 
          (otpResult.state === 'completed' ? 'OTP received successfully' : 'Waiting for OTP...') :
          otpResult.error || 'Failed to get OTP'
      });

    } catch (error) {
      console.error(`[EXTERNAL API] OTP polling error:`, error);
      
      await storage.createActivity({
        description: `[API] ${req.user.fullName || req.user.username} - OTP polling error: ${(error as Error).message}`,
        type: 'error'
      });

      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // API endpoint for checking rental session status using API key
  app.get("/api/v1/external-api/session/:sessionId", authenticateApiKey, checkApiKeyPermission('external_api_integration'), async (req: any, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      const rental = await storage.getExternalApiRental(sessionId);
      
      if (!rental) {
        return res.status(404).json({ 
          success: false,
          message: "Rental session not found" 
        });
      }

      // Check ownership
      if (rental.userId !== userId) {
        return res.status(403).json({ 
          success: false,
          message: "You don't have access to this rental session" 
        });
      }

      // Return session details
      res.json({
        success: true,
        session: {
          sessionId: rental.sessionId,
          provider: rental.provider,
          status: rental.status,
          phoneNumber: rental.phoneNumber,
          formattedPhoneNumber: rental.formattedPhoneNumber,
          carrier: rental.carrier,
          price: rental.price,
          isShopeeRegistered: rental.isShopeeRegistered,
          otpCode: rental.otpCode,
          smsContent: rental.smsContent,
          errorMessage: rental.errorMessage,
          createdAt: rental.createdAt,
          allocatedAt: rental.allocatedAt,
          completedAt: rental.completedAt,
          attemptNumber: rental.attemptNumber,
          maxAttempts: rental.maxAttempts
        }
      });

    } catch (error) {
      console.error(`[EXTERNAL API] Session status error:`, error);
      
      res.status(500).json({ 
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // DATABASE MIGRATION MANAGEMENT ENDPOINTS
  // ====================================

  // Get migration status
  app.get("/api/database-migration/status", authenticateToken, async (req: any, res) => {
    try {
      // Only superadmin can access
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: "Only superadmin can access database migration" });
      }

      const status = await storage.getDatabaseMigrationStatus();
      res.json(status);
    } catch (error) {
      console.error("Database migration status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Test database connection
  app.post("/api/database-migration/test-connection", authenticateToken, async (req: any, res) => {
    try {
      // Only superadmin can access
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: "Only superadmin can access database migration" });
      }

      const { databaseUrl } = req.body;
      if (!databaseUrl) {
        return res.status(400).json({ message: "Database URL is required" });
      }

      const isValid = await storage.testDatabaseConnection(databaseUrl);
      
      if (isValid) {
        res.json({ success: true, message: "Connection successful" });
      } else {
        res.status(400).json({ success: false, message: "Connection failed" });
      }
    } catch (error) {
      console.error("Database connection test error:", error);
      res.status(500).json({ message: error.message || "Connection test failed" });
    }
  });

  // Update migration configuration
  app.post("/api/database-migration/config", authenticateToken, async (req: any, res) => {
    try {
      // Only superadmin can access
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: "Only superadmin can access database migration" });
      }

      const { targetDatabaseUrl, autoMigrationEnabled } = req.body;
      
      if (!targetDatabaseUrl) {
        return res.status(400).json({ message: "Target database URL is required" });
      }

      await storage.updateMigrationConfig({
        targetDatabaseUrl,
        autoMigrationEnabled: autoMigrationEnabled || false
      });

      res.json({ success: true, message: "Configuration updated successfully" });
    } catch (error) {
      console.error("Migration config update error:", error);
      res.status(500).json({ message: error.message || "Failed to update configuration" });
    }
  });

  // Start manual migration
  app.post("/api/database-migration/start", authenticateToken, async (req: any, res) => {
    try {
      // Only superadmin can access
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: "Only superadmin can access database migration" });
      }

      const { targetDatabaseUrl, manual } = req.body;
      
      if (!targetDatabaseUrl) {
        return res.status(400).json({ message: "Target database URL is required" });
      }

      // Check if migration is already running
      const status = await storage.getDatabaseMigrationStatus();
      if (status.isRunning) {
        return res.status(400).json({ message: "Migration is already running" });
      }

      // Start migration
      const migrationId = await storage.startDatabaseMigration(targetDatabaseUrl, manual);

      res.json({ 
        success: true, 
        message: "Migration started", 
        migrationId 
      });
    } catch (error) {
      console.error("Migration start error:", error);
      res.status(500).json({ message: error.message || "Failed to start migration" });
    }
  });

  // Get migration history
  app.get("/api/database-migration/history", authenticateToken, async (req: any, res) => {
    try {
      // Only superadmin can access
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: "Only superadmin can access database migration" });
      }

      const history = await storage.getDatabaseMigrationHistory();
      res.json(history);
    } catch (error) {
      console.error("Migration history error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
