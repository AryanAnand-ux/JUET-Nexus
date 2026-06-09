import {
  gradeToPoints,
  getPriorSemesterStats,
  calculateCurrentSemesterSgpa,
  calculatePredictedCgpa,
  predictAcademicStanding
} from '../../frontend/utils/gpaHelpers';
import type { RegisteredCourse, PerformanceData } from '../../shared/types';

describe('GPA Predictor Helpers', () => {
  describe('gradeToPoints', () => {
    it('should map grades to correct points', () => {
      expect(gradeToPoints('A+')).toBe(10);
      expect(gradeToPoints('A')).toBe(9);
      expect(gradeToPoints('B+')).toBe(8);
      expect(gradeToPoints('B')).toBe(7);
      expect(gradeToPoints('C+')).toBe(6);
      expect(gradeToPoints('C')).toBe(5);
      expect(gradeToPoints('D')).toBe(4);
      expect(gradeToPoints('F')).toBe(0);
    });

    it('should return 0 for unknown grades', () => {
      expect(gradeToPoints('')).toBe(0);
      expect(gradeToPoints('Z')).toBe(0);
    });
  });

  describe('getPriorSemesterStats', () => {
    it('should sum credits and calculate points correctly', () => {
      const semesters = [
        { semester: 1, sgpa: 8.5, cgpa: 8.5, credits: 20, earnedCredits: 20 },
        { semester: 2, sgpa: 9.0, cgpa: 8.75, credits: 20, earnedCredits: 20 }
      ];
      const stats = getPriorSemesterStats(semesters);
      // priorCredits = 20 + 20 = 40
      // priorPoints = (8.5 * 20) + (9.0 * 20) = 170 + 180 = 350
      expect(stats.priorCredits).toBe(40);
      expect(stats.priorPoints).toBe(350);
    });

    it('should handle empty semesters array', () => {
      const stats = getPriorSemesterStats([]);
      expect(stats.priorCredits).toBe(0);
      expect(stats.priorPoints).toBe(0);
    });
  });

  describe('calculateCurrentSemesterSgpa', () => {
    it('should compute SGPA from course grades and credits', () => {
      const courses = [
        { credits: 4, grade: 'A+' }, // 10 * 4 = 40
        { credits: 3, grade: 'B' },  // 7 * 3 = 21
        { credits: 2, grade: 'C+' }, // 6 * 2 = 12
        { credits: 1, grade: 'F' }   // 0 * 1 = 0
      ];
      // Total points = 73, Total credits = 10
      // SGPA = 7.3
      expect(calculateCurrentSemesterSgpa(courses)).toBe(7.3);
    });

    it('should skip courses with unselected or invalid grades', () => {
      const courses = [
        { credits: 4, grade: 'A' },          // 9 * 4 = 36
        { credits: 3, grade: 'Select Grade' }, // Skip
        { credits: 3, grade: '' }            // Skip
      ];
      // Total points = 36, Total credits = 4
      // SGPA = 9.0
      expect(calculateCurrentSemesterSgpa(courses)).toBe(9.0);
    });

    it('should return 0 if there are no courses or no valid grades', () => {
      expect(calculateCurrentSemesterSgpa([])).toBe(0);
      expect(calculateCurrentSemesterSgpa([{ credits: 3, grade: '' }])).toBe(0);
    });
  });

  describe('calculatePredictedCgpa', () => {
    it('should compute combined CGPA when prior semesters exist', () => {
      // Prior credits = 40, Prior points = 350
      // Current credits = 10, Current SGPA = 8.0 -> Current points = 80
      // Predicted CGPA = (350 + 80) / (40 + 10) = 430 / 50 = 8.6
      expect(calculatePredictedCgpa(40, 350, 10, 8.0)).toBe(8.6);
    });

    it('should fallback to current SGPA if there are no prior semesters', () => {
      expect(calculatePredictedCgpa(0, 0, 10, 8.5)).toBe(8.5);
    });

    it('should return 0 if both prior and current credits are 0', () => {
      expect(calculatePredictedCgpa(0, 0, 0, 0)).toBe(0);
    });
  });

  describe('predictAcademicStanding', () => {
    it('should predict SGPA and CGPA correctly for a set of courses and selected grades', () => {
      const courses: RegisteredCourse[] = [
        { code: 'CS101', title: 'Intro to CS', type: 'Theory', credits: 4 },
        { code: 'CS102', title: 'Intro to CS Lab', type: 'Practical', credits: 2 },
        { code: 'MA101', title: 'Mathematics I', type: 'Theory', credits: 4 }
      ];
      const selectedGrades = {
        'CS101': 'A+', // 10 * 4 = 40
        'CS102': 'B+', // 8 * 2 = 16
        'MA101': 'A'   // 9 * 4 = 36
      };
      const performance: PerformanceData = {
        currentSgpa: 0,
        cgpa: 8.0,
        semesters: [
          { semester: 1, sgpa: 8.0, cgpa: 8.0, credits: 20, earnedCredits: 20 }
        ]
      };
      const result = predictAcademicStanding(courses, selectedGrades, performance);
      expect(result.currentCreditsSum).toBe(10);
      expect(result.predictedSgpa).toBeCloseTo(9.2, 2);
      expect(result.predictedCgpa).toBeCloseTo(8.4, 2);
    });
  });
});
