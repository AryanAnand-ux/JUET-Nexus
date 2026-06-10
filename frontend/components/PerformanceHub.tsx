/**
 * Performance Hub Component
 * Modern dashboard display for Academic standing (SGPA, CGPA, recent marks)
 */

"use client";

import React, { useState } from "react";
import { FigmaCard } from "./base";
import type { PerformanceData, DetailedCourseMarks } from "@/types";
import { TrendingUp, ClipboardList, BarChart2, Lightbulb, GraduationCap, X, Info } from "lucide-react";
import { PerformanceChart } from "./PerformanceChart";

export interface PerformanceHubProps {
  performance: PerformanceData;
  detailedMarks?: DetailedCourseMarks[];
}

export const PerformanceHub: React.FC<PerformanceHubProps> = ({
  performance,
  detailedMarks = [],
}) => {
  const [selectedCourseMarks, setSelectedCourseMarks] = useState<DetailedCourseMarks | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedMarks, setSimulatedMarks] = useState<Record<string, number>>({});

  const handleMarkClick = (subjectName: string) => {
    if (!detailedMarks) return;
    const match = detailedMarks.find(
      (m) =>
        m.subject.toLowerCase() === subjectName.toLowerCase() ||
        subjectName.toLowerCase().includes(m.subject.toLowerCase()) ||
        m.subject.toLowerCase().includes(subjectName.toLowerCase())
    );
    if (match) {
      setSelectedCourseMarks(match);
      setIsSimulating(false);
      const initial: Record<string, number> = {};
      if (match.components) {
        match.components.forEach((c) => {
          initial[c.name] = c.obtained;
        });
      }
      setSimulatedMarks(initial);
      setIsModalOpen(true);
    }
  };

  const handleSimulatedMarkChange = (name: string, value: number) => {
    setSimulatedMarks((prev) => ({
      ...prev,
      [name]: isNaN(value) ? 0 : value,
    }));
  };

  const getSimulatedTotal = () => {
    return Object.values(simulatedMarks).reduce((acc, val) => acc + val, 0);
  };

  const getProjectedGrade = (marks: number): string => {
    if (marks >= 80) return "A+";
    if (marks >= 75) return "A";
    if (marks >= 70) return "B+";
    if (marks >= 65) return "B";
    if (marks >= 60) return "C+";
    if (marks >= 50) return "C";
    if (marks >= 40) return "D";
    return "F";
  };
  const getGradeTheme = (gpa: number): { cardBg: string; textClass: string; labelClass: string; badge: string } => {
    if (gpa >= 8.5) {
      return {
        cardBg: "from-green-500/10 via-emerald-500/5 to-transparent border-green-200/60 dark:border-green-800/30",
        textClass: "text-green-700 dark:text-green-450",
        labelClass: "text-green-800 dark:text-green-300",
        badge: "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-850/40"
      };
    }
    if (gpa >= 7.5) {
      return {
        cardBg: "from-accent-primary/10 via-accent-primary/5 to-transparent border-accent-primary/20 dark:border-accent-primary/20",
        textClass: "text-accent-primary dark:text-accent-primary",
        labelClass: "text-accent-primary dark:text-accent-primary/80",
        badge: "bg-accent-light text-accent-primary border-accent-primary/20"
      };
    }
    if (gpa >= 6.5) {
      return {
        cardBg: "from-amber-500/10 via-yellow-500/5 to-transparent border-amber-200/60 dark:border-amber-800/30",
        textClass: "text-amber-700 dark:text-amber-450",
        labelClass: "text-amber-800 dark:text-amber-300",
        badge: "bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-850/40"
      };
    }
    return {
      cardBg: "from-rose-500/10 via-red-500/5 to-transparent border-rose-200/60 dark:border-rose-800/30",
      textClass: "text-rose-700 dark:text-rose-450",
      labelClass: "text-rose-800 dark:text-rose-300",
      badge: "bg-rose-100 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-850/40"
    };
  };

  const getGradeLabel = (gpa: number): string => {
    if (gpa >= 9.0) return "A+ (Excellent)";
    if (gpa >= 8.5) return "A (Very Good)";
    if (gpa >= 8.0) return "A- (Good)";
    if (gpa >= 7.5) return "B+ (Very Good)";
    if (gpa >= 7.0) return "B (Good)";
    if (gpa >= 6.5) return "B- (Average)";
    if (gpa >= 6.0) return "C (Satisfactory)";
    return "C- (Below Average)";
  };

  const currentTheme = getGradeTheme(performance.currentSgpa);
  const cgpaTheme = getGradeTheme(performance.cgpa);

  return (
    <FigmaCard
      heading={
        <span className="flex items-center text-slate-800 dark:text-slate-100 font-extrabold text-lg md:text-xl font-nunito tracking-tight">
          <GraduationCap className="w-6 h-6 mr-2 text-accent-primary" /> Performance Hub — Academic Standing
        </span>
      }
      className="border border-slate-200/80 dark:border-slate-800 shadow-md rounded-[24px] p-6 md:p-8"
    >
      {/* Dynamic Performance Chart */}
      {performance.semesters && performance.semesters.length > 0 && (
        <div className="mb-8 border-b border-slate-100 dark:border-slate-800/60 pb-8">
          <PerformanceChart semesters={performance.semesters} />
        </div>
      )}
      {/* SGPA and CGPA Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Current SGPA */}
        <div
          className={`relative overflow-hidden bg-gradient-to-tr ${currentTheme.cardBg} border rounded-[22px] p-6 text-center transition-all hover:shadow-md hover:scale-[1.01] duration-300`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Current SGPA
          </p>
          <p className={`text-5xl font-black mb-2 font-nunito tracking-tight ${currentTheme.textClass}`}>
            {performance.currentSgpa.toFixed(2)}
          </p>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border font-nunito ${currentTheme.badge}`}>
            {getGradeLabel(performance.currentSgpa)}
          </span>
        </div>

        {/* Cumulative CGPA */}
        <div
          className={`relative overflow-hidden bg-gradient-to-tr ${cgpaTheme.cardBg} border rounded-[22px] p-6 text-center transition-all hover:shadow-md hover:scale-[1.01] duration-300`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Cumulative CGPA
          </p>
          <p className={`text-5xl font-black mb-2 font-nunito tracking-tight ${cgpaTheme.textClass}`}>
            {performance.cgpa.toFixed(2)}
          </p>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border font-nunito ${cgpaTheme.badge}`}>
            {getGradeLabel(performance.cgpa)}
          </span>
        </div>
      </div>

      {/* Recent Marks */}
      {performance.recentMarks && performance.recentMarks.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center">
            <ClipboardList className="w-4 h-4 mr-2 text-accent-primary" /> Recent Marks & Evaluations
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {performance.recentMarks.map((mark, idx) => {
              const hasDetails = detailedMarks.some(
                (m) =>
                  m.subject.toLowerCase() === mark.subject.toLowerCase() ||
                  mark.subject.toLowerCase().includes(m.subject.toLowerCase()) ||
                  m.subject.toLowerCase().includes(mark.subject.toLowerCase())
              );

              return (
                <button
                  key={`${mark.subject}-${idx}`}
                  onClick={() => hasDetails && handleMarkClick(mark.subject)}
                  disabled={!hasDetails}
                  className={`group border rounded-2xl p-4 flex justify-between items-center shadow-sm transition-all text-left w-full ${
                    hasDetails
                      ? "border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/10 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-950/20 cursor-pointer active:scale-[0.99]"
                      : "border-slate-100 dark:border-slate-800/30 bg-slate-50/20 dark:bg-slate-900/5 opacity-80 cursor-default"
                  }`}
                >
                  <span className="font-extrabold text-sm text-slate-700 dark:text-slate-350 font-nunito group-hover:text-accent-primary transition-colors truncate pr-2">
                    {mark.subject}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasDetails && (
                      <span className="text-[10px] font-bold text-slate-400 font-nunito bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 px-2 py-0.5 rounded-lg group-hover:text-accent-primary group-hover:bg-accent-light group-hover:border-accent-primary/20 transition-all flex items-center gap-1">
                        <Info className="w-3 h-3" /> Details
                      </span>
                    )}
                    <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl px-3 py-1.5 shadow-sm text-center shrink-0">
                      <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 font-nunito">
                        {mark.marks.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* GPA Scale Reference */}
      <div className="mt-8 border-t border-slate-100 dark:border-slate-800/80 pt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center">
          <BarChart2 className="w-4 h-4 mr-2 text-accent-primary" /> GPA Grading Scale Reference
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="border border-green-100 dark:border-green-950/30 bg-green-50/50 dark:bg-green-950/10 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">9.0-10.0</p>
            <p className="text-base font-extrabold text-green-700 dark:text-green-450 mt-0.5 font-nunito">A+</p>
          </div>
          <div className="border border-green-100 dark:border-green-950/30 bg-green-50/50 dark:bg-green-950/10 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">8.5-9.0</p>
            <p className="text-base font-extrabold text-green-700 dark:text-green-450 mt-0.5 font-nunito">A</p>
          </div>
          <div className="border border-accent-primary/20 bg-accent-light rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-450 uppercase">8.0-8.5</p>
            <p className="text-base font-extrabold text-accent-primary mt-0.5 font-nunito">A-</p>
          </div>
          <div className="border border-accent-primary/20 bg-accent-light rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-455 uppercase">7.5-8.0</p>
            <p className="text-base font-extrabold text-accent-primary mt-0.5 font-nunito">B+</p>
          </div>
          <div className="border border-amber-100 dark:border-amber-950/30 bg-amber-50/50 dark:bg-amber-950/10 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">7.0-7.5</p>
            <p className="text-base font-extrabold text-amber-700 dark:text-amber-450 mt-0.5 font-nunito">B</p>
          </div>
          <div className="border border-rose-100 dark:border-rose-950/30 bg-rose-50/50 dark:bg-rose-950/10 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">&lt;7.0</p>
            <p className="text-base font-extrabold text-rose-700 dark:text-rose-450 mt-0.5 font-nunito">C/D</p>
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="mt-8 relative overflow-hidden bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-accent-primary mb-2 flex items-center">
          <Lightbulb className="w-4 h-4 mr-2" /> Performance Insight
        </p>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-relaxed font-nunito">
          {performance.currentSgpa >= 8.0
            ? "Excellent performance this semester! Keep up the momentum."
            : performance.currentSgpa >= 7.0
            ? "Good performance. Focus on improvement in weaker subjects to boost your grades further."
            : "Caution: Consider reaching out to instructors or joining study groups for additional support."}
        </p>
      </div>

      {/* Detailed Marks Modal */}
      {isModalOpen && selectedCourseMarks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 border-b border-slate-800 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/10 rounded-full blur-2xl pointer-events-none" />
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-extrabold text-accent-primary uppercase tracking-widest font-mono bg-slate-950/80 border border-slate-800 px-2.5 py-0.5 rounded-md">
                {selectedCourseMarks.code || "COURSE CODE"}
              </span>
              <h3 className="text-xl font-extrabold text-white mt-2 leading-snug font-nunito">
                {selectedCourseMarks.subject}
              </h3>
              
              {/* Simulation Toggle Switch */}
              {selectedCourseMarks.components && selectedCourseMarks.components.length > 0 && (
                <div className="flex items-center justify-between mt-4 border-t border-slate-800/60 pt-3">
                  <span className="text-xs font-bold text-slate-350 dark:text-slate-400">
                    Simulate Mock Marks
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSimulating(!isSimulating)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      isSimulating ? "bg-accent-primary" : "bg-slate-800"
                    }`}
                    aria-pressed={isSimulating}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isSimulating ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5 max-h-[380px] overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Evaluation Component Breakdown
              </p>
              
              {selectedCourseMarks.components && selectedCourseMarks.components.length > 0 ? (
                <div className="space-y-5">
                  {selectedCourseMarks.components.map((comp, idx) => {
                    const obtained = isSimulating ? (simulatedMarks[comp.name] ?? comp.obtained) : comp.obtained;
                    const pct = comp.max > 0 ? (obtained / comp.max) * 100 : 0;
                    return (
                      <div key={`${comp.name}-${idx}`} className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-extrabold text-slate-700 dark:text-slate-200 font-nunito">
                            {comp.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {isSimulating ? (
                              <input
                                type="number"
                                min="0"
                                max={comp.max}
                                step="0.5"
                                value={obtained}
                                onChange={(e) => handleSimulatedMarkChange(comp.name, Math.min(comp.max, Math.max(0, parseFloat(e.target.value) || 0)))}
                                className="w-14 px-1.5 py-0.5 text-center text-xs font-bold bg-slate-55 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md focus:ring-1 focus:ring-accent-primary focus:outline-none dark:text-slate-200"
                              />
                            ) : (
                              <span className="text-slate-850 dark:text-slate-100 font-extrabold">{obtained}</span>
                            )}
                            <span className="font-bold text-slate-450 dark:text-slate-500">/ {comp.max}</span>
                          </div>
                        </div>

                        {isSimulating ? (
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              aria-label={`Simulate mark for ${comp.name}`}
                              min="0"
                              max={comp.max}
                              step="0.5"
                              value={obtained}
                              onChange={(e) => handleSimulatedMarkChange(comp.name, parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-accent-primary"
                            />
                          </div>
                        ) : (
                          /* Progress Bar Container */
                          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-850">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-accent-primary to-violet-600 transition-all duration-500"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-500 py-4 text-center font-nunito">
                  No evaluation component marks available for this course yet.
                </p>
              )}
            </div>

            {/* Total Marks Footer */}
            <div className="bg-slate-50 dark:bg-slate-950/40 px-6 py-5 border-t border-slate-100 dark:border-slate-850 flex items-center justify-between transition-colors duration-200">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {isSimulating ? "Simulated Total" : "Aggregated Score"}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-nunito">
                    Grade projection: <span className="font-extrabold text-accent-primary">{getProjectedGrade(isSimulating ? getSimulatedTotal() : selectedCourseMarks.total)}</span>
                  </span>
                  {isSimulating && (
                    <button
                      type="button"
                      onClick={() => {
                        const initial: Record<string, number> = {};
                        selectedCourseMarks.components.forEach((c) => {
                          initial[c.name] = c.obtained;
                        });
                        setSimulatedMarks(initial);
                      }}
                      className="text-[10px] font-bold text-rose-500 hover:text-rose-600 hover:underline transition-all font-nunito"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-2.5 shadow-sm text-right">
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100 font-nunito tracking-tight">
                  {(isSimulating ? getSimulatedTotal() : selectedCourseMarks.total).toFixed(1)}
                </span>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-500 font-nunito ml-1">
                  / 100
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </FigmaCard>
  );
};

PerformanceHub.displayName = "PerformanceHub";
