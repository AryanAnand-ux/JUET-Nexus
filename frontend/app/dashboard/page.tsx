"use client";

/**
 * Dashboard Page
 * Main entry point for authenticated users
 * Displays all dashboard widgets with a premium visual design
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AttendanceTracker } from "@/components/AttendanceTracker";
import { useDashboard } from "@/hooks/useDashboard";
import { usePortalRecovery } from "@/hooks/usePortalRecovery";
import { performLogout } from "@/utils/logout";
import { apiClient } from "@/utils/api";
import { AlertTriangle } from "lucide-react";
import { Typing } from "@/components/loading-ui/typing";

/**
 * Error Display Component
 */
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
        <p className="text-sm font-medium text-red-700 dark:text-red-300 font-nunito">{displayMessage}</p>
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

/**
 * Loading Skeleton Component
 */
const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400 dark:text-slate-500">
      <Typing size="lg" duration={0.9} className="text-[var(--accent-text)]" />
      <p className="text-sm font-semibold font-nunito tracking-wide animate-pulse">
        Loading your dashboard…
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

export default function DashboardPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refresh,
    invalidateCache,
    cachedAt,
  } = useDashboard(enrollment);
  const recovery = usePortalRecovery(enrollment, async () => {
    await refresh();
  });

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
    if (stored) {
      setEnrollment(stored);
    } else {
      let cancelled = false;
      apiClient
        .get("/api/auth/session")
        .then((res: any) => {
          if (!cancelled && res.data?.success && res.data?.enrollment) {
            const enr = res.data.enrollment.toUpperCase();
            if (typeof window !== "undefined") {
              localStorage.setItem("enrollment", enr);
              localStorage.setItem("role", "Student");
              if (res.data.sessionToken) {
                localStorage.setItem("sessionToken", res.data.sessionToken);
              }
            }
            setEnrollment(enr);
          } else if (!cancelled) {
            router.push("/login");
          }
        })
        .catch(() => {
          if (!cancelled) {
            router.push("/login");
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [router]);

  // Cache student name for the Settings page (Feedback) and sidebar
  useEffect(() => {
    if (data?.student?.name) {
      localStorage.setItem("studentName", data.student.name);
    }
  }, [data]);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) {
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
      enrollment={data?.student.enrollment || enrollment}
      onLogout={handleLogout}
      onRefresh={invalidateCache}
      isRefreshing={isLoading}
    >
      {/* Header Section — Compact welcome banner */}
      <div className="relative overflow-hidden bg-midnight dark:bg-carbon rounded-[20px] px-5 py-4 sm:px-6 sm:py-5 mb-6 border border-white/5 shadow-banner">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl text-white leading-tight font-editorial-italic">
              {data?.student.name
                ? <span>Welcome back, <span className="text-brand-100">{data.student.name}</span>.</span>
                : <span>Welcome back.</span>}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 truncate">
              {data?.student.branch || "Academic Branch"}
            </p>
          </div>

          {data?.student.enrollment && (
            <span className="inline-flex items-center shrink-0 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-200 font-mono tabular-nums">
              {data.student.enrollment}
            </span>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && <ErrorBanner error={error} onRetry={refresh} onLogin={() => router.push("/login")} />}
      {error && ["SESSION_EXPIRED", "SESSION_RENEWING", "RELOGIN_FAILED", "NO_SESSION", "INVALID_SESSION"].includes(error.code || "") && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
            We couldn&apos;t reconnect to the portal automatically. Enter your portal password to
            reconnect — future reconnects will happen on their own.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={recovery.password}
              onChange={(event) => recovery.setPassword(event.target.value)}
              placeholder="Portal password"
              autoComplete="current-password"
              className="rounded-xl border border-amber-300 bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--ink-strong)] dark:border-amber-800"
            />
            <button
              type="button"
              onClick={() => void recovery.recover()}
              disabled={recovery.isRecovering}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {recovery.isRecovering ? "Reconnecting…" : "Reconnect portal"}
            </button>
          </div>
          {recovery.error && <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{recovery.error}</p>}
        </div>
      )}

      {/* Loading State */}
      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <div className="space-y-6">
          {/* Overall Attendance Summary Banner */}
          {totalHeld > 0 && (
            <div className="bg-[var(--surface-card)] border border-[var(--line-subtle)] rounded-[24px] p-6 shadow-card flex flex-col md:flex-row items-center justify-between gap-6 transition-colors">
              <div className="flex items-center gap-5 w-full md:w-auto">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-extrabold tabular-nums ${
                  overallPct >= 75
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60"
                    : overallPct >= 70
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60"
                }`}>
                  {overallPct % 1 === 0 ? overallPct.toFixed(0) : overallPct.toFixed(1)}%
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--ink-strong)]">Overall Attendance</h3>
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-[0.14em] ${
                      overallPct >= 75
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : overallPct >= 70
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    }`}>
                      {overallPct >= 75 ? "Good Standing" : overallPct >= 70 ? "Caution Zone" : "Critical"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-muted)] mt-1.5">
                    {totalAttended} of {totalHeld} total classes attended across all enrolled courses
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Attendance Tracker Component */}
          <AttendanceTracker attendanceRecords={data.attendance} />

          {/* Footer Info */}
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
    </DashboardLayout>
  );
}
