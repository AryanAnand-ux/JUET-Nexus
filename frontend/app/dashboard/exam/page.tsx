"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useDashboard } from "@/hooks/useDashboard";
import { useExamSchedule } from "@/hooks/useExamSchedule";
import { ExamSchedule } from "@/components/ExamSchedule";
import { performLogout } from "@/utils/logout";
import { ArrowLeft, RefreshCw, Calendar } from "lucide-react";
import Link from "next/link";
import { Typing } from "@/components/loading-ui/typing";

const ErrorBanner: React.FC<{ error: { message: string } }> = ({ error }) => (
  <div className="mb-6 border border-red-200 dark:border-red-900/50 rounded-2xl bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3 shadow-sm">
    <span className="text-red-500 mt-0.5">⚠</span>
    <p className="text-sm font-medium text-red-700 dark:text-red-300 font-nunito">
      {error.message}
    </p>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-400 dark:text-slate-500">
      <Typing size="lg" duration={0.9} className="text-accent-primary" />
      <p className="text-sm font-semibold font-nunito tracking-wide animate-pulse">Loading exam schedule…</p>
    </div>
    <div className="h-40 rounded-3xl bg-gray-200 dark:bg-slate-800 animate-pulse" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 rounded-2xl h-44 animate-pulse"
        />
      ))}
    </div>
  </div>
);

export default function ExamPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<string | null>(null);

  useEffect(() => {
    const storedEnrollment = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
    if (!storedEnrollment) {
      router.push("/login");
    } else {
      setEnrollment(storedEnrollment);
    }
  }, [router]);

  const { data: dashboardData } = useDashboard(enrollment);
  const { data: examData, isLoading, error, refresh, selectedEventId, selectEvent } = useExamSchedule();

  const courseMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (dashboardData?.courses) {
      for (const c of dashboardData.courses) {
        if (c.code && c.title) {
          map[c.code.toUpperCase()] = c.title;
        }
      }
    }
    if (dashboardData?.attendance) {
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
    return map;
  }, [dashboardData]);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) return null;

  return (
    <DashboardLayout
      studentName={dashboardData?.student?.name || "Student"}
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>

          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs font-bold shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors self-start sm:self-auto disabled:opacity-50"
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
            selectedEventId={selectedEventId}
            onSelectEvent={selectEvent}
            courseMap={courseMap}
          />
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-800 dark:text-slate-200">
              No Exam Data Found
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Could not retrieve exam schedule for the current session.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
