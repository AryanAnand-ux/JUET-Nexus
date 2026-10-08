/**
 * Redis Caching Utilities
 * Generic cache layer for dashboard data and temporary session tokens.
 * Prevents redundant upstream requests and protects portal rate limits.
 */

import Redis from 'ioredis';

type MemoryEntry<T> = {
  data: T;
  expiresAt: number;
};

export class CacheService {
  private redis: Redis | null;
  private memoryCache = new Map<string, MemoryEntry<any>>();
  private memorySets = new Map<string, Set<string>>();

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
    const cacheKey = this.getCacheKey(prefix, key);

    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as T;
        }
      } catch (error) {
        console.error(`[Cache] Get failed for ${prefix}:${key}:`, error);
      }
    }

    const cached = this.memoryCache.get(cacheKey);
    if (!cached || cached.expiresAt <= Date.now()) {
      this.memoryCache.delete(cacheKey);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Set data in cache
   * @param prefix - Namespace prefix
   * @param key - The specific key
   * @param data - Data to cache
   * @param ttlSeconds - Time to live in seconds
   */
  async set<T>(prefix: string, key: string, data: T, ttlSeconds: number): Promise<void> {
    const cacheKey = this.getCacheKey(prefix, key);

    // Always populate in-memory cache as reliable fallback if Redis is down/unreachable
    this.memoryCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
      } catch (error) {
        console.error(`[Cache] Set failed for ${prefix}:${key}:`, error);
      }
    }
  }

  /**
   * Invalidate cache for specific key
   */
  async invalidate(prefix: string, key: string): Promise<void> {
    const cacheKey = this.getCacheKey(prefix, key);
    this.memoryCache.delete(cacheKey);

    if (this.redis) {
      try {
        await this.redis.del(cacheKey);
      } catch (error) {
        console.error(`[Cache] Invalidate failed for ${prefix}:${key}:`, error);
      }
    }
  }

  /**
   * Check if cache is valid (not expired)
   */
  async isValid(prefix: string, key: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(prefix, key);

    if (this.redis) {
      try {
        const ttl = await this.redis.ttl(cacheKey);
        if (ttl > 0) return true;
        if (ttl === -2) {
          const cached = this.memoryCache.get(cacheKey);
          return !!cached && cached.expiresAt > Date.now();
        }
      } catch (error) {
        console.error(`[Cache] TTL check failed for ${prefix}:${key}:`, error);
      }
    }

    const cached = this.memoryCache.get(cacheKey);
    if (!cached || cached.expiresAt <= Date.now()) {
      this.memoryCache.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Get remaining TTL in seconds
   */
  async getTTL(prefix: string, key: string): Promise<number> {
    const cacheKey = this.getCacheKey(prefix, key);

    if (this.redis) {
      try {
        const ttl = await this.redis.ttl(cacheKey);
        if (ttl > 0) return ttl;
      } catch (error) {
        console.error(`[Cache] TTL retrieval failed for ${prefix}:${key}:`, error);
      }
    }

    const cached = this.memoryCache.get(cacheKey);
    if (!cached) return 0;

    const ttl = Math.ceil((cached.expiresAt - Date.now()) / 1000);
    if (ttl <= 0) {
      this.memoryCache.delete(cacheKey);
      return 0;
    }

    return ttl;
  }

  /**
   * Close Redis connection
   * Call on server shutdown
   */
  async close(): Promise<void> {
    this.memoryCache.clear();
    this.memorySets.clear();
    await this.redis?.quit();
  }

  /**
   * Add a value to a Set key
   */
  async sAdd(prefix: string, key: string, value: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);
      if (!this.redis) {
        if (!this.memorySets.has(cacheKey)) {
          this.memorySets.set(cacheKey, new Set<string>());
        }
        this.memorySets.get(cacheKey)!.add(value);
        return;
      }
      await this.redis.sadd(cacheKey, value);
    } catch (error) {
      console.error(`[Cache] sAdd failed for ${prefix}:${key}:`, error);
    }
  }

  /**
   * Get all members of a Set key
   */
  async sMembers(prefix: string, key: string): Promise<string[]> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);
      if (!this.redis) {
        return Array.from(this.memorySets.get(cacheKey) || []);
      }
      return await this.redis.smembers(cacheKey);
    } catch (error) {
      console.error(`[Cache] sMembers failed for ${prefix}:${key}:`, error);
      return [];
    }
  }

  /**
   * Remove a value from a Set key
   */
  async sRem(prefix: string, key: string, value: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);
      if (!this.redis) {
        this.memorySets.get(cacheKey)?.delete(value);
        return;
      }
      await this.redis.srem(cacheKey, value);
    } catch (error) {
      console.error(`[Cache] sRem failed for ${prefix}:${key}:`, error);
    }
  }

  /**
   * Get the size (cardinality) of a Set key
   */
  async sCard(prefix: string, key: string): Promise<number> {
    try {
      const cacheKey = this.getCacheKey(prefix, key);
      if (!this.redis) {
        return this.memorySets.get(cacheKey)?.size || 0;
      }
      return await this.redis.scard(cacheKey);
    } catch (error) {
      console.error(`[Cache] sCard failed for ${prefix}:${key}:`, error);
      return 0;
    }
  }

  private getCacheKey(prefix: string, key: string): string {
    return `${prefix}:${key}`;
  }
}

export default CacheService;
