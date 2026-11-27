"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FigmaCard } from "@/components/base";
import { useAttendanceDetails } from "@/hooks/useAttendanceDetails";
import { calculateBunkStatus } from "@/utils/bunkHelpers";
import { performLogout } from "@/utils/logout";
import { Typing } from "@/components/loading-ui/typing";
import { AlertTriangle, Clock, Lock, RefreshCw, Calendar } from "lucide-react";

function safeDecodeSubject(val: string | string[] | undefined): string {
  const str = Array.isArray(val) ? val[0] : val;
  if (!str) return "Subject Details";
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function SubjectDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawId =
    (params?.id as string | string[] | undefined) ??
    searchParams.get("id") ??
    undefined;
  const subjectName = safeDecodeSubject(rawId);
  const detailLink = searchParams.get("link");

  // URL-passed percentages (available immediately)
  const urlPct = parseFloat(searchParams.get("pct") || "0");
  const urlLp = parseFloat(searchParams.get("lp") || "0");
  const urlTp = parseFloat(searchParams.get("tp") || "0");
  const urlPp = parseFloat(searchParams.get("pp") || "0");

  const [enrollment, setEnrollment] = useState<string | null>(null);
  const [recoveredLink, setRecoveredLink] = useState<string | null>(null);
  const [recoveredPct, setRecoveredPct] = useState<number | null>(null);
  const [recoveredLp, setRecoveredLp] = useState<number | null>(null);
  const [recoveredTp, setRecoveredTp] = useState<number | null>(null);
  const [recoveredPp, setRecoveredPp] = useState<number | null>(null);

  const activeDetailLink = detailLink || recoveredLink;
  const activePct = urlPct || (recoveredPct ?? 0);
  const activeLp = urlLp || (recoveredLp ?? 0);
  const activeTp = urlTp || (recoveredTp ?? 0);
  const activePp = urlPp || (recoveredPp ?? 0);

  // Interactive Calculator State
  const [targetPercentage, setTargetPercentage] = useState(75);
  const [extraAttends, setExtraAttends] = useState(0);
  const [extraBunks, setExtraBunks] = useState(0);
  const [retroFixes, setRetroFixes] = useState(0);

  const { data, isLoading, isRetrying, error, fetchDetails } = useAttendanceDetails(
    subjectName,
    activeDetailLink
  );

  useEffect(() => {
    const stored = localStorage.getItem("enrollment");
    if (!stored) {
      router.push("/login");
      return;
    }
    setEnrollment(stored);

    // If detailLink was not provided in the URL query string (direct visit or bookmark), recover from dashboard cache
    if (!detailLink) {
      try {
        const rawCache = localStorage.getItem(`juet_dashboard_cache_v3_${stored.trim().toUpperCase()}`);
        if (rawCache) {
          const parsed = JSON.parse(rawCache);
          if (Array.isArray(parsed?.data?.attendance)) {
            const match = parsed.data.attendance.find(
              (r: any) =>
                r.subject &&
                (r.subject.toLowerCase() === subjectName.toLowerCase() ||
                 r.subject.toLowerCase().includes(subjectName.toLowerCase()) ||
                 subjectName.toLowerCase().includes(r.subject.toLowerCase()))
            );
            if (match && match.detailLink) {
              setRecoveredLink(match.detailLink);
              if (match.percentage !== undefined) setRecoveredPct(match.percentage);
              if (match.lecturePercent !== undefined) setRecoveredLp(match.lecturePercent);
              if (match.tutorialPercent !== undefined) setRecoveredTp(match.tutorialPercent);
              if (match.practicalPercent !== undefined) setRecoveredPp(match.practicalPercent);
            }
          }
        }
      } catch {}
    }
  }, [router, detailLink, subjectName]);

  useEffect(() => {
    if (enrollment && activeDetailLink) fetchDetails();
  }, [enrollment, activeDetailLink, fetchDetails]);

  // Official baseline percentage from portal (authoritative API response takes precedence over URL param)
  const officialPct = data?.percentage !== undefined && data.percentage > 0 ? data.percentage : activePct;

  // The headline ring must match the dashboard exactly. The portal computes its
  // official percentage (`LTpercantage`) over a held-count the day-by-day logs
  // do not always reproduce (extra/makeup classes count toward "present" but not
  // "held"; the log endpoint also omits a class here and there), so deriving the
  // ring from raw log counts showed a different figure than the tracker. Anchor
  // the baseline to the official percentage instead: back out an attended count
  // from it across the log-derived held count, keeping it fractional so the
  // rest-state ring equals the official figure to the decimal. Simulation then
  // moves from that truth.
  const logHeld = data?.classesHeld ?? 0;
  const logAttended = data?.classesAttended ?? 0;
  const hasDetailData = logHeld > 0;
  const baseHeld = logHeld;
  const baseAttended =
    baseHeld > 0 && officialPct > 0 ? (officialPct / 100) * baseHeld : logAttended;
  const attendedCount = baseAttended + extraAttends;
  const totalCount = baseHeld + extraAttends + extraBunks;

  // Practical logs only stay out of the counts when L/T classes exist too
  // (practical-only subjects are counted in full).
  const { practicalsExcluded, recordedAbsences } = useMemo(() => {
    const logs = data?.logs;
    if (!logs || logs.length === 0) {
      return { practicalsExcluded: false, recordedAbsences: 0 };
    }
    const hasP = logs.some((l) => l.type === "Practical");
    const hasLT = logs.some((l) => l.type === "Lecture" || l.type === "Tutorial");
    const excluded = hasP && hasLT;
    let absences = 0;
    for (const l of logs) {
      if (l.status === "Absent" && !(excluded && l.type === "Practical")) {
        absences++;
      }
    }
    return { practicalsExcluded: excluded, recordedAbsences: absences };
  }, [data?.logs]);
  const fixes = Math.min(retroFixes, recordedAbsences);
  const retroPct = baseHeld > 0 ? Math.min(100, ((baseAttended + fixes) / baseHeld) * 100) : 0;
  // 1e-9 guards float error from the fractional baseAttended; fine for class counts.
  const retroNeeded = Math.max(0, Math.ceil((targetPercentage * baseHeld) / 100 - baseAttended - 1e-9));

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) return null;

  const handleAttend = () => {
    setExtraAttends((prev) => prev + 1);
  };

  const handleBunk = () => {
    setExtraBunks((prev) => prev + 1);
  };

  const undoAttend = () => {
    setExtraAttends((prev) => (prev > 0 ? prev - 1 : 0));
  };

  const undoBunk = () => {
    setExtraBunks((prev) => (prev > 0 ? prev - 1 : 0));
  };

  const resetSimulation = () => {
    setExtraAttends(0);
    setExtraBunks(0);
  };

  const displayPercent = totalCount > 0 ? (attendedCount / totalCount) * 100 : officialPct;

  const isMeetingTarget = displayPercent >= targetPercentage;

  const getRingColor = (percent: number) => {
    if (percent >= 85) return "text-green-500";
    if (percent >= 75) return "text-amber-500";
    return "text-red-500";
  };

  const getStatusBadgeColor = (percent: number) => {
    if (percent >= 85) return "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800";
    if (percent >= 75) return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
    return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
  };

  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, displayPercent) / 100) * circumference;

  // Compute action text only when we have raw counts
  let actionText = "";
  if (totalCount > 0) {
    const bunkStatus = calculateBunkStatus(attendedCount, totalCount, targetPercentage);
    if (bunkStatus.status === "critical") {
      if (bunkStatus.count === Infinity) {
        actionText = "It is impossible to reach 100% attendance.";
      } else {
        actionText = `Attend ${bunkStatus.count} consecutive class${bunkStatus.count !== 1 ? "es" : ""} to reach ${targetPercentage}%.`;
      }
    } else {
      actionText = bunkStatus.count > 0
        ? `You can safely miss ${bunkStatus.count} more class${bunkStatus.count !== 1 ? "es" : ""}.`
        : `You cannot miss any more classes without dropping below ${targetPercentage}%.`;
    }
  }

  return (
    <DashboardLayout
      studentName="Student"
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)] hover:text-[var(--accent-text)] transition-colors mb-3 inline-flex items-center gap-1.5"
        >
          ← Back to Dashboard
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0 pr-2">
            <h2 className="text-xl sm:text-3xl font-editorial-italic font-normal text-[var(--ink-strong)] tracking-normal break-words leading-snug">
              {subjectName}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${getStatusBadgeColor(officialPct)}`}>
              {officialPct % 1 === 0 ? officialPct.toFixed(0) : officialPct.toFixed(1)}% Overall
            </span>
            {activeLp > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-muted)]">
                L: {activeLp}%
              </span>
            )}
            {activeTp > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-muted)]">
                T: {activeTp}%
              </span>
            )}
            {activePp > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-muted)]">
                P: {activePp}%
              </span>
            )}
          </div>
        </div>
      </div>



      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* LEFT: Calculator */}
        <div className="xl:col-span-1 space-y-6">
          <FigmaCard heading="Attendance Calculator">
            {/* Ring */}
            <div className="flex justify-center my-6">
              <div className="relative w-40 h-40 flex items-center justify-center shrink-0 bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-full shadow-card">
                <svg className="transform -rotate-90 w-40 h-40">
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    className="text-gray-100 dark:text-slate-800"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`transition-all duration-700 ${getRingColor(displayPercent)}`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center p-2 text-center pointer-events-none">
                  <span className={`${
                    (displayPercent % 1 === 0 ? displayPercent.toFixed(0) : displayPercent.toFixed(1)).length >= 4
                      ? "text-3xl sm:text-4xl"
                      : "text-4xl sm:text-5xl"
                  } font-black tracking-tight text-[var(--ink-strong)] leading-none tabular-nums select-none`}>
                    {displayPercent % 1 === 0 ? displayPercent.toFixed(0) : displayPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            {totalCount > 0 && (
              <div className="flex justify-around text-center mb-6 border-y border-[var(--line-subtle)] py-4 bg-[var(--surface-subtle)] rounded-xl">
                <div>
                  <p className="text-xs uppercase font-bold text-gray-400 dark:text-slate-500 font-nunito">
                    Attended
                  </p>
                  <p className="text-2xl font-black text-[var(--ink-strong)]">
                    {Math.round(attendedCount)}
                  </p>
                </div>
                <div className="w-px bg-gray-200 dark:bg-slate-700" />
                <div>
                  <p className="text-xs uppercase font-bold text-gray-400 dark:text-slate-500 font-nunito">
                    Total
                  </p>
                  <p className="text-2xl font-black text-[var(--ink-strong)]">{totalCount}</p>
                </div>
              </div>
            )}

            {practicalsExcluded && (
              <p className="mb-6 -mt-3 text-center text-[11px] font-medium text-gray-400 dark:text-slate-500 font-nunito">
                Practicals appear in the log below but are excluded from the overall %, matching your portal.
              </p>
            )}

            {!hasDetailData && isLoading && (
              <div className="mb-6 py-3 flex flex-col items-center gap-2">
                <Typing size="sm" duration={0.8} className="text-[var(--accent-text)]" />
                <p className="text-xs font-medium text-gray-400 dark:text-slate-500 font-nunito">
                  Loading class counts from portal…
                </p>
              </div>
            )}

            {!hasDetailData && !isLoading && !detailLink && (
              <div className="mb-6 py-3 text-center">
                <p className="text-xs font-medium text-gray-400 dark:text-slate-500 font-nunito">
                  Daily log unavailable — showing overall percentage only.
                </p>
              </div>
            )}

            {/* Target Slider */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs uppercase font-bold tracking-wider text-gray-500 dark:text-slate-400 font-nunito">
                  Target Criteria
                </label>
                <span className="text-sm font-black bg-accent-primary text-white px-2.5 py-0.5 rounded-full font-nunito">
                  {targetPercentage}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={targetPercentage}
                onChange={(e) => setTargetPercentage(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />
            </div>

            {/* Action Text */}
            {totalCount > 0 && (
              <div
                className={`p-4 rounded-xl border mb-6 ${
                  isMeetingTarget
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-green-800 dark:text-green-300"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
                }`}
              >
                <p className="text-sm font-bold text-center font-nunito">
                  {actionText || "Simulate classes below."}
                </p>
              </div>
            )}

            {/* Buttons */}
            {totalCount > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Attend Class stepper */}
                  <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-green-500 text-white border-2 border-green-600 font-nunito">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-xs font-black">Attend</span>
                      {extraAttends > 0 && (
                        <span className="text-[10px] font-bold opacity-90">+{extraAttends}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={undoAttend}
                        disabled={extraAttends <= 0}
                        aria-label="Remove an attended class"
                        className="h-9 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white font-black text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        −
                      </button>
                      <button
                        onClick={handleAttend}
                        aria-label="Add an attended class"
                        className="h-9 flex items-center justify-center rounded-lg bg-white/25 hover:bg-white/35 text-white font-black text-base transition-all active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Skip Class stepper */}
                  <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-red-500 text-white border-2 border-red-600 font-nunito">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-xs font-black">Skip</span>
                      {extraBunks > 0 && (
                        <span className="text-[10px] font-bold opacity-90">+{extraBunks}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={undoBunk}
                        disabled={extraBunks <= 0}
                        aria-label="Remove a skipped class"
                        className="h-9 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white font-black text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        −
                      </button>
                      <button
                        onClick={handleBunk}
                        aria-label="Add a skipped class"
                        className="h-9 flex items-center justify-center rounded-lg bg-white/25 hover:bg-white/35 text-white font-black text-base transition-all active:scale-95"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {data && (extraAttends > 0 || extraBunks > 0) && (
                  <button
                    onClick={resetSimulation}
                    className="w-full mt-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] hover:text-[var(--ink-strong)] transition-colors"
                  >
                    ↻ Reset to Actual
                  </button>
                )}
              </>
            )}
          </FigmaCard>
          {hasDetailData && (
            <FigmaCard heading="Marked Absent by Mistake?">
              <div className="flex items-center justify-between gap-3 mb-4">
                <button
                  onClick={() => setRetroFixes((n) => Math.max(0, n - 1))}
                  disabled={fixes <= 0}
                  aria-label="Correct one fewer absence"
                  className="w-12 py-2 rounded-xl border border-[var(--line-subtle)] font-black disabled:opacity-40"
                >
                  −
                </button>
                <span className="text-sm font-bold text-[var(--ink-strong)] tabular-nums">
                  {fixes} of {recordedAbsences} absences corrected
                </span>
                <button
                  onClick={() => setRetroFixes((n) => Math.min(recordedAbsences, n + 1))}
                  disabled={fixes >= recordedAbsences}
                  aria-label="Correct one more absence"
                  className="w-12 py-2 rounded-xl bg-accent-primary text-white font-black disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <p className="text-sm font-bold text-center text-[var(--ink-strong)]">
                {officialPct.toFixed(1)}% → {retroPct.toFixed(1)}%
              </p>
              <p className="text-xs text-center text-[var(--ink-muted)] mt-1">
                {retroNeeded === 0
                  ? `Already at or above ${targetPercentage}%.`
                  : retroNeeded > recordedAbsences
                  ? `Correcting every absence still can't reach ${targetPercentage}%.`
                  : `Correct ${retroNeeded} absence${retroNeeded !== 1 ? "s" : ""} to reach ${targetPercentage}%.`}
              </p>
            </FigmaCard>
          )}
        </div>

        {/* RIGHT: Daily Log (isolated memoized panel so calculator slider/stepper drags stay 60fps) */}
        <SubjectDailyLogPanel
          data={data}
          isLoading={isLoading}
          isRetrying={isRetrying}
          error={error}
          detailLink={detailLink}
          onRetry={() => fetchDetails(true)}
          onLogin={() => router.push("/login")}
        />
      </div>
    </DashboardLayout>
  );
}

interface SubjectDailyLogPanelProps {
  data: import("@/types").AttendanceDetailsResponse | null;
  isLoading: boolean;
  isRetrying: boolean;
  error: { message: string; code?: string } | null;
  detailLink: string | null;
  onRetry: () => void;
  onLogin: () => void;
}

const SubjectDailyLogPanel = React.memo(function SubjectDailyLogPanel({
  data,
  isLoading,
  isRetrying,
  error,
  detailLink,
  onRetry,
  onLogin,
}: SubjectDailyLogPanelProps) {
  const [logFilter, setLogFilter] = useState<"all" | "present" | "absent">("all");

  const { presentCount, absentCount, parsedLogs } = useMemo(() => {
    const rawLogs = data?.logs ?? [];
    let present = 0;
    let absent = 0;
    const parsed = rawLogs.map((log) => {
      if (log.status === "Present") present++;
      else if (log.status === "Absent") absent++;
      const match = log.date.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})(?:\s*\((.*?)\))?/);
      return {
        log,
        displayDate: match ? match[1] : log.date,
        displayTime: match ? match[2]?.replace(/\s+/g, " ") : undefined,
      };
    });
    return { presentCount: present, absentCount: absent, parsedLogs: parsed };
  }, [data?.logs]);

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return parsedLogs;
    const target = logFilter === "present" ? "Present" : "Absent";
    return parsedLogs.filter((entry) => entry.log.status === target);
  }, [parsedLogs, logFilter]);

  const totalLogs = data?.logs?.length ?? 0;

  return (
        <div className="xl:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <h3 className="text-xl font-editorial-italic font-normal text-[var(--ink-strong)] flex items-center gap-2">
              <span>Day-by-Day Log</span>
              {(isRetrying || (isLoading && data)) && (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent-primary shrink-0" />
              )}
            </h3>

            {totalLogs > 0 && (
              <div className="flex items-center gap-1 bg-[var(--surface-subtle)] border border-[var(--line-subtle)] p-1 rounded-xl w-fit">
                <button
                  onClick={() => setLogFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-nunito transition-colors ${
                    logFilter === "all"
                      ? "bg-[var(--surface-card)] text-[var(--ink-strong)] shadow-card"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
                  }`}
                >
                  All ({totalLogs})
                </button>
                <button
                  onClick={() => setLogFilter("present")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-nunito transition-colors ${
                    logFilter === "present"
                      ? "bg-[var(--surface-card)] text-emerald-600 shadow-card"
                      : "text-slate-500 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400"
                  }`}
                >
                  Present ({presentCount})
                </button>
                <button
                  onClick={() => setLogFilter("absent")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-nunito transition-colors ${
                    logFilter === "absent"
                      ? "bg-[var(--surface-card)] text-rose-600 shadow-card"
                      : "text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  }`}
                >
                  Absent ({absentCount})
                </button>
              </div>
            )}
          </div>

          {isLoading && !data ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--line-subtle)]">
                <div className="flex items-center gap-3">
                  <Typing size="sm" duration={0.85} className="text-[var(--accent-text)]" />
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">
                    {isRetrying
                      ? "Re-connecting to CampusLynx..."
                      : "Fetching attendance logs from CampusLynx..."}
                  </span>
                </div>
                <span className="text-[10px] font-medium text-[var(--ink-muted)] animate-pulse hidden sm:inline">
                  Live ERP Sync
                </span>
              </div>

              <div className="bg-[var(--surface-card)] border border-[var(--line-subtle)] rounded-2xl overflow-hidden shadow-card">
                <div className="bg-[var(--surface-subtle)] border-b border-[var(--line-subtle)] grid grid-cols-3 p-4">
                  <div className="h-3 w-16 bg-[var(--line-subtle)] rounded animate-pulse" />
                  <div className="h-3 w-16 bg-[var(--line-subtle)] rounded animate-pulse" />
                  <div className="h-3 w-16 bg-[var(--line-subtle)] rounded animate-pulse justify-self-end sm:justify-self-start" />
                </div>
                <div className="divide-y divide-[var(--line-subtle)]">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="grid grid-cols-3 p-4 items-center gap-4 animate-pulse">
                      <div className="h-4 w-28 bg-[var(--surface-subtle)] rounded-lg" />
                      <div className="h-4 w-20 bg-[var(--surface-subtle)] rounded-lg" />
                      <div className="h-6 w-20 bg-[var(--surface-subtle)] rounded-full justify-self-end sm:justify-self-start" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : error && !data ? (
            <div className="border border-red-200/80 dark:border-red-900/40 rounded-2xl bg-red-50/60 dark:bg-red-950/20 p-6 sm:p-8 text-center shadow-card space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-sm">
                {error.code === "SESSION_EXPIRED" ? (
                  <Lock className="w-6 h-6" />
                ) : error.code === "ATTENDANCE_TIMEOUT" ? (
                  <Clock className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="text-base font-bold text-[var(--ink-strong)] font-nunito">
                  {error.code === "SESSION_EXPIRED"
                    ? "Session Expired"
                    : error.code === "ATTENDANCE_TIMEOUT"
                    ? "Request Timed Out"
                    : "Unable to Load Attendance Log"}
                </h4>
                <p className="text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed">
                  {error.message}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onRetry}
                  disabled={isLoading || isRetrying}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-[var(--surface-card)] text-[var(--ink-strong)] border border-[var(--line-subtle)] rounded-xl shadow-card hover:bg-[var(--surface-subtle)] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                  <span>{isRetrying ? "Retrying..." : "Retry Loading"}</span>
                </button>
                {error.code === "SESSION_EXPIRED" && (
                  <button
                    onClick={onLogin}
                    className="px-5 py-2.5 text-xs font-bold bg-accent-primary text-white rounded-xl shadow-card hover:bg-accent-primary/90 transition-colors cursor-pointer"
                  >
                    Log In Again
                  </button>
                )}
              </div>
            </div>
          ) : totalLogs > 0 ? (
            <div className="bg-[var(--surface-card)] border border-[var(--line-subtle)] rounded-2xl overflow-x-auto shadow-card">
              {error && (
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>CampusLynx is busy. Showing latest cached logs.</span>
                  </div>
                  <button
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="font-bold underline hover:no-underline shrink-0 cursor-pointer"
                  >
                    {isRetrying ? "Retrying..." : "Refresh"}
                  </button>
                </div>
              )}
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-subtle)] border-b border-[var(--line-subtle)]">
                    <th className="p-3 sm:p-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                      Date
                    </th>
                    <th className="p-3 sm:p-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                      Type
                    </th>
                    <th className="p-3 sm:p-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] text-right sm:text-left">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-sm font-medium text-[var(--ink-muted)] font-nunito">
                        No logs match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map(({ log, displayDate, displayTime }, i) => (
                      <tr
                        key={`${log.date}-${log.type}-${i}`}
                        className="border-b border-[var(--line-subtle)] hover:bg-[var(--surface-subtle)] transition-colors last:border-0"
                      >
                        <td className="p-3 sm:p-4 text-xs sm:text-sm font-semibold text-[var(--ink-strong)]">
                          <div className="flex flex-col">
                            <span className="font-semibold text-[var(--ink-strong)] whitespace-nowrap">{displayDate}</span>
                            {displayTime && (
                              <span className="text-[10px] font-normal text-[var(--ink-muted)] whitespace-nowrap">
                                {displayTime}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 sm:p-4 text-xs sm:text-sm text-[var(--ink-muted)] font-medium">
                          {log.type}
                        </td>
                        <td className="p-3 sm:p-4 text-right sm:text-left">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${
                              log.status === "Present"
                                ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                                : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              log.status === "Present" ? "bg-green-500" : "bg-red-500"
                            }`} />
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-[var(--line-subtle)] rounded-2xl bg-[var(--surface-card)] p-8 text-center shadow-card space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-subtle)] text-[var(--ink-muted)] flex items-center justify-center mx-auto">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--ink-strong)]">
                  No attendance records found
                </p>
                <p className="text-xs text-[var(--ink-muted)] max-w-sm mx-auto">
                  {detailLink
                    ? "The campus portal reports no individual class entries for this course yet."
                    : "Daily attendance log is not available for this subject."}
                </p>
              </div>
              {detailLink && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink-strong)] transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Check again</span>
                </button>
              )}
            </div>
          )}
        </div>
  );
});

export function SubjectDetailView() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--surface-page)] font-nunito">
          <p className="text-sm font-medium text-gray-400 dark:text-slate-500 animate-pulse">
            Loading…
          </p>
        </div>
      }
    >
      <SubjectDetailContent />
    </Suspense>
  );
}
