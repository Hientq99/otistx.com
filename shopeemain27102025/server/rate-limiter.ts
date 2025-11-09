/**
 * RATE LIMITER MIDDLEWARE
 * =======================
 * 
 * Giới hạn số requests để tránh spam và DDoS
 * Tối ưu cho máy 2 cores, 4GB RAM
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 300000);

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
}

/**
 * Rate limiter middleware factory
 * 
 * @param options - Rate limit configuration
 * @returns Express middleware
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
    skipSuccessfulRequests = false
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting for superadmin
    if (req.user && (req.user as any).role === 'superadmin') {
      return next();
    }

    // Create key based on user ID or IP
    const identifier = req.user ? `user:${(req.user as any).id}` : `ip:${req.ip}`;
    const now = Date.now();

    // Initialize or get existing entry
    if (!store[identifier] || store[identifier].resetTime < now) {
      store[identifier] = {
        count: 0,
        resetTime: now + windowMs
      };
    }

    // Increment counter
    store[identifier].count++;

    // Check if limit exceeded
    if (store[identifier].count > maxRequests) {
      const retryAfter = Math.ceil((store[identifier].resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(store[identifier].resetTime));
      
      return res.status(429).json({ 
        message,
        retryAfter 
      });
    }

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(maxRequests - store[identifier].count));
    res.set('X-RateLimit-Reset', String(store[identifier].resetTime));

    // If skipSuccessfulRequests, decrement on success
    if (skipSuccessfulRequests) {
      const originalJson = res.json;
      res.json = function(body: any) {
        if (res.statusCode < 400) {
          store[identifier].count = Math.max(0, store[identifier].count - 1);
        }
        return originalJson.call(this, body);
      };
    }

    next();
  };
}

/**
 * Global rate limiter - Apply to all API routes
 * 150 requests per minute per user/IP (optimized for 30 concurrent users)
 */
export const globalRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 150,
  message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ 1 phút trước khi thử lại.',
  skipSuccessfulRequests: true // Don't count successful requests for better UX
});

/**
 * Strict rate limiter for expensive operations (phone rental, etc)
 * 15 requests per minute per user (optimized for 30 concurrent users)
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 15,
  message: 'Bạn đã thực hiện quá nhiều thao tác này. Vui lòng chờ 1 phút trước khi thử lại.',
  skipSuccessfulRequests: true
});

/**
 * Auth rate limiter for login attempts
 * 10 attempts per 15 minutes
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 900000, // 15 minutes
  maxRequests: 10,
  message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.'
});
