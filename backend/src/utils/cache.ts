/**
 * Redis Caching Utilities
 * Generic cache layer for dashboard data and temporary session tokens.
 * Prevents repeated scraping and IP bans from WebKiosk.
 */

import Redis from 'ioredis';

type MemoryEntry<T> = {
  data: T;
  expiresAt: number;
};

export class CacheService {
  private redis: Redis | null;
  private memoryCache = new Map<string, MemoryEntry<any>>();

  constructor(redisUrl?: string) {
    this.redis = redisUrl
      ? new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        })
      : null;

    if (typeof this.redis?.on === 'function') {
      this.redis.on('error', () => {
        // Cache is best-effort. Route handlers fall back to fresh fetches or memory cache.
      });
    }
  }

  /**
   * Get cached data
   * @param prefix - Namespace prefix (e.g., 'dashboard', 'captcha')
   * @param key - The specific key (e.g., enrollment number, session token)
   * @returns Cached data or null if expired/missing
   */
  async get<T>(prefix: string, key: string): Promise<T | null> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);

      if (!this.redis) {
        const cached = this.memoryCache.get(cacheKey);
        if (!cached || cached.expiresAt <= Date.now()) {
          this.memoryCache.delete(cacheKey);
          return null;
        }

        return cached.data as T;
      }

      const cached = await this.redis.get(cacheKey);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      console.error(`[Cache] Get failed for ${prefix}:${key}:`, error);
      return null;
    }
  }

  /**
   * Set data in cache
   * @param prefix - Namespace prefix
   * @param key - The specific key
   * @param data - Data to cache
   * @param ttlSeconds - Time to live in seconds
   */
  async set<T>(prefix: string, key: string, data: T, ttlSeconds: number): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);

      if (!this.redis) {
        this.memoryCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
        return;
      }

      await this.redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
    } catch (error) {
      console.error(`[Cache] Set failed for ${prefix}:${key}:`, error);
    }
  }

  /**
   * Invalidate cache for specific key
   */
  async invalidate(prefix: string, key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);

      if (!this.redis) {
        this.memoryCache.delete(cacheKey);
        return;
      }

      await this.redis.del(cacheKey);
    } catch (error) {
      console.error(`[Cache] Invalidate failed for ${prefix}:${key}:`, error);
    }
  }

  /**
   * Check if cache is valid (not expired)
   */
  async isValid(prefix: string, key: string): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);

      if (!this.redis) {
        const cached = this.memoryCache.get(cacheKey);
        if (!cached || cached.expiresAt <= Date.now()) {
          this.memoryCache.delete(cacheKey);
          return false;
        }

        return true;
      }

      const ttl = await this.redis.ttl(cacheKey);
      return ttl > 0;
    } catch (error) {
      console.error(`[Cache] TTL check failed for ${prefix}:${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL in seconds
   */
  async getTTL(prefix: string, key: string): Promise<number> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);

      if (!this.redis) {
        const cached = this.memoryCache.get(cacheKey);
        if (!cached) return 0;

        const ttl = Math.ceil((cached.expiresAt - Date.now()) / 1000);
        if (ttl <= 0) {
          this.memoryCache.delete(cacheKey);
          return 0;
        }

        return ttl;
      }

      const ttl = await this.redis.ttl(cacheKey);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      console.error(`[Cache] TTL retrieval failed for ${prefix}:${key}:`, error);
      return 0;
    }
  }

  /**
   * Close Redis connection
   * Call on server shutdown
   */
  async close(): Promise<void> {
    this.memoryCache.clear();
    await this.redis?.quit();
  }

  private getCacheKey(prefix: string, key: string): string {
    return `${prefix}:${key}`;
  }
}

export default CacheService;
