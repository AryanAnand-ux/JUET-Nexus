/**
 * Performance Hub Component
 * Modern dashboard display for Academic standing (SGPA, CGPA, recent marks)
 */

"use client";

import React, { useState } from "react";
import { FigmaCard } from "./base";
import type { PerformanceData, DetailedCourseMarks } from "@/types";
import { TrendingUp, ClipboardList, BarChart2, Lightbulb, GraduationCap, X, Info } from "lucide-react";

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
      setIsModalOpen(true);
    }
  };
  const getGradeTheme = (gpa: number): { cardBg: string; textClass: string; labelClass: string; badge: string } => {
    if (gpa >= 8.5) {
      return {
        cardBg: "from-green-500/10 via-emerald-500/5 to-transparent border-green-200/60",
        textClass: "text-green-700",
        labelClass: "text-green-800",
        badge: "bg-green-100 text-green-800 border-green-200"
      };
    }
    if (gpa >= 7.5) {
      return {
        cardBg: "from-indigo-500/10 via-violet-500/5 to-transparent border-indigo-200/60",
        textClass: "text-indigo-700",
        labelClass: "text-indigo-800",
        badge: "bg-indigo-100 text-indigo-800 border-indigo-200"
      };
    }
    if (gpa >= 6.5) {
      return {
        cardBg: "from-amber-500/10 via-yellow-500/5 to-transparent border-amber-200/60",
        textClass: "text-amber-700",
        labelClass: "text-amber-800",
        badge: "bg-amber-100 text-amber-800 border-amber-200"
      };
    }
    return {
      cardBg: "from-rose-500/10 via-red-500/5 to-transparent border-rose-200/60",
      textClass: "text-rose-700",
      labelClass: "text-rose-800",
      badge: "bg-rose-100 text-rose-800 border-rose-200"
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
        <span className="flex items-center text-slate-800 font-extrabold text-lg md:text-xl font-nunito tracking-tight">
          <GraduationCap className="w-6 h-6 mr-2 text-indigo-600" /> Performance Hub — Academic Standing
        </span>
      }
      className="border border-slate-200/80 shadow-md rounded-[24px] p-6 md:p-8"
    >
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
        <div className="border-t border-slate-100 pt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center">
            <ClipboardList className="w-4 h-4 mr-2 text-indigo-500" /> Recent Marks & Evaluations
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
                      ? "border-slate-100 bg-slate-50/40 hover:border-slate-200 hover:bg-white cursor-pointer active:scale-[0.99]"
                      : "border-slate-100 bg-slate-50/20 opacity-80 cursor-default"
                  }`}
                >
                  <span className="font-extrabold text-sm text-slate-700 font-nunito group-hover:text-indigo-600 transition-colors truncate pr-2">
                    {mark.subject}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasDetails && (
                      <span className="text-[10px] font-bold text-slate-400 font-nunito bg-slate-100 border border-slate-200/50 px-2 py-0.5 rounded-lg group-hover:text-indigo-500 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-all flex items-center gap-1">
                        <Info className="w-3 h-3" /> Details
                      </span>
                    )}
                    <div className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 shadow-sm text-center shrink-0">
                      <span className="font-extrabold text-sm text-slate-800 font-nunito">
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
      <div className="mt-8 border-t border-slate-100 pt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center">
          <BarChart2 className="w-4 h-4 mr-2 text-indigo-500" /> GPA Grading Scale Reference
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="border border-green-100 bg-green-50/50 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">9.0-10.0</p>
            <p className="text-base font-extrabold text-green-700 mt-0.5 font-nunito">A+</p>
          </div>
          <div className="border border-green-100 bg-green-50/50 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">8.5-9.0</p>
            <p className="text-base font-extrabold text-green-700 mt-0.5 font-nunito">A</p>
          </div>
          <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">8.0-8.5</p>
            <p className="text-base font-extrabold text-indigo-700 mt-0.5 font-nunito">A-</p>
          </div>
          <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">7.5-8.0</p>
            <p className="text-base font-extrabold text-indigo-700 mt-0.5 font-nunito">B+</p>
          </div>
          <div className="border border-amber-100 bg-amber-50/50 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">7.0-7.5</p>
            <p className="text-base font-extrabold text-amber-700 mt-0.5 font-nunito">B</p>
          </div>
          <div className="border border-rose-100 bg-rose-50/50 rounded-xl px-2 py-3 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase">&lt;7.0</p>
            <p className="text-base font-extrabold text-rose-700 mt-0.5 font-nunito">C/D</p>
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="mt-8 relative overflow-hidden bg-slate-50 border border-slate-100 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-2 flex items-center">
          <Lightbulb className="w-4 h-4 mr-2" /> Performance Insight
        </p>
        <p className="text-sm font-semibold text-slate-700 leading-relaxed font-nunito">
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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-white border border-slate-200 rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 border-b border-slate-800 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest font-mono bg-slate-950/80 border border-slate-800 px-2.5 py-0.5 rounded-md">
                {selectedCourseMarks.code || "COURSE CODE"}
              </span>
              <h3 className="text-xl font-extrabold text-white mt-2 leading-snug font-nunito">
                {selectedCourseMarks.subject}
              </h3>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5 max-h-[350px] overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Evaluation Component Breakdown
              </p>
              
              {selectedCourseMarks.components && selectedCourseMarks.components.length > 0 ? (
                <div className="space-y-4">
                  {selectedCourseMarks.components.map((comp, idx) => {
                    const pct = comp.max > 0 ? (comp.obtained / comp.max) * 100 : 0;
                    return (
                      <div key={`${comp.name}-${idx}`} className="space-y-1.5">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-extrabold text-slate-700 font-nunito">
                            {comp.name}
                          </span>
                          <span className="font-bold text-slate-500 font-nunito">
                            <span className="text-slate-800 font-extrabold">{comp.obtained}</span> / {comp.max}
                          </span>
                        </div>
                        {/* Progress Bar Container */}
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
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
            <div className="bg-slate-50 px-6 py-5 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Aggregated Score
                </p>
                <p className="text-sm font-medium text-slate-500 font-nunito mt-0.5">
                  Sum of components
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-2.5 shadow-sm text-right">
                <span className="text-2xl font-black text-slate-800 font-nunito tracking-tight">
                  {selectedCourseMarks.total.toFixed(1)}
                </span>
                <span className="text-sm font-bold text-slate-400 font-nunito ml-1">
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
