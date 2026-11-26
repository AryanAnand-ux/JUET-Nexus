/**
 * Attendance Tracker Component
 * Real-time course-wise attendance tracker with safe skips, thresholds, and drill-downs.
 */

"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { FigmaCard } from "./base";
import type { AttendanceRecord } from "@/types";
import { calculateBunkStatus } from "@/utils/bunkHelpers";
import { fetchAttendanceDetailDirect } from "@/utils/attendanceCache";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Loader2 } from "lucide-react";

export interface AttendanceTrackerProps {
  attendanceRecords: AttendanceRecord[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({
  attendanceRecords,
  onRefresh,
  isRefreshing = false,
}) => {
  const [navigatingSubject, setNavigatingSubject] = useState<string | null>(null);

  const getAttendanceStatus = (
    percentage: number,
    classesHeld?: number
  ): { text: string; icon: React.ReactNode; badgeClass: string; ringColor: string } => {
    if (classesHeld === 0 && percentage === 0) {
      return {
        text: "NO CLASSES",
        icon: <HelpCircle className="w-3.5 h-3.5 text-[var(--ink-muted)] mr-1" />,
        badgeClass: "bg-neutral-50 text-neutral-600 border border-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800",
        ringColor: "text-neutral-300 dark:text-neutral-700",
      };
    }
    if (percentage >= 85) {
      return { 
        text: "SAFE", 
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mr-1" />, 
        badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40",
        ringColor: "text-emerald-500"
      };
    }
    if (percentage >= 75) {
      return { 
        text: "CAUTION", 
        icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mr-1" />, 
        badgeClass: "bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40",
        ringColor: "text-amber-500"
      };
    }
    return { 
      text: "CRITICAL", 
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 mr-1" />, 
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/40",
      ringColor: "text-rose-600"
    };
  };

  const stats = useMemo(() => {
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
  }, [attendanceRecords]);

  return (
    <FigmaCard 
      heading={<span className="font-editorial-italic text-2xl text-[var(--ink-strong)] font-normal">Attendance</span>} 
      className="border border-[var(--line-subtle)] shadow-card rounded-[24px] p-4 sm:p-6 md:p-8"
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] hover:border-neutral-300 dark:hover:border-neutral-700 rounded-[20px] p-4 sm:p-5 shadow-card transition-all hover:scale-[1.01] duration-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                Enrolled Courses
              </p>
              <p className="text-3xl sm:text-4xl font-extrabold text-[var(--ink-strong)] tracking-tight">
                {stats.subjectCount}
              </p>
            </div>
            <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] hover:border-neutral-300 dark:hover:border-neutral-700 rounded-[20px] p-4 sm:p-5 shadow-card transition-all hover:scale-[1.01] duration-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                Attention Required (&lt;75%)
              </p>
              <p className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${stats.belowThreshold > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {stats.belowThreshold}
              </p>
            </div>
          </div>

          {/* Subject-wise Attendance */}
          <div className="space-y-3 sm:space-y-4">
            {attendanceRecords.map((record) => {
              const radius = 35;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset =
                circumference - (Math.min(100, record.percentage) / 100) * circumference;
              
              const status = getAttendanceStatus(record.percentage, record.classesHeld);

              const formattedPct = `${
                record.percentage % 1 === 0
                  ? record.percentage.toFixed(0)
                  : record.percentage.toFixed(1)
              }%`;

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
                  onMouseEnter={() => {
                    if (record.detailLink) {
                      fetchAttendanceDetailDirect(record.subject, record.detailLink);
                    }
                  }}
                  className="group relative block bg-[var(--surface-card)] hover:bg-neutral-50 dark:hover:bg-[#202020] border border-[var(--line-subtle)] hover:border-neutral-300 dark:hover:border-neutral-700 rounded-[20px] p-3.5 sm:p-5 transition-colors duration-200 hover:shadow-elevated active:scale-[0.995] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
                >
                  {/* Unified Responsive Layout: single SVG + metrics DOM shared across mobile and desktop */}
                  <div className="grid grid-cols-[72px_1fr] md:grid-cols-[96px_1fr] gap-x-3 gap-y-3 md:gap-x-6 md:gap-y-3 items-start md:items-center">
                    {/* Circular Progress Indicator */}
                    <div className="relative w-[72px] h-[72px] md:w-24 md:h-24 md:row-span-2 flex items-center justify-center shrink-0 bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-full">
                      <svg viewBox="0 0 96 96" className="transform -rotate-90 w-[72px] h-[72px] md:w-24 md:h-24">
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          stroke="#EAEAEC"
                          className="dark:stroke-[#2C2C2C]"
                          strokeWidth="7"
                          fill="transparent"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          stroke="currentColor"
                          strokeWidth="7"
                          fill="transparent"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          className={`transition-[stroke-dashoffset] duration-700 ${status.ringColor}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center p-1 md:p-2 text-center pointer-events-none">
                        <span className={`${formattedPct.length >= 5 ? "text-xs md:text-xl font-bold tracking-tight" : "text-sm md:text-2xl font-extrabold"} text-[var(--ink-strong)] leading-none tabular-nums select-none`}>
                          {formattedPct}
                        </span>
                      </div>
                    </div>

                    {/* Course Info Column */}
                    <div className="min-w-0 flex flex-col">
                      {/* Title & Status Badge */}
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1.5 md:gap-4 mb-1.5 md:mb-2">
                        <h4 className="order-2 md:order-1 text-sm md:text-base font-semibold text-[var(--ink-strong)] leading-snug break-words flex-1 min-w-0">
                          {record.subject}
                        </h4>
                        <div className="order-1 md:order-2 flex items-center justify-between md:justify-end gap-1.5 md:gap-2 shrink-0">
                          {navigatingSubject === record.subject && (
                            <span className="order-2 md:order-1 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 flex items-center gap-1 md:gap-1.5">
                              <Loader2 className="w-2.5 h-2.5 md:w-3 md:h-3 animate-spin" />
                              <span>Opening...</span>
                            </span>
                          )}
                          <span className={`order-1 md:order-2 px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] md:tracking-[0.12em] inline-flex items-center shadow-sm ${status.badgeClass}`}>
                            {status.icon}
                            {status.text}
                          </span>
                        </div>
                      </div>

                      {/* Quick-Info Skip Indicator */}
                      {skipInfo && (
                        <div className="flex items-center">
                          <span className={`px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg md:rounded-xl text-[11px] md:text-xs font-medium border ${skipInfo.className}`}>
                            {skipInfo.text}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Component Breakdowns (full width on mobile, right column on desktop) */}
                    <div className="col-span-2 md:col-span-1 md:col-start-2 grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--line-subtle)]">
                      <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl py-1.5 px-1.5 md:p-2.5 text-center transition-colors hover:bg-white dark:hover:bg-[#262626] hover:shadow-sm">
                        <p className="text-[8px] sm:text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider md:tracking-[0.14em] mb-0.5">Lectures</p>
                        <p className="text-xs md:text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                          {record.lecturePercent > 0 ? `${record.lecturePercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                        </p>
                      </div>
                      <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl py-1.5 px-1.5 md:p-2.5 text-center transition-colors hover:bg-white dark:hover:bg-[#262626] hover:shadow-sm">
                        <p className="text-[8px] sm:text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider md:tracking-[0.14em] mb-0.5">Tutorials</p>
                        <p className="text-xs md:text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                          {record.tutorialPercent > 0 ? `${record.tutorialPercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                        </p>
                      </div>
                      <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl py-1.5 px-1.5 md:p-2.5 text-center transition-colors hover:bg-white dark:hover:bg-[#262626] hover:shadow-sm">
                        <p className="text-[8px] sm:text-[9px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider md:tracking-[0.14em] mb-0.5">Practicals</p>
                        <p className="text-xs md:text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                          {record.practicalPercent > 0 ? `${record.practicalPercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Footer Legends */}
          <div className="mt-8 border-t border-[var(--line-subtle)] pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-emerald-100 dark:border-emerald-950/40 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl px-4 py-3 flex items-center justify-center shadow-card">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                SAFE: Attendance ≥ 85%
              </p>
            </div>
            <div className="border border-amber-100 dark:border-amber-950/40 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl px-4 py-3 flex items-center justify-center shadow-card">
              <AlertTriangle className="w-4 h-4 mr-2 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                CAUTION: Attendance 75-84%
              </p>
            </div>
            <div className="border border-rose-100 dark:border-rose-950/40 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl px-4 py-3 flex items-center justify-center shadow-card">
              <XCircle className="w-4 h-4 mr-2 text-rose-600 dark:text-rose-400" />
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
