/**
 * Attendance Tracker Component
 * Real-time course-wise attendance tracker with safe skips, thresholds, and drill-downs.
 */

"use client";

import React from "react";
import Link from "next/link";
import { FigmaCard } from "./base";
import type { AttendanceRecord } from "@/types";
import { calculateBunkStatus } from "@/utils/bunkHelpers";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export interface AttendanceTrackerProps {
  attendanceRecords: AttendanceRecord[];
}

export const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({ attendanceRecords }) => {
  const getAttendanceStatus = (percentage: number): { text: string; icon: React.ReactNode; badgeClass: string; ringColor: string } => {
    if (percentage >= 85) {
      return { 
        text: "SAFE", 
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mr-1" />, 
        badgeClass: "bg-green-50 text-green-700 border border-green-100 dark:bg-green-950/20 dark:text-green-300 dark:border-green-900/40",
        ringColor: "text-green-500"
      };
    }
    if (percentage >= 75) {
      return { 
        text: "CAUTION", 
        icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mr-1" />, 
        badgeClass: "bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/40",
        ringColor: "text-amber-500"
      };
    }
    return { 
      text: "CRITICAL", 
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600 mr-1" />, 
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/40",
      ringColor: "text-rose-600"
    };
  };

  const getTotalStats = () => {
    if (attendanceRecords.length === 0) {
      return { subjectCount: 0, avgPercentage: 0, belowThreshold: 0 };
    }

    const avgPercentage =
      attendanceRecords.reduce((sum, r) => sum + r.percentage, 0) /
      attendanceRecords.length;
    const belowThreshold = attendanceRecords.filter((r) => r.percentage < 75).length;

    return { subjectCount: attendanceRecords.length, avgPercentage, belowThreshold };
  };

  const stats = getTotalStats();

  return (
    <FigmaCard 
      heading={
        <span className="flex items-center text-slate-800 dark:text-slate-100 font-extrabold text-lg md:text-xl font-nunito tracking-tight">
          <CheckCircle2 className="w-5 h-5 mr-2 text-accent-primary" /> Attendance Tracker
        </span>
      } 
      className="border border-slate-200/80 dark:border-slate-800 shadow-md rounded-[24px] p-6 md:p-8"
    >
      {attendanceRecords.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm font-medium text-slate-400 font-nunito">
            No attendance data available. Connect to your student portal to view.
          </p>
        </div>
      ) : (
        <>
          {/* Overall Stats Cards */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-950/20 dark:to-slate-900/10 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 rounded-[20px] p-4 sm:p-5 shadow-sm transition-all hover:scale-[1.02] duration-300">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1">
                Enrolled Courses
              </p>
              <p className="text-4xl font-extrabold text-slate-850 dark:text-slate-100 font-nunito tracking-tight">
                {stats.subjectCount}
              </p>
            </div>
            <div className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-950/20 dark:to-slate-900/10 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 rounded-[20px] p-4 sm:p-5 shadow-sm transition-all hover:scale-[1.02] duration-300">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1">
                Attention Required (&lt;75%)
              </p>
              <p className={`text-4xl font-extrabold font-nunito tracking-tight ${stats.belowThreshold > 0 ? 'text-rose-600' : 'text-green-600'}`}>
                {stats.belowThreshold}
              </p>
            </div>
          </div>

          {/* Subject-wise Attendance */}
          <div className="space-y-4">
            {attendanceRecords.map((record) => {
              const radius = 34;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset =
                circumference - (Math.min(100, record.percentage) / 100) * circumference;
              
              const status = getAttendanceStatus(record.percentage);

              const skipInfo = (() => {
                if (record.classesHeld <= 0) {
                  return null;
                }
                const bunkStatus = calculateBunkStatus(record.classesAttended, record.classesHeld, 75);
                if (bunkStatus.status === "critical") {
                  return {
                    text: `Must attend next ${bunkStatus.count} class${bunkStatus.count > 1 ? "es" : ""}`,
                    className: "text-rose-600 border-rose-100 bg-rose-50/40 dark:text-rose-400 dark:border-rose-900/40 dark:bg-rose-950/20",
                  };
                }
                return {
                  text: bunkStatus.count > 0 
                    ? `Safe to miss ${bunkStatus.count} class${bunkStatus.count > 1 ? "es" : ""}`
                    : "Caution: Cannot miss any classes",
                  className: bunkStatus.count > 0
                    ? "text-green-600 border-green-100 bg-green-50/40 dark:text-green-400 dark:border-green-900/40 dark:bg-green-950/20"
                    : "text-amber-600 border-amber-100 bg-amber-50/40 dark:text-amber-400 dark:border-amber-900/40 dark:bg-amber-950/20",
                };
              })();

              return (
                <Link
                  href={`/dashboard/subject/${encodeURIComponent(record.subject)}?pct=${record.percentage}&lp=${record.lecturePercent}&tp=${record.tutorialPercent}&pp=${record.practicalPercent}${record.detailLink ? `&link=${encodeURIComponent(record.detailLink)}` : ''}`}
                  key={record.subject}
                  className="group relative block bg-white dark:bg-slate-950/20 hover:bg-slate-50/30 dark:hover:bg-slate-900/25 border border-slate-200/80 dark:border-slate-800/60 rounded-[20px] p-4 sm:p-5 transition-all duration-300 hover:shadow-md hover:scale-[1.005] hover:border-slate-350 dark:hover:border-slate-700 cursor-pointer"
                >
                  <div className="flex flex-col md:flex-row items-center md:items-stretch gap-6">
                    {/* Circular Progress Indicator */}
                    <div className="relative w-24 h-24 flex items-center justify-center shrink-0 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-full shadow-inner">
                      <svg className="transform -rotate-90 w-24 h-24">
                        <circle
                          cx="48"
                          cy="48"
                          r="34"
                          stroke="#F1F5F9"
                          className="dark:stroke-slate-800"
                          strokeWidth="8"
                          fill="transparent"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="34"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          className={`transition-all duration-1000 ${status.ringColor}`}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 leading-none font-nunito">
                          {record.percentage % 1 === 0
                            ? record.percentage.toFixed(0)
                            : record.percentage.toFixed(1)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Total %</span>
                      </div>
                    </div>

                    {/* Details Panel */}
                    <div className="flex-1 flex flex-col justify-between w-full">
                      {/* Header Title */}
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <div>
                          <h4 className="text-base font-extrabold text-slate-850 dark:text-slate-200 leading-snug font-nunito group-hover:text-accent-primary transition-colors">
                            {record.subject}
                          </h4>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold font-nunito flex items-center shadow-sm shrink-0 ${status.badgeClass}`}>
                          {status.icon}
                          {status.text}
                        </span>
                      </div>

                      {/* Quick-Info Skip Indicator */}
                      {skipInfo && (
                        <div className="mb-3 flex items-center">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-bold font-nunito border shadow-sm ${skipInfo.className}`}>
                            {skipInfo.text}
                          </span>
                        </div>
                      )}

                      {/* Stats Breakdowns */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-xl p-1.5 sm:p-2.5 text-center transition-all hover:bg-white dark:hover:bg-slate-950 hover:shadow-sm">
                          <p className="text-[8px] sm:text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Lectures</p>
                          <p className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 font-nunito">{record.lecturePercent.toFixed(0)}%</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-xl p-1.5 sm:p-2.5 text-center transition-all hover:bg-white dark:hover:bg-slate-950 hover:shadow-sm">
                          <p className="text-[8px] sm:text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Tutorials</p>
                          <p className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 font-nunito">{record.tutorialPercent.toFixed(0)}%</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-xl p-1.5 sm:p-2.5 text-center transition-all hover:bg-white dark:hover:bg-slate-950 hover:shadow-sm">
                          <p className="text-[8px] sm:text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Practicals</p>
                          <p className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200 font-nunito">{record.practicalPercent.toFixed(0)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Footer Legends */}
          <div className="mt-8 border-t border-slate-100 dark:border-slate-800/80 pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-green-100 dark:border-green-950/30 bg-green-50/50 dark:bg-green-950/10 rounded-2xl px-4 py-3 flex items-center justify-center transition-transform hover:-translate-y-0.5 shadow-sm">
              <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
              <p className="text-xs font-bold text-green-700 dark:text-green-300">
                SAFE: Attendance ≥ 85%
              </p>
            </div>
            <div className="border border-amber-100 dark:border-amber-950/30 bg-amber-50/50 dark:bg-amber-950/10 rounded-2xl px-4 py-3 flex items-center justify-center transition-transform hover:-translate-y-0.5 shadow-sm">
              <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                CAUTION: Attendance 75-84%
              </p>
            </div>
            <div className="border border-rose-100 dark:border-rose-950/30 bg-rose-50/50 dark:bg-rose-950/10 rounded-2xl px-4 py-3 flex items-center justify-center transition-transform hover:-translate-y-0.5 shadow-sm">
              <XCircle className="w-4 h-4 mr-2 text-rose-600" />
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                CRITICAL: Attendance &lt; 75%
              </p>
            </div>
          </div>
        </>
      )}
    </FigmaCard>
  );
};

AttendanceTracker.displayName = "AttendanceTracker";

// Backward-compatible alias
export const BunkMeter = AttendanceTracker;
