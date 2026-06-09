import { computeScenarioPercentage, calculateBunkStatus } from './bunkHelpers';

describe('Bunk Planner Helpers', () => {
  describe('computeScenarioPercentage', () => {
    it('should calculate scenario percentage correctly', () => {
      // (15 + 3) / (16 + 2 + 3) = 18 / 21 = ~85.71%
      expect(computeScenarioPercentage(15, 16, 2, 3)).toBeCloseTo(85.71, 1);
      // (10 + 0) / (16 + 0 + 0) = 10 / 16 = 62.5%
      expect(computeScenarioPercentage(10, 16, 0, 0)).toBe(62.5);
    });

    it('should handle zero classes held safely', () => {
      expect(computeScenarioPercentage(0, 0, 0, 0)).toBe(0);
    });
  });

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
  });
});
