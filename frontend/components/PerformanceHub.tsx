/**
 * Performance Hub Component
 * Modern dashboard display for Academic standing (SGPA, CGPA, recent marks)
 */

"use client";

import React from "react";
import { FigmaCard } from "./base";
import type { PerformanceData } from "@/types";
import { TrendingUp, ClipboardList, BarChart2, Lightbulb, GraduationCap } from "lucide-react";

export interface PerformanceHubProps {
  performance: PerformanceData;
}

export const PerformanceHub: React.FC<PerformanceHubProps> = ({
  performance,
}) => {
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
            {performance.recentMarks.map((mark, idx) => (
              <div
                key={`${mark.subject}-${idx}`}
                className="group border border-slate-100 hover:border-slate-200 bg-slate-50/40 rounded-2xl p-4 flex justify-between items-center shadow-sm transition-all hover:bg-white"
              >
                <span className="font-extrabold text-sm text-slate-700 font-nunito group-hover:text-indigo-600 transition-colors truncate pr-2">
                  {mark.subject}
                </span>
                <div className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 shadow-sm text-center shrink-0">
                  <span className="font-extrabold text-sm text-slate-800 font-nunito">
                    {mark.marks.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
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
    </FigmaCard>
  );
};

PerformanceHub.displayName = "PerformanceHub";
