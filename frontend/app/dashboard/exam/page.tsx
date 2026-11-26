"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useHydrated } from "@/hooks/useHydrated";
import { useExamSchedule } from "@/hooks/useExamSchedule";
import { loadSession } from "@/lib/session";
import { ExamSchedule } from "@/components/ExamSchedule";
import { performLogout } from "@/utils/logout";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Typing } from "@/components/loading-ui/typing";

const ErrorBanner: React.FC<{ error: { message: string } }> = ({ error }) => (
  <div className="mb-6 border border-red-200 dark:border-red-900/50 rounded-2xl bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3 shadow-sm">
    <span className="text-red-500 mt-0.5">⚠</span>
    <p className="text-sm font-medium text-red-700 dark:text-red-300">
      {error.message}
    </p>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-[var(--ink-muted)]">
      <Typing size="lg" duration={0.9} className="text-[var(--accent-text)]" />
      <p className="text-sm font-medium tracking-wide animate-pulse">Loading exam schedule…</p>
    </div>
    <div className="h-40 rounded-3xl bg-[var(--surface-subtle)] border border-[var(--line-subtle)] animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="border border-[var(--line-subtle)] bg-[var(--surface-subtle)] rounded-2xl h-44 animate-pulse"
        />
      ))}
    </div>
  </div>
);

export default function ExamPage() {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [enrollment, setEnrollment] = useState<string | null>(null);

  const activeEnrollment = isHydrated
    ? enrollment || loadSession()?.enrollment || null
    : null;

  useEffect(() => {
    if (!isHydrated) return;
    const session = loadSession();
    if (!session?.token || !session?.enrollment) {
      router.replace("/login");
    } else {
      setEnrollment(session.enrollment);
    }
  }, [router, isHydrated]);

  const { data: examData, isLoading, error, refresh } = useExamSchedule();

  // Read cached studentName & courseMap synchronously from localStorage so
  // visiting /dashboard/exam never triggers an unrelated background /api/dashboard refresh.
  const { studentName, courseMap } = React.useMemo(() => {
    const map: Record<string, string> = {};
    let name = "Student";
    if (!isHydrated || typeof window === "undefined" || !activeEnrollment) {
      return { studentName: name, courseMap: map };
    }
    name = localStorage.getItem("studentName") || "Student";
    try {
      const raw = localStorage.getItem(`juet_dashboard_cache_v3_${activeEnrollment.trim().toUpperCase()}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const dashboardData = parsed?.data;
        if (dashboardData?.student?.name) name = dashboardData.student.name;
        if (Array.isArray(dashboardData?.courses)) {
          for (const c of dashboardData.courses) {
            if (c.code && c.title) {
              map[String(c.code).toUpperCase()] = c.title;
            }
          }
        }
        if (Array.isArray(dashboardData?.attendance)) {
          for (const a of dashboardData.attendance) {
            if (a.subject && a.detailLink) {
              const match = String(a.detailLink).match(/code=([^&]+)/);
              if (match && match[1]) {
                const code = decodeURIComponent(match[1]).toUpperCase();
                map[code] = a.subject;
              }
            }
          }
        }
      }
    } catch {
      // Best-effort cache lookup
    }
    return { studentName: name, courseMap: map };
  }, [isHydrated, activeEnrollment]);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!activeEnrollment) return null;

  return (
    <DashboardLayout
      studentName={studentName}
      enrollment={activeEnrollment}
      onLogout={handleLogout}
      onRefresh={refresh}
      isRefreshing={isLoading}
    >
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-strong)] transition-colors w-fit mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
            <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)]">
              Exam Schedule
            </h2>
          </div>

          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-strong)] text-xs font-semibold shadow-card hover:bg-[var(--surface-subtle)] transition-colors self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh Schedule</span>
          </button>
        </div>

        {error && <ErrorBanner error={error} />}

        {isLoading ? (
          <LoadingSkeleton />
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
    </DashboardLayout>
  );
}
