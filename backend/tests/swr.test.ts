import { getRandomUserAgent } from '../src/utils/userAgent';

// Inlined from deleted src/utils/delay.ts (not used in production code)
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function withJitter<T>(
  fn: () => Promise<T>,
  minMs = 100,
  maxMs = 500
): Promise<T> {
  const delayTime = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delayTime);
  return fn();
}

describe('Anti-Scraping Utilities', () => {
  describe('User-Agent Rotation', () => {
    it('should return a modern User-Agent string', () => {
      const ua = getRandomUserAgent();
      expect(typeof ua).toBe('string');
      expect(ua.length).toBeGreaterThan(20);
      expect(ua).toContain('Mozilla/5.0');
    });

    it('should rotate user agents randomly', () => {
      const first = getRandomUserAgent();
      let rotated = false;
      // Fetch multiple times to verify randomness/variety
      for (let i = 0; i < 50; i++) {
        if (getRandomUserAgent() !== first) {
          rotated = true;
          break;
        }
      }
      expect(rotated).toBe(true);
    });
  });

  describe('Request Jitter / Delay Utility', () => {
    it('should delay execution by approximately the given milliseconds', async () => {
      const start = Date.now();
      await sleep(150);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(130); // Allow slight scheduler variance
    });

    it('should execute wrapped function with jitter delay', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const start = Date.now();
      const result = await withJitter(mockFn, 100, 200);
      const elapsed = Date.now() - start;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(elapsed).toBeGreaterThanOrEqual(80); // Min 100ms with scheduler buffer
    });
  });
});
