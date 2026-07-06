import Redis from 'ioredis';
import { config } from '../../config/env';

// Create a single shared Redis client for general caching
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ if shared connection is used, but we'll use URL string for BullMQ connections
});

const CACHE_PREFIX = 'task:status:';

export class RedisCache {
  /**
   * Get cached data for a task
   */
  static async get(id: string): Promise<any | null> {
    try {
      const val = await redis.get(`${CACHE_PREFIX}${id}`);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.error('[Redis Cache] Get error:', err);
      return null;
    }
  }

  /**
   * Cache task data with a default TTL of 45 seconds (within the 30-60 sec range)
   */
  static async set(id: string, data: any, ttlSeconds: number = 45): Promise<void> {
    try {
      await redis.set(`${CACHE_PREFIX}${id}`, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (err) {
      console.error('[Redis Cache] Set error:', err);
    }
  }

  /**
   * Invalidate a cached task
   */
  static async invalidate(id: string): Promise<void> {
    try {
      await redis.del(`${CACHE_PREFIX}${id}`);
    } catch (err) {
      console.error('[Redis Cache] Invalidate error:', err);
    }
  }
}
