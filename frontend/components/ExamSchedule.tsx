"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ExamScheduleResponse } from "@/types";
import {
  Clock,
  MapPin,
  Hash,
  BookOpen,
} from "lucide-react";
import {
  cleanSubjectName,
  parseExamDateTime,
} from "@/lib/portalExam";

export interface ExamScheduleProps {
  schedule: ExamScheduleResponse;
  courseMap?: Record<string, string>;
}

/** Re-render status badges in long-lived tabs without polling ERP data. */
function useExamNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => {
      if (typeof document === "undefined" || !document.hidden) setNow(Date.now());
    };
    const interval = window.setInterval(update, 60 * 1000);
    document?.addEventListener?.("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document?.removeEventListener?.("visibilitychange", update);
    };
  }, []);

  return now;
}

function hasExplicitTime(str: string): boolean {
  if (!str) return false;
  // Exclude midnight-placeholder ISO timestamps like T00:00 or T00:00:00 — these are date-only entries.
  const withoutMidnight = str.replace(/T00:00(?::00)?(?:\.\d+)?Z?/gi, "");
  return /T\d{1,2}:\d{2}|(?:\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b)/i.test(withoutMidnight);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parsed = parseExamDateTime(dateStr);
    if (!parsed || isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString("en-IN", {
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

  const bracketMatch = startStr && startStr.match(/\(([^)]+)\)/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  if (startStr && !hasExplicitTime(startStr) && endStr && hasExplicitTime(endStr)) {
    return endStr;
  }

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

function getExamStatus(dateStr: string, now: number) {
  if (!dateStr) return null;
  try {
    const examDate = parseExamDateTime(dateStr);
    if (!examDate || isNaN(examDate.getTime())) return null;

    // Compare calendar days in IST, not in the device's local timezone.
    const istDay = (timestamp: number) =>
      Math.floor((timestamp + 5.5 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
    const today = istDay(now);
    const targetDay = istDay(examDate.getTime());
    const diffDays = targetDay - today;

    if (diffDays < 0) {
      return {
        label: "Completed",
        variant:
          "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700",
      };
    }
    if (diffDays === 0) {
      return {
        label: "Today",
        variant:
          "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 animate-pulse",
      };
    }
    if (diffDays === 1) {
      return {
        label: "Tomorrow",
        variant:
          "bg-neutral-100 dark:bg-neutral-800 text-[var(--ink-strong)] border-neutral-300 dark:border-neutral-600",
      };
    }
    return {
      label: `In ${diffDays} days`,
      variant:
        "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
    };
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
  const now = useExamNow();

  // Completed papers stay visible with a status badge. Hiding them made a
  // fully completed examination look like an empty timetable.
  const preparedItems = useMemo(() => {
    return (schedule.items || []).map((item, index) => ({
      item,
      paperNum: index + 1,
      cleanedSubject: cleanSubjectName(item.subject, courseMap),
      roomLabel: formatRoomCode(item.roomcode),
      status: getExamStatus(item.datetime, now),
      dateStr: formatDate(item.datetime),
      timeStr: formatTime(item.datetime, item.datetimeupto),
    }));
  }, [schedule.items, courseMap, now]);

  const scheduledCount = preparedItems.length;
  const hasNoExamTypes = (schedule.availableEvents?.length ?? 0) === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Exam Items Grid */}
      {scheduledCount === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--line-subtle)] bg-[var(--surface-card)] p-8 text-center sm:p-12">
          <h3 className="text-lg font-bold text-[var(--ink-strong)]">
            {hasNoExamTypes ? "No Examination Types Available" : "No Exams Scheduled"}
          </h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)] max-w-sm mx-auto">
            {hasNoExamTypes
              ? "CampusLynx has not published any exam types for this semester yet."
              : `No timetable entries were returned for ${schedule.event || "the selected examination"}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {preparedItems.map(
            ({ item, paperNum, cleanedSubject, roomLabel, status, dateStr, timeStr }, index) => (
              <div
                key={`${item.subject}-${item.datetime}-${item.seatno}-${index}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-4 shadow-card hover:shadow-elevated hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors duration-200 sm:p-5"
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
                <div className="mt-5 pt-3.5 border-t border-[var(--line-subtle)] flex items-center justify-between gap-2 text-[11px] text-[var(--ink-muted)] sm:text-xs">
                  <div className="flex min-w-0 items-center gap-1.5 font-semibold text-[var(--ink-strong)]">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                    <span className="truncate">Room: {roomLabel || "TBA"}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 font-semibold text-[var(--ink-strong)]">
                    <Hash className="w-3.5 h-3.5 text-amber-500" />
                    <span>Seat: {item.seatno || "TBA"}</span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
