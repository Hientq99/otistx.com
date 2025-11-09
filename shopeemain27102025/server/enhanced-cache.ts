/**
 * ENHANCED CACHING SYSTEM
 * ========================
 * 
 * Advanced caching với smart invalidation và tiered TTL
 * Giảm database queries và tăng response time
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number; // Track cache hits
}

export class EnhancedCache {
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };

  /**
   * Set value với TTL tùy chỉnh
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
      hits: 0
    });
    this.stats.sets++;
  }

  /**
   * Get value từ cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Invalidate cache by pattern (e.g., "user:123:*")
   */
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern.replace('*', '.*'));
    let deletedCount = 0;

    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
        this.stats.deletes++;
      }
    }

    return deletedCount;
  }

  /**
   * Invalidate specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: hitRate.toFixed(2) + '%'
    };
  }

  /**
   * Get popular cache keys
   */
  getPopularKeys(limit: number = 10) {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, hits: entry.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);

    return entries;
  }
}

// Global cache instance
export const enhancedCache = new EnhancedCache();

// Auto cleanup every 5 minutes
setInterval(() => {
  const cleaned = enhancedCache.cleanup();
  if (cleaned > 0) {
    console.log(`[CACHE] Cleaned up ${cleaned} expired entries`);
  }
}, 5 * 60 * 1000);

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  USER_BALANCE: 10, // 10 seconds - frequently updated
  SERVICE_PRICING: 3600, // 1 hour - rarely changes
  USER_DATA: 300, // 5 minutes
  HISTORY: 30, // 30 seconds - balance between freshness and performance
  ACTIVE_SESSIONS: 2, // 2 seconds - very dynamic data
  ANALYTICS: 600, // 10 minutes
  EXTERNAL_API_KEYS: 300, // 5 minutes
} as const;
