/**
 * Attendance Tracker Component
 * Real-time course-wise attendance tracker with safe skips, thresholds, and drill-downs.
 */

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FigmaCard } from "./base";
import type { AttendanceRecord } from "@/types";
import { calculateBunkStatus } from "@/utils/bunkHelpers";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Loader2 } from "lucide-react";

export interface AttendanceTrackerProps {
  attendanceRecords: AttendanceRecord[];
}

export const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({ attendanceRecords }) => {
  const [navigatingSubject, setNavigatingSubject] = useState<string | null>(null);
  const getAttendanceStatus = (
    percentage: number,
    classesHeld?: number
  ): { text: string; icon: React.ReactNode; badgeClass: string; ringColor: string } => {
    if (classesHeld === 0 && percentage === 0) {
      return {
        text: "NO CLASSES",
        icon: <HelpCircle className="w-3.5 h-3.5 text-[var(--ink-muted)] mr-1" />,
        badgeClass: "bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700",
        ringColor: "text-slate-300 dark:text-slate-700",
      };
    }
    if (percentage >= 85) {
      return { 
        text: "SAFE", 
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1" />, 
        badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/40",
        ringColor: "text-emerald-500"
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

    const activeRecords = attendanceRecords.filter((r) => !(r.classesHeld === 0 && r.percentage === 0));
    const avgPercentage =
      activeRecords.length > 0
        ? activeRecords.reduce((sum, r) => sum + r.percentage, 0) / activeRecords.length
        : 0;
    const belowThreshold = activeRecords.filter((r) => r.percentage < 75).length;

    return { subjectCount: attendanceRecords.length, avgPercentage, belowThreshold };
  };

  const stats = getTotalStats();

  return (
    <FigmaCard 
      heading={
        <span className="flex items-baseline gap-2.5">
          <span className="font-editorial-italic text-2xl text-[var(--ink-strong)] font-normal">Attendance</span>
          <CheckCircle2 className="w-4 h-4 text-brand-600 self-center ml-auto" />
        </span>
      } 
      className="border border-[var(--line-subtle)] shadow-card rounded-[24px] p-6 md:p-8"
    >
      {attendanceRecords.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-[var(--ink-muted)]">
            No attendance data available. Connect to your student portal to view.
          </p>
        </div>
      ) : (
        <>
          {/* Overall Stats Cards */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] hover:border-brand-500/40 rounded-[20px] p-4 sm:p-5 shadow-card transition-all hover:scale-[1.02] duration-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                Enrolled Courses
              </p>
              <p className="text-4xl font-extrabold text-[var(--ink-strong)] tracking-tight">
                {stats.subjectCount}
              </p>
            </div>
            <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] hover:border-brand-500/40 rounded-[20px] p-4 sm:p-5 shadow-card transition-all hover:scale-[1.02] duration-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                Attention Required (&lt;75%)
              </p>
              <p className={`text-4xl font-extrabold tracking-tight ${stats.belowThreshold > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {stats.belowThreshold}
              </p>
            </div>
          </div>

          {/* Subject-wise Attendance */}
          <div className="space-y-4">
            {attendanceRecords.map((record, index) => {
              const radius = 34;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset =
                circumference - (Math.min(100, record.percentage) / 100) * circumference;
              
              const status = getAttendanceStatus(record.percentage, record.classesHeld);

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
                    ? "text-emerald-600 border-emerald-100 bg-emerald-50/40 dark:text-emerald-400 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                    : "text-amber-600 border-amber-100 bg-amber-50/40 dark:text-amber-400 dark:border-amber-900/40 dark:bg-amber-950/20",
                };
              })();

              return (
                <Link
                  href={`/dashboard/subject/${encodeURIComponent(record.subject)}?pct=${record.percentage}&lp=${record.lecturePercent}&tp=${record.tutorialPercent}&pp=${record.practicalPercent}${record.detailLink ? `&link=${encodeURIComponent(record.detailLink)}` : ''}`}
                  key={record.subject}
                  onClick={() => setNavigatingSubject(record.subject)}
                  className="group relative block bg-[var(--surface-card)] hover:bg-brand-50/40 dark:hover:bg-brand-500/5 border border-[var(--line-subtle)] rounded-[20px] p-4 sm:p-5 transition-all duration-300 hover:shadow-elevated hover:scale-[1.005] hover:border-brand-500/40 cursor-pointer"
                >
                  <div className="flex flex-col md:flex-row items-center md:items-stretch gap-6">
                    {/* Circular Progress Indicator */}
                    <div className="relative w-24 h-24 flex items-center justify-center shrink-0 bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-full">
                      <svg className="transform -rotate-90 w-24 h-24">
                        <circle
                          cx="48"
                          cy="48"
                          r="34"
                          stroke="#EAEAEC"
                          className="dark:stroke-[#2C2C2E]"
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
                        <span className="text-2xl font-extrabold text-[var(--ink-strong)] leading-none tabular-nums">
                          {record.percentage % 1 === 0
                            ? record.percentage.toFixed(0)
                            : record.percentage.toFixed(1)}
                        </span>
                        <span className="text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-widest mt-1">Total %</span>
                      </div>
                    </div>

                    {/* Details Panel */}
                    <div className="flex-1 flex flex-col justify-between w-full">
                      {/* Header Title */}
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <div>
                          <h4 className="text-base font-semibold text-[var(--ink-strong)] leading-snug group-hover:text-[var(--accent-text)] transition-colors">
                            {record.subject}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {navigatingSubject === record.subject && (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 flex items-center gap-1.5 animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span className="hidden sm:inline">Opening...</span>
                            </span>
                          )}
                          <span className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em] flex items-center shadow-sm ${status.badgeClass}`}>
                            {status.icon}
                            {status.text}
                          </span>
                        </div>
                      </div>

                      {/* Quick-Info Skip Indicator */}
                      {skipInfo && (
                        <div className="mb-3 flex items-center">
                          <span className={`px-2.5 py-1 rounded-xl text-xs font-medium border ${skipInfo.className}`}>
                            {skipInfo.text}
                          </span>
                        </div>
                      )}

                      {/* Stats Breakdowns */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl p-1.5 sm:p-2.5 text-center transition-all hover:bg-white dark:hover:bg-carbon hover:shadow-sm">
                          <p className="text-[8px] sm:text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.14em] mb-0.5">Lectures</p>
                          <p className="text-xs sm:text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                            {record.lecturePercent > 0 ? `${record.lecturePercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                          </p>
                        </div>
                        <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl p-1.5 sm:p-2.5 text-center transition-all hover:bg-white dark:hover:bg-carbon hover:shadow-sm">
                          <p className="text-[8px] sm:text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.14em] mb-0.5">Tutorials</p>
                          <p className="text-xs sm:text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                            {record.tutorialPercent > 0 ? `${record.tutorialPercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                          </p>
                        </div>
                        <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl p-1.5 sm:p-2.5 text-center transition-all hover:bg-white dark:hover:bg-carbon hover:shadow-sm">
                          <p className="text-[8px] sm:text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.14em] mb-0.5">Practicals</p>
                          <p className="text-xs sm:text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                            {record.practicalPercent > 0 ? `${record.practicalPercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Footer Legends */}
          <div className="mt-8 border-t border-[var(--line-subtle)] pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-emerald-100 dark:border-emerald-950/30 bg-emerald-50/50 dark:bg-emerald-950/10 rounded-2xl px-4 py-3 flex items-center justify-center transition-transform hover:-translate-y-0.5 shadow-card">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                SAFE: Attendance ≥ 85%
              </p>
            </div>
            <div className="border border-amber-100 dark:border-amber-950/30 bg-amber-50/50 dark:bg-amber-950/10 rounded-2xl px-4 py-3 flex items-center justify-center transition-transform hover:-translate-y-0.5 shadow-card">
              <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                CAUTION: Attendance 75-84%
              </p>
            </div>
            <div className="border border-rose-100 dark:border-rose-950/30 bg-rose-50/50 dark:bg-rose-950/10 rounded-2xl px-4 py-3 flex items-center justify-center transition-transform hover:-translate-y-0.5 shadow-card">
              <XCircle className="w-4 h-4 mr-2 text-rose-600" />
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
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
