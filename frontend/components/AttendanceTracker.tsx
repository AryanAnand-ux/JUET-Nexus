/**
 * Attendance Tracker Component
 * Real-time course-wise attendance tracker with safe skips, thresholds, and drill-downs.
 */

"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { FigmaCard } from "./base";
import type { AttendanceRecord } from "@/types";
import { calculateBunkStatus } from "@/utils/bunkHelpers";
import { subscribePrefetchSubjects } from "@/hooks/useAttendancePrefetch";
import { Loader2 } from "lucide-react";

export interface AttendanceTrackerProps {
  attendanceRecords: AttendanceRecord[];
  isRefreshing?: boolean;
}

export const AttendanceTracker: React.FC<AttendanceTrackerProps> = ({
  attendanceRecords,
  isRefreshing = false,
}) => {
  const [navigatingSubject, setNavigatingSubject] = useState<string | null>(null);
  const [pendingPrefetchSubjects, setPendingPrefetchSubjects] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    return subscribePrefetchSubjects(setPendingPrefetchSubjects);
  }, []);

  const getRingColor = (percentage: number, classesHeld?: number): string => {
    if (classesHeld === 0 && percentage === 0) {
      return "text-neutral-300 dark:text-neutral-700";
    }
    if (percentage >= 85) return "text-emerald-500";
    if (percentage >= 75) return "text-amber-500";
    return "text-rose-600";
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
              
              const ringColor = getRingColor(record.percentage, record.classesHeld);

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
                  className="group relative block bg-[var(--surface-card)] hover:bg-neutral-50 dark:hover:bg-[#202020] border border-[var(--line-subtle)] hover:border-neutral-300 dark:hover:border-neutral-700 rounded-[20px] p-3.5 sm:p-5 transition-colors duration-200 hover:shadow-elevated active:scale-[0.995] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
                >
                  {/* Unified Responsive Layout: single SVG + metrics DOM shared across mobile and desktop */}
                  <div className="grid grid-cols-[72px_1fr] md:grid-cols-[96px_1fr] gap-x-3 gap-y-3 md:gap-x-6 md:gap-y-3 items-center">
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
                          className={`transition-[stroke-dashoffset] duration-700 ${ringColor}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center p-1 md:p-2 text-center pointer-events-none">
                        <span className={`${formattedPct.length >= 5 ? "text-xs md:text-xl font-bold tracking-tight" : "text-sm md:text-2xl font-extrabold"} text-[var(--ink-strong)] leading-none tabular-nums select-none`}>
                          {formattedPct}
                        </span>
                      </div>
                    </div>

                    {/* Course Info Column */}
                    <div className="min-w-0 flex flex-col justify-center">
                      {/* Title & Loading Spinner */}
                      <div className="flex items-center justify-between gap-2 md:gap-4 mb-1.5 md:mb-2">
                        <h4 className="text-sm md:text-base font-semibold text-[var(--ink-strong)] leading-snug break-words flex-1 min-w-0">
                          {record.subject}
                        </h4>
                        {(navigatingSubject === record.subject ||
                          isRefreshing ||
                          pendingPrefetchSubjects.has(record.subject)) && (
                          <div className="flex items-center justify-end gap-1.5 md:gap-2 shrink-0">
                            <span
                              aria-label={
                                navigatingSubject === record.subject
                                  ? "Opening subject"
                                  : "Refreshing attendance"
                              }
                              className={`rounded-full text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 flex items-center ${
                                navigatingSubject === record.subject
                                  ? "px-2 md:px-2.5 py-0.5 md:py-1 gap-1 md:gap-1.5"
                                  : "p-1 md:p-1.5"
                              }`}
                            >
                              <Loader2 className="w-2.5 h-2.5 md:w-3 md:h-3 animate-spin" />
                              {navigatingSubject === record.subject && <span>Opening...</span>}
                            </span>
                          </div>
                        )}
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
                    <div className="col-span-2 md:col-span-1 md:col-start-2 flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--line-subtle)] text-xs md:text-sm tabular-nums">
                      <span className="text-[var(--ink-muted)] font-medium">
                        L{" "}
                        <strong className="font-bold text-[var(--ink-strong)] ml-0.5">
                          {record.lecturePercent > 0 ? `${record.lecturePercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                        </strong>
                      </span>
                      <span className="text-[var(--ink-muted)] font-medium">
                        T{" "}
                        <strong className="font-bold text-[var(--ink-strong)] ml-0.5">
                          {record.tutorialPercent > 0 ? `${record.tutorialPercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                        </strong>
                      </span>
                      <span className="text-[var(--ink-muted)] font-medium">
                        P{" "}
                        <strong className="font-bold text-[var(--ink-strong)] ml-0.5">
                          {record.practicalPercent > 0 ? `${record.practicalPercent.toFixed(0)}%` : (record.percentage > 0 ? "—" : "0%")}
                        </strong>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </FigmaCard>
  );
};

AttendanceTracker.displayName = "AttendanceTracker";
