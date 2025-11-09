/**
 * PERFORMANCE MONITORING
 * ======================
 * 
 * Track API response times, throughput, và bottlenecks
 * Giúp identify slow endpoints và optimize performance
 */

import type { Request, Response, NextFunction } from 'express';

interface PerformanceMetric {
  endpoint: string;
  method: string;
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  lastCalled: number;
  errorCount: number;
}

class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric>();
  private requestHistory: Array<{ endpoint: string; time: number; timestamp: number }> = [];
  private readonly MAX_HISTORY = 1000;

  /**
   * Middleware để track performance
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const endpoint = `${req.method} ${req.path}`;

      // Hook into response finish event
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.recordMetric(endpoint, req.method, duration, res.statusCode >= 400);
      });

      next();
    };
  }

  private recordMetric(endpoint: string, method: string, duration: number, isError: boolean) {
    const key = `${method}:${endpoint}`;
    const existing = this.metrics.get(key);

    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.avgTime = existing.totalTime / existing.count;
      existing.minTime = Math.min(existing.minTime, duration);
      existing.maxTime = Math.max(existing.maxTime, duration);
      existing.lastCalled = Date.now();
      if (isError) existing.errorCount++;
    } else {
      this.metrics.set(key, {
        endpoint,
        method,
        count: 1,
        totalTime: duration,
        avgTime: duration,
        minTime: duration,
        maxTime: duration,
        lastCalled: Date.now(),
        errorCount: isError ? 1 : 0
      });
    }

    // Add to history (circular buffer)
    this.requestHistory.push({ endpoint, time: duration, timestamp: Date.now() });
    if (this.requestHistory.length > this.MAX_HISTORY) {
      this.requestHistory.shift();
    }
  }

  /**
   * Get all performance metrics
   */
  getMetrics() {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.avgTime - a.avgTime); // Sort by avg time descending
  }

  /**
   * Get slow endpoints (avg > threshold)
   */
  getSlowEndpoints(thresholdMs: number = 1000) {
    return this.getMetrics()
      .filter(m => m.avgTime > thresholdMs)
      .slice(0, 10);
  }

  /**
   * Get most called endpoints
   */
  getMostCalled(limit: number = 10) {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get endpoints with most errors
   */
  getErrorProne(limit: number = 10) {
    return Array.from(this.metrics.values())
      .filter(m => m.errorCount > 0)
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, limit);
  }

  /**
   * Get throughput stats
   */
  getThroughput() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const fiveMinutesAgo = now - 300000;

    const lastMinute = this.requestHistory.filter(r => r.timestamp > oneMinuteAgo).length;
    const lastFiveMinutes = this.requestHistory.filter(r => r.timestamp > fiveMinutesAgo).length;

    return {
      requestsPerMinute: lastMinute,
      requestsPerFiveMinutes: lastFiveMinutes,
      averagePerMinute: Math.round(lastFiveMinutes / 5),
      totalTracked: this.requestHistory.length
    };
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const metrics = this.getMetrics();
    const totalRequests = metrics.reduce((sum, m) => sum + m.count, 0);
    const totalErrors = metrics.reduce((sum, m) => sum + m.errorCount, 0);
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.avgTime, 0) / metrics.length || 0;

    return {
      totalEndpoints: metrics.length,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests * 100).toFixed(2) + '%' : '0%',
      avgResponseTime: Math.round(avgResponseTime) + 'ms',
      throughput: this.getThroughput(),
      slowestEndpoints: this.getSlowEndpoints().slice(0, 5),
      mostCalled: this.getMostCalled(5),
      errorProne: this.getErrorProne(5)
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.requestHistory = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();
