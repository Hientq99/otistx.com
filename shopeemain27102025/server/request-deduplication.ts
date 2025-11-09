/**
 * REQUEST DEDUPLICATION
 * ======================
 * 
 * Prevent duplicate requests trong cùng thời gian ngắn
 * Giúp tránh race conditions và duplicate operations
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class RequestDeduplicator {
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly TTL = 5000; // 5 seconds TTL for duplicate detection

  /**
   * Generate request fingerprint
   */
  private generateFingerprint(req: Request): string {
    const userId = (req as any).user?.id || 'anonymous';
    const method = req.method;
    const path = req.path;
    const body = method !== 'GET' ? JSON.stringify(req.body) : '';
    const query = JSON.stringify(req.query);

    const data = `${userId}:${method}:${path}:${body}:${query}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Middleware to deduplicate requests
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Only deduplicate POST/PUT/PATCH/DELETE requests
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
      }

      const fingerprint = this.generateFingerprint(req);
      const existing = this.pendingRequests.get(fingerprint);

      if (existing) {
        const age = Date.now() - existing.timestamp;
        
        if (age < this.TTL) {
          console.log(`[DEDUP] Duplicate request detected: ${req.method} ${req.path} (${age}ms ago)`);
          
          // Wait for the original request to complete
          try {
            const result = await existing.promise;
            
            // Clone the original response exactly
            if (result) {
              res.status(result.statusCode);
              
              // Set headers
              for (const [key, value] of Object.entries(result.headers)) {
                if (value !== undefined) {
                  res.setHeader(key, value as string | number | readonly string[]);
                }
              }
              
              // Add deduplication marker
              res.setHeader('X-Deduplicated', 'true');
              res.setHeader('X-Original-Request-Age', age.toString());
              
              // Send the body as-is
              if (typeof result.body === 'object') {
                return res.json(result.body);
              } else {
                return res.send(result.body);
              }
            } else {
              // Fallback if we couldn't capture response
              return res.status(500).json({
                message: 'Duplicate request tracking failed',
                _deduplicated: true
              });
            }
          } catch (error) {
            console.error('[DEDUP] Error waiting for duplicate request:', error);
            return res.status(500).json({
              message: 'Duplicate request failed',
              _deduplicated: true,
              _error: (error as Error).message
            });
          }
        } else {
          // Request is too old, clean it up
          this.pendingRequests.delete(fingerprint);
        }
      }

      // Create a promise that will be resolved when the request completes
      let resolvePromise: (value: any) => void;
      let rejectPromise: (reason: any) => void;

      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      this.pendingRequests.set(fingerprint, {
        promise,
        timestamp: Date.now()
      });

      // Capture response details
      let responseData: {
        statusCode: number;
        headers: Record<string, string | number | readonly string[]>;
        body: any;
      } | null = null;

      // Store original functions
      const originalSend = res.send;
      const originalJson = res.json;
      const originalStatus = res.status;

      // Override send to capture response
      res.send = function(body: any) {
        responseData = {
          statusCode: res.statusCode,
          headers: Object.fromEntries(
            Object.entries(res.getHeaders())
              .filter(([_, v]) => v !== undefined)
              .map(([k, v]) => [k, v as string | number | readonly string[]])
          ),
          body
        };
        resolvePromise!(responseData);
        return originalSend.call(this, body);
      };

      res.json = function(body: any) {
        responseData = {
          statusCode: res.statusCode,
          headers: Object.fromEntries(
            Object.entries(res.getHeaders())
              .filter(([_, v]) => v !== undefined)
              .map(([k, v]) => [k, v as string | number | readonly string[]])
          ),
          body
        };
        resolvePromise!(responseData);
        return originalJson.call(this, body);
      };

      // Clean up after request completes
      res.on('finish', () => {
        setTimeout(() => {
          this.pendingRequests.delete(fingerprint);
        }, this.TTL);
      });

      // Handle errors
      res.on('error', (error) => {
        rejectPromise!(error);
        setTimeout(() => {
          this.pendingRequests.delete(fingerprint);
        }, this.TTL);
      });

      next();
    };
  }

  /**
   * Get stats about deduplication
   */
  getStats() {
    const now = Date.now();
    const pending = Array.from(this.pendingRequests.values());
    const recentPending = pending.filter(r => now - r.timestamp < this.TTL);

    return {
      totalPending: this.pendingRequests.size,
      recentPending: recentPending.length,
      oldPending: pending.length - recentPending.length,
      ttl: this.TTL
    };
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.pendingRequests.clear();
  }
}

export const requestDeduplicator = new RequestDeduplicator();
