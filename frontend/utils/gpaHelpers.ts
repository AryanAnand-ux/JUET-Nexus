import type { SemesterRecord, RegisteredCourse, PerformanceData } from "@/types";

const gradeMap: Record<string, number> = {
  "A+": 10,
  "A": 9,
  "B+": 8,
  "B": 7,
  "C+": 6,
  "C": 5,
  "D": 4,
  "F": 0,
};

/**
 * Maps a grade string to its corresponding grade points.
 * Returns 0 for invalid or unknown grades.
 */
export const gradeToPoints = (grade: string): number => {
  return gradeMap[grade] !== undefined ? gradeMap[grade] : 0;
};

/**
 * Validates if a grade string is a valid grade option.
 */
export const isValidGrade = (grade: string): boolean => {
  return gradeMap[grade] !== undefined;
};

/**
 * Computes prior credits and points from previous semesters performance data.
 */
export const getPriorSemesterStats = (
  semesters: SemesterRecord[]
): { priorCredits: number; priorPoints: number } => {
  if (!semesters || semesters.length === 0) {
    return { priorCredits: 0, priorPoints: 0 };
  }

  return semesters.reduce(
    (acc, sem) => {
      const credits = sem.credits || 0;
      const sgpa = sem.sgpa || 0;
      return {
        priorCredits: acc.priorCredits + credits,
        priorPoints: acc.priorPoints + sgpa * credits,
      };
    },
    { priorCredits: 0, priorPoints: 0 }
  );
};

/**
 * Calculates current semester SGPA based on selected grades and credits.
 * Skips courses with unselected or invalid grades.
 */
export const calculateCurrentSemesterSgpa = (
  courses: { credits: number; grade: string }[]
): number => {
  let totalCredits = 0;
  let totalPoints = 0;

  for (const course of courses) {
    if (course.grade && isValidGrade(course.grade)) {
      const points = gradeToPoints(course.grade);
      totalCredits += course.credits;
      totalPoints += points * course.credits;
    }
  }

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
};

/**
 * Predicts cumulative CGPA by merging prior semester stats and current semester predicted SGPA.
 * Falls back to current semester SGPA if there are no prior semesters.
 */
export const calculatePredictedCgpa = (
  priorCredits: number,
  priorPoints: number,
  currentCredits: number,
  currentSgpa: number
): number => {
  const totalCredits = priorCredits + currentCredits;
  if (totalCredits === 0) {
    return 0;
  }

  if (priorCredits === 0) {
    return currentSgpa;
  }

  const currentPoints = currentSgpa * currentCredits;
  return (priorPoints + currentPoints) / totalCredits;
};

/**
 * Predicts current SGPA and cumulative CGPA dynamically based on selected course grades.
 */
export const predictAcademicStanding = (
  courses: RegisteredCourse[],
  selectedGrades: Record<string, string>,
  performance: PerformanceData
): { currentCreditsSum: number; predictedSgpa: number; predictedCgpa: number } => {
  const coursesWithGrades = courses.map((course) => ({
    credits: course.credits,
    grade: selectedGrades[course.code] || "",
  }));

  const gradedCourses = coursesWithGrades.filter(
    (c) => c.grade && isValidGrade(c.grade)
  );
  const currentCreditsSum = gradedCourses.reduce((sum, c) => sum + c.credits, 0);

  const predictedSgpa = calculateCurrentSemesterSgpa(coursesWithGrades);

  const semesters = performance?.semesters || [];
  const { priorCredits, priorPoints } = getPriorSemesterStats(
    semesters
  );

  const predictedCgpa = calculatePredictedCgpa(
    priorCredits,
    priorPoints,
    currentCreditsSum,
    predictedSgpa
  );

  return {
    currentCreditsSum,
    predictedSgpa,
    predictedCgpa,
  };
};
