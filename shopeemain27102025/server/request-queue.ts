/**
 * REQUEST QUEUE MIDDLEWARE
 * ========================
 * 
 * Giới hạn số requests đồng thời để tránh quá tải server
 * Tối ưu cho máy 2 cores, 4GB RAM
 */

import type { Request, Response, NextFunction } from 'express';

class RequestQueue {
  private activeRequests = 0;
  private maxConcurrent: number;
  private queue: Array<() => void> = [];
  private requestTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  getStats() {
    return {
      active: this.activeRequests,
      queued: this.queue.length,
      max: this.maxConcurrent,
      utilizationPercent: Math.round((this.activeRequests / this.maxConcurrent) * 100)
    };
  }

  async acquire(requestId?: string, timeoutMs: number = 60000): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return Promise.resolve();
    }

    // Queue is full, wait
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.queue.indexOf(resolver);
        if (index > -1) {
          this.queue.splice(index, 1);
        }
        if (requestId) {
          this.requestTimeouts.delete(requestId);
        }
        reject(new Error('Request timeout: Server is busy, please try again later'));
      }, timeoutMs);

      const resolver = () => {
        clearTimeout(timeoutId);
        if (requestId) {
          this.requestTimeouts.delete(requestId);
        }
        this.activeRequests++;
        resolve();
      };

      if (requestId) {
        this.requestTimeouts.set(requestId, timeoutId);
      }
      
      this.queue.push(resolver);
    });
  }

  release() {
    // Prevent activeRequests from going negative
    if (this.activeRequests > 0) {
      this.activeRequests--;
    }
    
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

// Global queue for all API requests - max 45 concurrent (optimized for 30 users)
const globalQueue = new RequestQueue(45);

// Strict queue for phone rental operations - max 15 concurrent (optimized for 30 users)
const phoneRentalQueue = new RequestQueue(15);

/**
 * Global concurrent request limiter
 */
export function concurrentRequestLimiter(req: Request, res: Response, next: NextFunction) {
  const requestId = `${req.ip}-${Date.now()}-${Math.random()}`;
  
  globalQueue.acquire(requestId, 30000)
    .then(() => {
      // Use flag to ensure release is called only once
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          globalQueue.release();
        }
      };

      // Use .once() and call on both finish and close
      // to handle both normal completion and abrupt disconnection
      res.once('finish', release);
      res.once('close', release);

      next();
    })
    .catch((error) => {
      console.error(`[QUEUE] Request rejected: ${error.message}`);
      res.status(503).json({ 
        message: 'Máy chủ đang xử lý quá nhiều yêu cầu. Vui lòng thử lại sau vài giây.',
        stats: globalQueue.getStats()
      });
    });
}

/**
 * Phone rental request limiter - stricter limit
 */
export function phoneRentalRequestLimiter(req: Request, res: Response, next: NextFunction) {
  const requestId = `rental-${req.ip}-${Date.now()}`;
  
  phoneRentalQueue.acquire(requestId, 90000) // 90s timeout for phone rental
    .then(() => {
      // Use flag to ensure release is called only once
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          phoneRentalQueue.release();
        }
      };

      // Use .once() and call on both finish and close
      res.once('finish', release);
      res.once('close', release);

      next();
    })
    .catch((error) => {
      console.error(`[PHONE_RENTAL_QUEUE] Request rejected: ${error.message}`);
      res.status(503).json({ 
        message: 'Hệ thống đang xử lý nhiều yêu cầu thuê số. Vui lòng thử lại sau 1 phút.',
        stats: phoneRentalQueue.getStats()
      });
    });
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  return {
    global: globalQueue.getStats(),
    phoneRental: phoneRentalQueue.getStats()
  };
}
