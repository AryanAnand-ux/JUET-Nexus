/**
 * Unit Tests for Redis Cache
 * 15-minute TTL caching layer for dashboard data
 */

import { CacheService } from '../src/utils/cache';
import type { DashboardResponse } from '../../shared/types';

// Mock Redis for testing
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn(),
    quit: jest.fn(),
  }));
});

describe('CacheService', () => {
  let cache: CacheService;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new CacheService('redis://localhost:6379');
    mockRedis = cache['redis'];
  });

  afterEach(async () => {
    await cache.close();
  });

  const mockDashboardData: DashboardResponse = {
    student: {
      name: 'Aryan Anand',
      enrollment: '24BCS100',
      branch: 'CSE',
    },
    attendance: [
      {
        subject: 'Data Structures',
        percentage: 82.5,
        lecturePercent: 82.5,
        tutorialPercent: 0,
        practicalPercent: 0,
        classesHeld: 40,
        classesAttended: 33,
        safeBunksLeft: 4,
        detailLink: 'https://...',
      },
    ],
    performance: {
      currentSgpa: 8.4,
      cgpa: 8.2,
      recentMarks: [],
      semesters: [],
    },
    notices: [
      {
        title: 'Scholarship Form',
        date: '2025-06-15',
        link: 'https://...',
      },
    ],
  };

  describe('get', () => {
    it('should retrieve cached data', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockDashboardData));

      const result = await cache.get('dashboard', '24BCS100');

      expect(result).toEqual(mockDashboardData);
      expect(mockRedis.get).toHaveBeenCalledWith('dashboard:24BCS100');
    });

    it('should return null for missing cache', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get('dashboard', '24BCS100');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cache.get('dashboard', '24BCS100');

      expect(result).toBeNull();
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedis.get.mockResolvedValue('invalid json');

      const result = await cache.get('dashboard', '24BCS100');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should cache data with TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await cache.set('dashboard', '24BCS100', mockDashboardData, 900);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'dashboard:24BCS100',
        900,
        JSON.stringify(mockDashboardData)
      );
    });

    it('should handle Redis errors during set', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis write failed'));

      // Should not throw, just log
      await expect(cache.set('dashboard', '24BCS100', mockDashboardData, 900)).resolves.toBeUndefined();
    });

    it('should use 15-minute TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await cache.set('dashboard', '24BCS100', mockDashboardData, 900);

      const ttlArg = mockRedis.setex.mock.calls[0][1];
      expect(ttlArg).toBe(15 * 60); // 900 seconds
    });
  });

  describe('invalidate', () => {
    it('should delete cache entry', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cache.invalidate('dashboard', '24BCS100');

      expect(mockRedis.del).toHaveBeenCalledWith('dashboard:24BCS100');
    });

    it('should handle errors during invalidate', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis delete failed'));

      // Should not throw
      await expect(cache.invalidate('dashboard', '24BCS100')).resolves.toBeUndefined();
    });
  });

  describe('isValid', () => {
    it('should return true for valid cache', async () => {
      mockRedis.ttl.mockResolvedValue(300); // 5 minutes remaining

      const result = await cache.isValid('dashboard', '24BCS100');

      expect(result).toBe(true);
    });

    it('should return false for expired cache', async () => {
      mockRedis.ttl.mockResolvedValue(-2); // Key does not exist

      const result = await cache.isValid('dashboard', '24BCS100');

      expect(result).toBe(false);
    });

    it('should return false for errors', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('Redis error'));

      const result = await cache.isValid('dashboard', '24BCS100');

      expect(result).toBe(false);
    });
  });

  describe('getTTL', () => {
    it('should return remaining TTL in seconds', async () => {
      mockRedis.ttl.mockResolvedValue(450); // 7.5 minutes

      const ttl = await cache.getTTL('dashboard', '24BCS100');

      expect(ttl).toBe(450);
    });

    it('should return 0 for expired or missing keys', async () => {
      mockRedis.ttl.mockResolvedValue(-2);

      const ttl = await cache.getTTL('dashboard', '24BCS100');

      expect(ttl).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('Redis error'));

      const ttl = await cache.getTTL('dashboard', '24BCS100');

      expect(ttl).toBe(0);
    });
  });

  describe('Cache Key Generation', () => {
    it('should use correct cache key format', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cache.get('dashboard', '24BCS100');

      expect(mockRedis.get).toHaveBeenCalledWith('dashboard:24BCS100');
    });

    it('should support different enrollments', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cache.get('dashboard', '24BCS101');

      expect(mockRedis.get).toHaveBeenCalledWith('dashboard:24BCS101');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle cache miss → set → get', async () => {
      // Miss
      mockRedis.get.mockResolvedValueOnce(null);
      let result = await cache.get('dashboard', '24BCS100');
      expect(result).toBeNull();

      // Set
      mockRedis.setex.mockResolvedValue('OK');
      await cache.set('dashboard', '24BCS100', mockDashboardData, 900);

      // Hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockDashboardData));
      result = await cache.get('dashboard', '24BCS100');
      expect(result).toEqual(mockDashboardData);
    });

    it('should invalidate and refetch', async () => {
      // Initial hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockDashboardData));
      let result = await cache.get('dashboard', '24BCS100');
      expect(result).toEqual(mockDashboardData);

      // Invalidate
      mockRedis.del.mockResolvedValue(1);
      await cache.invalidate('dashboard', '24BCS100');

      // Miss after invalidate
      mockRedis.get.mockResolvedValueOnce(null);
      result = await cache.get('dashboard', '24BCS100');
      expect(result).toBeNull();
    });

    it('should check TTL remaining', async () => {
      mockRedis.ttl.mockResolvedValueOnce(900); // Full TTL
      mockRedis.ttl.mockResolvedValueOnce(300); // 5 minutes left
      mockRedis.ttl.mockResolvedValueOnce(60);  // 1 minute left

      let ttl = await cache.getTTL('dashboard', '24BCS100');
      expect(ttl).toBe(900);

      ttl = await cache.getTTL('dashboard', '24BCS100');
      expect(ttl).toBe(300);

      ttl = await cache.getTTL('dashboard', '24BCS100');
      expect(ttl).toBe(60);
    });
  });

  describe('Error Handling', () => {
    it('should ignore operations gracefully on redis errors', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));
      mockRedis.setex.mockRejectedValue(new Error('Write failed'));
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));
      mockRedis.ttl.mockRejectedValue(new Error('Query failed'));

      await expect(cache.get('dashboard', '24BCS100')).resolves.toBeNull();
      await expect(cache.set('dashboard', '24BCS100', mockDashboardData, 900)).resolves.toBeUndefined();
      await expect(cache.invalidate('dashboard', '24BCS100')).resolves.toBeUndefined();
      await expect(cache.isValid('dashboard', '24BCS100')).resolves.toBe(false);
      await expect(cache.getTTL('dashboard', '24BCS100')).resolves.toBe(0);
    });
  });
});
