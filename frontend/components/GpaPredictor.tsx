/**
 * GPA Predictor Component
 * Interactive GPA simulator with premium glassmorphic widgets and Burgundy / Indigo / Lavender theme.
 */

"use client";

import React, { useState } from "react";
import { FigmaCard } from "./FigmaCard";
import type { RegisteredCourse, PerformanceData } from "@/types";
import { 
  predictAcademicStanding, 
  getPriorSemesterStats 
} from "@/utils/gpaHelpers";
import { 
  Calculator, 
  Sparkles, 
  RotateCcw, 
  Info, 
  TrendingUp, 
  Award 
} from "lucide-react";

export interface GpaPredictorProps {
  courses: RegisteredCourse[];
  performance: PerformanceData;
}

const GRADE_OPTIONS = [
  { label: "A+ (10)", value: "A+" },
  { label: "A (9)", value: "A" },
  { label: "B+ (8)", value: "B+" },
  { label: "B (7)", value: "B" },
  { label: "C+ (6)", value: "C+" },
  { label: "C (5)", value: "C" },
  { label: "D (4)", value: "D" },
  { label: "F (0)", value: "F" }
];

export const GpaPredictor: React.FC<GpaPredictorProps> = ({
  courses = [],
  performance
}) => {
  // Initialize all course grades to "" (Select Grade)
  const [selectedGrades, setSelectedGrades] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    courses.forEach(c => {
      initial[c.code] = "";
    });
    return initial;
  });

  // Handle individual course grade selection
  const handleGradeChange = (courseCode: string, grade: string) => {
    setSelectedGrades(prev => ({
      ...prev,
      [courseCode]: grade
    }));
  };

  // Bulk grade actions for simulation
  const setBulkGrades = (grade: string) => {
    const updated: Record<string, string> = {};
    courses.forEach(c => {
      updated[c.code] = grade;
    });
    setSelectedGrades(updated);
  };

  const resetAllGrades = () => {
    const updated: Record<string, string> = {};
    courses.forEach(c => {
      updated[c.code] = "";
    });
    setSelectedGrades(updated);
  };

  // Run predictions
  const { currentCreditsSum, predictedSgpa, predictedCgpa } = predictAcademicStanding(
    courses,
    selectedGrades,
    performance
  );

  // Total credits in the registered list
  const totalSemCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  // Prior stats for tooltip / details card
  const { priorCredits, priorPoints } = getPriorSemesterStats(performance?.semesters || []);
  const hasPriorSemesters = priorCredits > 0;

  // Grade standing descriptions and styling
  const getGpaStanding = (gpa: number) => {
    if (gpa >= 9.0) {
      return {
        label: "Outstanding (A+ Range)",
        gradient: "from-emerald-500/20 via-green-500/10 to-transparent border-emerald-500/30",
        text: "text-emerald-700",
        bg: "bg-emerald-50 text-emerald-800 border-emerald-100",
        badge: "Outstanding"
      };
    }
    if (gpa >= 8.0) {
      return {
        label: "Excellent (A Range)",
        gradient: "from-indigo-500/20 via-violet-500/10 to-transparent border-indigo-500/30",
        text: "text-indigo-700",
        bg: "bg-indigo-50 text-indigo-800 border-indigo-100",
        badge: "Excellent"
      };
    }
    if (gpa >= 7.0) {
      return {
        label: "Good standing (B Range)",
        gradient: "from-amber-500/20 via-yellow-500/10 to-transparent border-amber-500/30",
        text: "text-amber-700",
        bg: "bg-amber-50 text-amber-800 border-amber-100",
        badge: "Good"
      };
    }
    if (gpa > 0) {
      return {
        label: "Below Average (C/D/F Range)",
        gradient: "from-rose-500/20 via-red-500/10 to-transparent border-rose-500/30",
        text: "text-rose-700",
        bg: "bg-rose-50 text-rose-800 border-rose-100",
        badge: "Needs Attention"
      };
    }
    return {
      label: "Pending selection",
      gradient: "from-slate-100 to-transparent border-slate-200",
      text: "text-slate-400",
      bg: "bg-slate-50 text-slate-500 border-slate-200",
      badge: "No Data"
    };
  };

  const sgpaStanding = getGpaStanding(predictedSgpa);
  const cgpaStanding = getGpaStanding(predictedCgpa);

  return (
    <FigmaCard
      heading={
        <span className="flex items-center text-slate-900 font-extrabold text-lg md:text-xl font-nunito tracking-tight">
          <Calculator className="w-6 h-6 mr-2 text-indigo-600" /> GPA Predictor — Interactive Simulator
        </span>
      }
      className="border border-slate-200/80 shadow-md rounded-[24px] p-6 md:p-8 bg-gradient-to-tr from-white via-slate-50/50 to-indigo-50/10 relative overflow-hidden"
    >
      {/* Visual background accents */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-figma-lavender-light/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Grid: Left side interactive list, Right side glassmorphic predictions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Interactive Courses Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Registered Courses List
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulate grades for each course in the current semester.
              </p>
            </div>
            {/* Quick action buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBulkGrades("A+")}
                className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/70 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
              >
                All A+
              </button>
              <button
                type="button"
                onClick={() => setBulkGrades("A")}
                className="text-[10px] font-extrabold text-figma-purple bg-figma-lavender-light border border-figma-lavender-medium/20 hover:bg-brutal-lavender px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
              >
                All A
              </button>
              <button
                type="button"
                onClick={() => setBulkGrades("B+")}
                className="text-[10px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
              >
                All B+
              </button>
              <button
                type="button"
                onClick={resetAllGrades}
                title="Reset simulation"
                className="p-1.5 text-slate-400 hover:text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-all active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-12 bg-white/50 border border-slate-100 rounded-[20px]">
              <p className="text-sm font-medium text-slate-400 font-nunito">
                No registered courses available to simulate.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
              {courses.map((course) => (
                <div
                  key={course.code}
                  className={`group bg-white hover:bg-slate-50/50 border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-200 shadow-sm ${
                    selectedGrades[course.code]
                      ? "border-indigo-100 bg-indigo-50/5"
                      : "border-slate-200/80"
                  }`}
                >
                  <div className="space-y-1 truncate max-w-full sm:max-w-[65%]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-md font-mono">
                        {course.code}
                      </span>
                      <span className="text-[10px] font-bold text-figma-gray bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md">
                        {course.type}
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors truncate">
                      {course.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 font-nunito bg-slate-50 border border-slate-250/30 px-2.5 py-1 rounded-xl">
                      {course.credits} Credits
                    </span>
                    
                    {/* Grade Selector */}
                    <div className="relative">
                      <select
                        aria-label={`Select grade for ${course.title}`}
                        value={selectedGrades[course.code] || ""}
                        onChange={(e) => handleGradeChange(course.code, e.target.value)}
                        className={`text-xs font-bold rounded-xl border px-3 py-2 pr-8 appearance-none bg-white cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-nunito ${
                          selectedGrades[course.code]
                            ? "border-indigo-200 bg-indigo-50/30 text-indigo-700 font-extrabold"
                            : "border-slate-200 text-slate-500"
                        }`}
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569' stroke-width='3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`,
                          backgroundPosition: 'right 10px center',
                          backgroundSize: '12px',
                          backgroundRepeat: 'no-repeat'
                        }}
                      >
                        <option value="">Select Grade</option>
                        {GRADE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Prediction Cards (Glassmorphism) */}
        <div className="lg:col-span-5 space-y-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Predictions Standing
          </p>

          {/* SGPA and CGPA widget layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            
            {/* Predicted SGPA Card */}
            <div className={`relative overflow-hidden bg-white/70 backdrop-blur-md border rounded-[22px] p-5 shadow-lg transition-all hover:scale-[1.01] duration-300 bg-gradient-to-tr ${sgpaStanding.gradient}`}>
              <div className="absolute top-3 right-3 text-slate-300">
                <Sparkles className="w-5 h-5 text-indigo-400/60" />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Predicted SGPA
              </p>
              <p className={`text-4xl font-black font-nunito tracking-tight ${predictedSgpa > 0 ? sgpaStanding.text : 'text-slate-400'}`}>
                {predictedSgpa > 0 ? predictedSgpa.toFixed(2) : "0.00"}
              </p>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border font-nunito ${sgpaStanding.bg}`}>
                  {sgpaStanding.badge}
                </span>
                <span className="text-[10px] text-slate-400 font-bold font-nunito">
                  {currentCreditsSum} / {totalSemCredits} Credits Graded
                </span>
              </div>
            </div>

            {/* Predicted Cumulative CGPA Card */}
            <div className={`relative overflow-hidden bg-white/70 backdrop-blur-md border rounded-[22px] p-5 shadow-lg transition-all hover:scale-[1.01] duration-300 bg-gradient-to-tr ${cgpaStanding.gradient}`}>
              <div className="absolute top-3 right-3 text-slate-300">
                <TrendingUp className="w-5 h-5 text-indigo-400/60" />
              </div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Predicted CGPA
              </p>
              <p className={`text-4xl font-black font-nunito tracking-tight ${predictedCgpa > 0 ? cgpaStanding.text : 'text-slate-400'}`}>
                {predictedCgpa > 0 ? predictedCgpa.toFixed(2) : "0.00"}
              </p>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border font-nunito ${cgpaStanding.bg}`}>
                  {cgpaStanding.badge}
                </span>
                {hasPriorSemesters && (
                  <span className="text-[10px] text-slate-400 font-bold font-nunito">
                    Prior CGPA: {performance.cgpa.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Aggregation Detail Cards */}
          <div className="bg-white/40 backdrop-blur-md border border-slate-200/50 rounded-2xl p-5 shadow-sm space-y-4">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-150/40 pb-2">
              <Award className="w-4 h-4 text-indigo-500" /> Calculation breakdown
            </h5>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between font-nunito">
                <span className="font-bold text-slate-400">Prior Semesters Credits:</span>
                <span className="font-extrabold text-slate-700">{priorCredits}</span>
              </div>
              {hasPriorSemesters && (
                <div className="flex justify-between font-nunito">
                  <span className="font-bold text-slate-400">Prior Aggregated Points:</span>
                  <span className="font-extrabold text-slate-700">{priorPoints.toFixed(1)}</span>
                </div>
              )}
              <div className="flex justify-between font-nunito">
                <span className="font-bold text-slate-400">Current Simulated Credits:</span>
                <span className="font-extrabold text-slate-700">{currentCreditsSum}</span>
              </div>
              <div className="flex justify-between font-nunito border-t border-slate-100 pt-2.5">
                <span className="font-extrabold text-slate-500">Cumulative Total Credits:</span>
                <span className="font-extrabold text-indigo-600">{priorCredits + currentCreditsSum}</span>
              </div>
            </div>

            {!hasPriorSemesters && (
              <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-medium text-indigo-700 leading-relaxed font-nunito">
                  <strong>First-Semester Fallback active:</strong> No prior semester history found. The SGPA of the current semester is used directly as the predicted CGPA.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
    </FigmaCard>
  );
};

GpaPredictor.displayName = "GpaPredictor";
