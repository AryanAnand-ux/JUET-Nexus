import { calculateBunkStatus } from '../../frontend/utils/bunkHelpers';


describe('Bunk Planner Helpers', () => {
  describe('calculateBunkStatus', () => {
    it('should compute safe skips when above target', () => {
      // 15 attended, 16 held -> target 75% -> safe skip is 4 classes
      const result = calculateBunkStatus(15, 16, 75);
      expect(result.status).toBe('safe');
      expect(result.count).toBe(4);
    });

    it('should compute must attends when below target', () => {
      // 10 attended, 16 held -> target 75% -> must attend 8 classes
      const result = calculateBunkStatus(10, 16, 75);
      expect(result.status).toBe('critical');
      expect(result.count).toBe(8);
    });

    it('should handle being exactly at target', () => {
      // 12 attended, 16 held -> target 75% -> safe skip is 0 classes. 75% is caution.
      const result = calculateBunkStatus(12, 16, 75);
      expect(result.status).toBe('caution');
      expect(result.count).toBe(0);
    });

    it('should classify against the caller-supplied target, not hardcoded 85/75', () => {
      // 13 attended, 20 held -> 65% with target 60% -> above target, but within
      // the 10-point cushion, so caution (never critical). Regression test for the
      // previous hardcoded 85/75 thresholds that returned 'critical' here.
      const result = calculateBunkStatus(13, 20, 60);
      expect(result.status).toBe('caution');
      // floor(100 * 13 / 60) = 21 max held; 21 - 20 = 1 safe skip
      expect(result.count).toBe(1);
    });

    it('should mark a custom target as safe with a comfortable cushion', () => {
      // 8 attended, 10 held -> 80% with target 60% -> >= target + 10 -> safe
      const result = calculateBunkStatus(8, 10, 60);
      expect(result.status).toBe('safe');
      // floor(100 * 8 / 60) = 13 max held; 13 - 10 = 3 safe skips
      expect(result.count).toBe(3);
    });
  });

  describe('calculateBunkStatus brute-force cross-check', () => {
    const targets = [50, 60, 70, 75, 80, 90, 100];

    it('matches an exhaustive integer reference for safe skips and must-attends', () => {
      for (const target of targets) {
        for (let held = 1; held <= 40; held++) {
          for (let attended = 0; attended <= held; attended++) {
            const percentage = (attended / held) * 100;
            const result = calculateBunkStatus(attended, held, target);
            const label = { attended, held, target, count: result.count };

            if (percentage >= target) {
              let safeSkips = 0;
              while (100 * attended >= target * (held + safeSkips + 1)) safeSkips++;
              expect(result.status === 'safe' || result.status === 'caution').toBe(true);
              expect(label).toEqual({ attended, held, target, count: safeSkips });
            } else {
              let mustAttend = 0;
              while (
                mustAttend < 100000 &&
                100 * (attended + mustAttend) < target * (held + mustAttend)
              ) {
                mustAttend++;
              }
              expect(result.status).toBe('critical');
              expect(label).toEqual({
                attended,
                held,
                target,
                count: mustAttend >= 100000 ? Infinity : mustAttend,
              });
            }
          }
        }
      }
    });
  });
});
