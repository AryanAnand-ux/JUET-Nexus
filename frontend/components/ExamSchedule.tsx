"use client";

import React, { useMemo } from "react";
import type { ExamScheduleResponse } from "@/types";
import {
  Clock,
  MapPin,
  Hash,
  BookOpen,
} from "lucide-react";

export interface ExamScheduleProps {
  schedule: ExamScheduleResponse;
  courseMap?: Record<string, string>;
}

export function cleanSubjectName(raw: string, courseMap?: Record<string, string>): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // 1. Direct match in courseMap (case-insensitive)
  if (courseMap) {
    const directMatch = courseMap[trimmed.toUpperCase()] || courseMap[trimmed];
    if (directMatch) return directMatch;
  }

  let s = trimmed.replace(/\s+/g, " ");

  // 2. If format is "CODE (NAME)" e.g. "HS301 (CONCEPTS OF ECONOMICS)"
  const codeBeforeParenMatch = s.match(/^[A-Za-z0-9_-]{2,12}\s*\(([^()]+)\)$/);
  if (codeBeforeParenMatch && /[a-zA-Z]{3,}/.test(codeBeforeParenMatch[1])) {
    return codeBeforeParenMatch[1].trim();
  }

  // 3. Strip trailing parenthesized code: "CONCEPTS OF ECONOMICS (HS301)" -> "CONCEPTS OF ECONOMICS"
  s = s.replace(/\s*\([^()]*\)\s*$/, "");

  // 4. Strip trailing bracketed code: "CONCEPTS OF ECONOMICS [HS301]" -> "CONCEPTS OF ECONOMICS"
  s = s.replace(/\s*\[[^[\]]*\]\s*$/, "");

  // 5. Strip leading code prefix: "HS301 - CONCEPTS OF ECONOMICS" or "HS301: CONCEPTS OF ECONOMICS"
  const leadingCodeMatch = s.match(/^[A-Za-z0-9_-]{2,12}\s*[:–-]\s*(.+)$/);
  if (leadingCodeMatch && /[a-zA-Z]{3,}/.test(leadingCodeMatch[1])) {
    s = leadingCodeMatch[1].trim();
  }

  // 6. Strip trailing code suffix: "CONCEPTS OF ECONOMICS - HS301"
  const trailingCodeMatch = s.match(/^(.+?)\s*[:–-]\s*[A-Za-z0-9_-]{2,12}$/);
  if (trailingCodeMatch && /[a-zA-Z]{3,}/.test(trailingCodeMatch[1])) {
    s = trailingCodeMatch[1].trim();
  }

  // 7. Check courseMap after cleaning
  if (courseMap) {
    const cleanedMatch = courseMap[s.toUpperCase()] || courseMap[s];
    if (cleanedMatch) return cleanedMatch;
  }

  return s.trim();
}

function hasExplicitTime(str: string): boolean {
  if (!str) return false;
  // Exclude midnight-placeholder ISO timestamps like T00:00 or T00:00:00 — these are date-only entries
  const withoutMidnight = str.replace(/T00:00(?::00)?(?:\.\d+)?Z?/gi, "");
  return /T\d{1,2}:\d{2}|(?:\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b)/i.test(withoutMidnight);
}

function parseExamDateTime(str: string): Date | null {
  if (!str) return null;
  const s = str.trim();

  // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, y, m, d, hr, min, sec] = isoMatch;
    if (hr !== undefined) {
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hr, 10), parseInt(min, 10), sec ? parseInt(sec, 10) : 0);
    }
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  // Indian format: DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/);
  if (dmyMatch) {
    let [, dStr, mStr, yStr, rest] = dmyMatch;
    let d = parseInt(dStr, 10);
    let m = parseInt(mStr, 10);
    const y = parseInt(yStr, 10);
    if (m > 12 && d <= 12) {
      const temp = d;
      d = m;
      m = temp;
    }
    const timeMatch = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      let hr = parseInt(timeMatch[1], 10);
      const min = parseInt(timeMatch[2], 10);
      const sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const mer = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
      if (mer === "PM" && hr < 12) hr += 12;
      if (mer === "AM" && hr === 12) hr = 0;
      return new Date(y, m - 1, d, hr, min, sec);
    }
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = parseExamDateTime(dateStr);
    if (!d || isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(startStr: string, endStr?: string): string {
  if (!startStr && !endStr) return "";

  // If endStr already contains a formatted human range like "12:00 pm to 01:30 pm"
  if (endStr && /\s+(?:to|–|-)\s+/i.test(endStr) && /\d{1,2}:\d{2}/.test(endStr)) {
    return endStr;
  }

  // Check if startStr contains parenthesized time like "(11:00 AM - 12:30 PM)"
  const bracketMatch = startStr && startStr.match(/\(([^)]+)\)/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  // If startStr is only a date and endStr has the time string
  if (startStr && !hasExplicitTime(startStr) && endStr && hasExplicitTime(endStr)) {
    return endStr;
  }

  // If startStr has no time information at all, don't show midnight
  if (!startStr || !hasExplicitTime(startStr)) {
    return "";
  }

  try {
    const start = parseExamDateTime(startStr);
    if (!start || isNaN(start.getTime())) return "";

    const startTimeStr = start.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (endStr && hasExplicitTime(endStr)) {
      const end = parseExamDateTime(endStr);
      if (end && !isNaN(end.getTime())) {
        const endTimeStr = end.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        return `${startTimeStr} – ${endTimeStr}`;
      }
    }
    return startTimeStr;
  } catch {
    return "";
  }
}

function getExamStatus(dateStr: string) {
  if (!dateStr) return null;
  try {
    const examDate = parseExamDateTime(dateStr);
    if (!examDate || isNaN(examDate.getTime())) return null;
    const now = new Date();

    // Reset hours to midnight for clear calendar day diff
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetDay = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
    const diffDays = Math.round((targetDay - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: "Completed", variant: "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700" };
    }
    if (diffDays === 0) {
      return { label: "Today", variant: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 animate-pulse" };
    }
    if (diffDays === 1) {
      return { label: "Tomorrow", variant: "bg-neutral-100 dark:bg-neutral-800 text-[var(--ink-strong)] border-neutral-300 dark:border-neutral-600" };
    }
    return { label: `In ${diffDays} days`, variant: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800" };
  } catch {
    return null;
  }
}

function formatRoomCode(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const code = trimmed.slice(0, colonIdx).trim();
    if (code) return code;
  }
  return trimmed;
}

export const ExamSchedule: React.FC<ExamScheduleProps> = ({
  schedule,
  courseMap,
}) => {
  const preparedItems = useMemo(() => {
    const rawItems = schedule.items || [];
    return rawItems
      .map((item, idx) => {
        const cleanedSubject = cleanSubjectName(item.subject, courseMap);
        return {
          item,
          paperNum: idx + 1,
          cleanedSubject,
          roomLabel: formatRoomCode(item.roomcode),
          status: getExamStatus(item.datetime),
          dateStr: formatDate(item.datetime),
          timeStr: formatTime(item.datetime, item.datetimeupto),
        };
      })
      // Show only upcoming exams (today, tomorrow, future, or undated)
      .filter((entry) => entry.status?.label !== "Completed");
  }, [schedule.items, courseMap]);

  const allItems = schedule.items || [];
  const upcomingCount = preparedItems.length;
  const completedCount = allItems.length - upcomingCount;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-midnight via-carbon to-midnight text-white p-6 sm:p-8 shadow-banner border border-white/5">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 rounded-full bg-brand-500/25 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-editorial-italic font-normal tracking-normal">
              {schedule.event || "Examination Schedule"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              {schedule.semester || "Current Academic Session"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
              <p className="text-xs text-slate-400">Upcoming Exams</p>
              <p className="text-lg font-bold text-white">{upcomingCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Exam Items Grid */}
      {upcomingCount === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--line-subtle)] bg-[var(--surface-card)] p-12 text-center">
          <h3 className="text-lg font-bold text-[var(--ink-strong)]">
            No Upcoming Exams
          </h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)] max-w-sm mx-auto">
            {completedCount > 0
              ? `All ${completedCount} exam${completedCount === 1 ? "" : "s"} from this session have been completed.`
              : "Your exam timetable will appear here automatically once announced by the examination cell."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {preparedItems.map(({ item, paperNum, cleanedSubject, roomLabel, status, dateStr, timeStr }, index) => (
              <div
                key={`${item.subject}-${paperNum}-${index}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-5 shadow-card hover:shadow-elevated hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors duration-200"
              >
                <div>
                  {/* Top tags row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface-subtle)] text-[var(--ink-muted)] border border-[var(--line-subtle)]">
                      <BookOpen className="w-3 h-3" />
                      Paper {paperNum}
                    </span>

                    {status && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${status.variant}`}
                      >
                        {status.label}
                      </span>
                    )}
                  </div>

                  {/* Subject Name */}
                  <h4 className="text-base font-semibold text-[var(--ink-strong)] break-words leading-snug transition-colors">
                    {cleanedSubject}
                  </h4>

                  {/* Date & Time */}
                  <div className="mt-3.5 space-y-2 text-xs text-[var(--ink-muted)]">
                    <div className="flex items-center gap-2">
                      <span>{dateStr || "Date to be announced"}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-brand-600 shrink-0" />
                      <span>{timeStr || "Timing to be announced"}</span>
                    </div>
                  </div>
                </div>

                {/* Venue & Seat Footer */}
                <div className="mt-5 pt-3.5 border-t border-[var(--line-subtle)] flex items-center justify-between text-xs text-[var(--ink-muted)]">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--ink-strong)]">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                    <span>Room: {roomLabel || "TBA"}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-semibold text-[var(--ink-strong)]">
                    <Hash className="w-3.5 h-3.5 text-amber-500" />
                    <span>Seat: {item.seatno || "TBA"}</span>
                  </div>
                </div>
              </div>
          ))}
        </div>
      )}
    </div>
  );
};
