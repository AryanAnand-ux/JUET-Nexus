"use client";

/**
 * Dashboard Page (Tab Keep-Alive Shell)
 *
 * Mounts Attendance immediately and keeps visited tabs (Performance, Exam
 * Schedule, Settings) alive with `hidden` so switching tabs is instantaneous
 * and preserves scroll & component state.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import type { DashboardTabId } from "@/components/MobileBottomNav";
import { AttendanceTracker } from "@/components/AttendanceTracker";
import { ExamFilterChips } from "@/components/ExamFilterChips";
import { useDashboard } from "@/hooks/useDashboard";
import { useExamSchedule } from "@/hooks/useExamSchedule";
import { useHydrated } from "@/hooks/useHydrated";
import { performLogout } from "@/utils/logout";
import { loadSession } from "@/lib/session";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useAttendanceTarget } from "@/context/AttendanceTargetContext";
import { AlertTriangle } from "lucide-react";
import { Typing } from "@/components/loading-ui/typing";

const PerformanceHub = dynamic(
  () => import("@/components/PerformanceHub").then((m) => m.PerformanceHub),
  { ssr: false }
);
const ExamSchedule = dynamic(
  () => import("@/components/ExamSchedule").then((m) => m.ExamSchedule),
  { ssr: false }
);
const VALID_TABS: DashboardTabId[] = ["attendance", "performance", "exam", "settings"];

function tabFromHash(): DashboardTabId {
  if (typeof window === "undefined") return "attendance";
  const h = window.location.hash.slice(1) as DashboardTabId;
  return VALID_TABS.includes(h) ? h : "attendance";
}

const ErrorBanner: React.FC<{
  error: { message: string; code?: string };
  onRetry?: () => void;
  onLogin?: () => void;
}> = ({ error, onRetry, onLogin }) => {
  const isAuthError =
    error.code === "NO_SESSION" ||
    error.code === "UNAUTHORIZED" ||
    error.code === "INVALID_SESSION" ||
    error.message?.toLowerCase().includes("authenticated");

  const displayMessage = isAuthError
    ? "Your session has expired. You can reconnect below or sign in again."
    : error.message;

  return (
    <div className="mb-6 border border-red-200 dark:border-red-900/50 rounded-2xl bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3 shadow-sm animate-shake">
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-red-700 dark:text-red-300 font-nunito">
          {displayMessage}
        </p>
        <div className="mt-2 flex items-center gap-4">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-sm font-bold text-red-700 dark:text-red-300 underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200 cursor-pointer"
            >
              Try again
            </button>
          )}
          {onLogin && (
            <button
              type="button"
              onClick={onLogin}
              className="text-sm font-bold text-brand-700 dark:text-brand-300 underline underline-offset-2 hover:text-brand-900 dark:hover:text-brand-200 cursor-pointer"
            >
              Sign in again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const LoadingSkeleton: React.FC<{ label?: string }> = ({
  label = "Loading your dashboard…",
}) => (
  <div className="space-y-6">
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400 dark:text-slate-500">
      <Typing size="lg" duration={0.9} className="text-[var(--accent-text)]" />
      <p className="text-sm font-semibold font-nunito tracking-wide animate-pulse">
        {label}
      </p>
    </div>
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="border border-[var(--line-subtle)] bg-[var(--surface-subtle)] rounded-2xl h-[280px] animate-pulse"
      />
    ))}
  </div>
);

/** Lazy-mounted Exam tab panel (only fetches when Exam tab is first visited). */
const ExamTabPanel: React.FC<{
  courseMap: Record<string, string>;
}> = ({ courseMap }) => {
  const {
    data: examData,
    isLoading,
    error,
    refresh,
    selectedEventId,
    selectEvent,
  } = useExamSchedule();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)]">
          Exam Schedule
        </h2>
      </div>

      {error && <ErrorBanner error={error} onRetry={() => refresh()} />}

      {examData && (examData.availableEvents?.length ?? 0) > 0 && (
        <ExamFilterChips
          events={examData.availableEvents ?? []}
          selectedEventId={selectedEventId}
          isLoading={isLoading}
          onSelect={selectEvent}
        />
      )}

      {isLoading && !examData ? (
        <LoadingSkeleton label="Loading exam schedule…" />
      ) : examData ? (
        <ExamSchedule
          schedule={examData}
          courseMap={courseMap}
        />
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--line-subtle)] bg-[var(--surface-card)] p-12 text-center">
          <h3 className="text-base font-bold text-[var(--ink-strong)]">
            No Exam Data Found
          </h3>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            Could not retrieve exam schedule for the current session.
          </p>
        </div>
      )}
    </div>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [enrollment, setEnrollment] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTabId>("attendance");
  const [visited, setVisited] = useState<Set<DashboardTabId>>(
    () => new Set<DashboardTabId>(["attendance"])
  );
  const { attendanceTarget } = useAttendanceTarget();

  // Sync initial hash + listen for browser back/forward hash changes
  useEffect(() => {
    const initial = tabFromHash();
    setActiveTab(initial);
    setVisited((prev) => {
      if (prev.has(initial)) return prev;
      const next = new Set(prev);
      next.add(initial);
      return next;
    });

    const onHash = () => {
      const nextTab = tabFromHash();
      setActiveTab(nextTab);
      setVisited((prev) => {
        if (prev.has(nextTab)) return prev;
        const next = new Set(prev);
        next.add(nextTab);
        return next;
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = useCallback((nextTab: DashboardTabId) => {
    setActiveTab(nextTab);
    setVisited((prev) => {
      if (prev.has(nextTab)) return prev;
      const next = new Set(prev);
      next.add(nextTab);
      return next;
    });
    if (typeof window !== "undefined") {
      const targetHash = nextTab === "attendance" ? "" : `#${nextTab}`;
      if (window.location.hash !== targetHash) {
        window.history.pushState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${targetHash}`
        );
      }
    }
  }, []);

  const activeEnrollment = isHydrated
    ? enrollment || loadSession()?.enrollment || null
    : null;

  const {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh,
    invalidateCache,
    cachedAt,
  } = useDashboard(activeEnrollment);

  const [isRefreshingData, setIsRefreshingData] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshingData || isLoading) return;
    setIsRefreshingData(true);
    await invalidateCache();
    setIsRefreshingData(false);
  };

  useEffect(() => {
    const session = loadSession();
    if (session?.token && session?.enrollment) {
      setEnrollment(session.enrollment);
    } else {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (data?.student?.name) {
      localStorage.setItem("studentName", data.student.name);
    }
  }, [data]);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  const courseMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (Array.isArray(data?.courses)) {
      for (const c of data.courses) {
        if (c.code && c.title) {
          map[String(c.code).toUpperCase()] = c.title;
        }
      }
    }
    return map;
  }, [data]);

  if (!activeEnrollment) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center font-nunito">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-[var(--ink-muted)]">Checking session...</p>
        </div>
      </div>
    );
  }

  const totalAttended = data?.attendance.reduce((sum, r) => sum + r.classesAttended, 0) || 0;
  const totalHeld = data?.attendance.reduce((sum, r) => sum + r.classesHeld, 0) || 0;
  const overallPct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;

  return (
    <DashboardLayout
      studentName={data?.student.name || "Student"}
      enrollment={data?.student.enrollment || activeEnrollment}
      attendanceRecords={data?.attendance}
      onLogout={handleLogout}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshingData || isLoading || isRefreshing}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {/* Tab 1: Attendance (always mounted) */}
      <div hidden={activeTab !== "attendance"}>
        {error && <ErrorBanner error={error} onRetry={refresh} onLogin={() => router.push("/login")} />}

        {isLoading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <div className="space-y-6">
            {totalHeld > 0 && (
              <div className="bg-[var(--surface-card)] border border-[var(--line-subtle)] rounded-[24px] p-6 shadow-card flex flex-col md:flex-row items-center justify-between gap-6 transition-colors">
                <div className="flex items-center gap-5 w-full md:w-auto">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-extrabold tabular-nums ${
                    overallPct >= attendanceTarget
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60"
                      : overallPct >= Math.max(0, attendanceTarget - 5)
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60"
                  }`}>
                    {overallPct % 1 === 0 ? overallPct.toFixed(0) : overallPct.toFixed(1)}%
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--ink-strong)]">Overall Attendance</h3>
                      <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-[0.14em] ${
                        overallPct >= attendanceTarget
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : overallPct >= Math.max(0, attendanceTarget - 5)
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}>
                        {overallPct >= attendanceTarget
                          ? "Good Standing"
                          : overallPct >= Math.max(0, attendanceTarget - 5)
                          ? "Caution Zone"
                          : "Critical"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] mt-1.5">
                      {totalAttended} of {totalHeld} total classes attended across all enrolled courses
                    </p>
                  </div>
                </div>
              </div>
            )}

            <AttendanceTracker
              attendanceRecords={data.attendance}
              isRefreshing={isRefreshingData || isLoading || isRefreshing}
            />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--line-subtle)] pt-6">
              <p className="text-xs text-[var(--ink-muted)]">
                Last synced: {cachedAt ? new Date(cachedAt).toLocaleString() : new Date().toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-8 text-center shadow-card">
            <h3 className="text-lg font-bold text-[var(--ink-strong)]">
              Your dashboard is temporarily unavailable
            </h3>
            <p className="mt-2 text-sm text-[var(--ink-muted)] max-w-md mx-auto">
              We could not reach the university portal. You can retry connecting or sign in again.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => refresh()}
                className="rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-primary/90 shadow-card active:scale-95 transition"
              >
                Try Reconnecting
              </button>
              <button
                type="button"
                onClick={() => {
                  performLogout().finally(() => router.push("/login"));
                }}
                className="rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-body)] hover:bg-[var(--surface-subtle)] active:scale-95 transition"
              >
                Sign in again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab 2: Performance (keep-alive once visited) */}
      {visited.has("performance") && (
        <div hidden={activeTab !== "performance"}>
          <div className="mb-8">
            <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)]">
              Academic Performance
            </h2>
          </div>
          {isLoading && !data ? (
            <LoadingSkeleton label="Loading performance data…" />
          ) : data ? (
            <PerformanceHub
              performance={data.performance}
              detailedMarks={data.detailedMarks}
            />
          ) : (
            <div className="border border-[var(--line-subtle)] rounded-[24px] bg-[var(--surface-card)] p-12 text-center shadow-card">
              <p className="text-sm text-[var(--ink-muted)]">
                No academic performance data available for this semester.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Exam Schedule (keep-alive once visited) */}
      {visited.has("exam") && (
        <div hidden={activeTab !== "exam"}>
          <ExamTabPanel courseMap={courseMap} />
        </div>
      )}

      {/* Tab 4: Settings (keep-alive once visited) */}
      {visited.has("settings") && (
        <div hidden={activeTab !== "settings"}>
          <div className="mx-auto w-full max-w-lg">
            <h2 className="text-2xl sm:text-3xl font-editorial-italic text-[var(--ink-strong)] mb-6">
              Settings
            </h2>
            <SettingsPanel
              studentName={data?.student.name}
              enrollment={data?.student.enrollment || activeEnrollment}
              branch={data?.student.branch}
              lastSyncedAt={cachedAt}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
