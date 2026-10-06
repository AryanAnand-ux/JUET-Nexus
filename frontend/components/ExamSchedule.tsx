"use client";

import React, { useState } from "react";
import type { ExamScheduleResponse, ExamScheduleItem } from "@/types";
import {
  Calendar,
  Clock,
  MapPin,
  Hash,
  Search,
  BookOpen,
  CalendarCheck,
  AlertCircle,
} from "lucide-react";

export interface ExamScheduleProps {
  schedule: ExamScheduleResponse;
  selectedEventId?: string | null;
  onSelectEvent?: (eventId: string) => void;
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
    const [, d, m, y, rest] = dmyMatch;
    const timeMatch = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      let hr = parseInt(timeMatch[1], 10);
      const min = parseInt(timeMatch[2], 10);
      const sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const mer = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
      if (mer === "PM" && hr < 12) hr += 12;
      if (mer === "AM" && hr === 12) hr = 0;
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), hr, min, sec);
    }
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
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
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // Reject phantom times: midnight local (12:00 am) or IST-offset UTC midnight (05:30 am).
    // Normalize narrow no-break space (\u202f) that en-IN locale may insert between time and am/pm.
    const normalizedTime = startTimeStr.replace(/\u202f/g, " ").toLowerCase();
    if (/^(?:12:00|05:30)\s*am$/.test(normalizedTime)) {
      return "";
    }

    if (endStr && hasExplicitTime(endStr)) {
      const end = parseExamDateTime(endStr);
      if (end && !isNaN(end.getTime())) {
        const endTimeStr = end.toLocaleTimeString("en-IN", {
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
      return { label: "Tomorrow", variant: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800" };
    }
    return { label: `In ${diffDays} days`, variant: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800" };
  } catch {
    return null;
  }
}

export const ExamSchedule: React.FC<ExamScheduleProps> = ({
  schedule,
  selectedEventId,
  onSelectEvent,
  courseMap,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const items = schedule.items || [];
  const filtered = items.filter((item) => {
    const cleaned = cleanSubjectName(item.subject, courseMap).toLowerCase();
    const rawSub = item.subject.toLowerCase();
    const room = item.roomcode.toLowerCase();
    const term = searchTerm.toLowerCase();
    return cleaned.includes(term) || rawSub.includes(term) || room.includes(term);
  });

  const availableEvents = schedule.availableEvents || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-950 text-white p-6 sm:p-8 shadow-xl border border-indigo-900/30">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-indigo-500/30">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Official Schedule</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {schedule.event || "Examination Schedule"}
            </h2>
            <p className="mt-1 text-sm text-indigo-200/80 font-medium">
              {schedule.semester || "Current Academic Session"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-3 rounded-2xl bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-indigo-200/70 font-medium">Total Exams</p>
                <p className="text-lg font-bold text-white">{items.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Exam Event Switcher Tabs */}
      {availableEvents.length > 1 && onSelectEvent && (
        <div className="flex flex-wrap gap-2 items-center p-1.5 bg-gray-100 dark:bg-slate-800/80 rounded-2xl w-fit border border-gray-200/60 dark:border-slate-700/60">
          {availableEvents.map((ev) => {
            const isSelected = selectedEventId
              ? selectedEventId === ev.exameventid
              : schedule.event === ev.exameventdesc;

            return (
              <button
                key={ev.exameventid}
                onClick={() => onSelectEvent(ev.exameventid)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50"
                }`}
              >
                {ev.exameventdesc}
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search exam by subject or room..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-shadow shadow-sm placeholder:text-gray-400 dark:placeholder:text-slate-500"
            />
          </div>
          <span className="text-xs text-gray-500 dark:text-slate-400 font-medium self-center sm:self-auto">
            Showing {filtered.length} of {items.length} exams
          </span>
        </div>
      )}

      {/* Exam Items Grid */}
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-500 mb-4 shadow-inner">
            <Calendar className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">
            No Upcoming Exams Scheduled
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
            Your exam timetable will appear here automatically once announced by the examination cell.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-gray-500 dark:text-slate-400">
          No exams found matching &ldquo;{searchTerm}&rdquo;
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item, index) => {
            const status = getExamStatus(item.datetime);
            const dateStr = formatDate(item.datetime);
            const timeStr = formatTime(item.datetime, item.datetimeupto);

            return (
              <div
                key={`${item.subject}-${index}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-gray-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200"
              >
                <div>
                  {/* Top tags row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                      <BookOpen className="w-3 h-3" />
                      Paper {index + 1}
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
                  <h4 className="text-base font-bold text-gray-900 dark:text-slate-100 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {cleanSubjectName(item.subject, courseMap)}
                  </h4>

                  {/* Date & Time */}
                  <div className="mt-3.5 space-y-2 text-xs font-medium text-gray-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                      <span>{dateStr || "Date to be announced"}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                      <span>{timeStr || "Timing to be announced"}</span>
                    </div>
                  </div>
                </div>

                {/* Venue & Seat Footer */}
                <div className="mt-5 pt-3.5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-slate-200">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                    <span>Room: {item.roomcode || "TBA"}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-slate-200">
                    <Hash className="w-3.5 h-3.5 text-amber-500" />
                    <span>Seat: {item.seatno || "TBA"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
