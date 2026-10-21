"use client";

/**
 * Performance Page
 * Displays the CGPA Viewer (PerformanceHub) with a premium visual design
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { performLogout } from "@/utils/logout";
import { PerformanceHub } from "@/components/PerformanceHub";
import { useDashboard } from "@/hooks/useDashboard";
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
      <p className="text-sm font-medium tracking-wide animate-pulse">Loading performance data…</p>
    </div>
    <div className="border border-[var(--line-subtle)] bg-[var(--surface-subtle)] rounded-[24px] h-[350px] animate-pulse shadow-card" />
  </div>
);

export default function PerformancePage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = React.useState<string | null>(null);

  useEffect(() => {
    const storedEnrollment = localStorage.getItem("enrollment");
    if (!storedEnrollment) {
      router.push("/login");
    } else {
      setEnrollment(storedEnrollment);
    }
  }, [router]);

  const { data, isLoading, error, refresh } = useDashboard(enrollment);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) return null;

  return (
    <DashboardLayout
      studentName={data?.student.name || "Loading..."}
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      {/* Header bar and Actions */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link 
              href="/dashboard" 
              prefetch={false}
              className="text-xs font-semibold text-brand-600 dark:text-brand-100 hover:text-brand-700 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Attendance
            </Link>
          </div>
          <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)]">
            Academic Performance
          </h2>
        </div>
        
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 border border-[var(--line-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)] text-[var(--ink-strong)] rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50 transition-all shadow-card active:scale-95 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
          <span>Sync Academic Standings</span>
        </button>
      </div>

      {error && <ErrorBanner error={error} />}

      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <PerformanceHub performance={data.performance} detailedMarks={data.detailedMarks} />
      ) : (
        <div className="border border-[var(--line-subtle)] rounded-[24px] bg-[var(--surface-card)] p-12 text-center shadow-card">
          <p className="text-sm text-[var(--ink-muted)] mb-4">
            No performance data available. Let&apos;s sync your portal standings.
          </p>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-accent-primary hover:bg-accent-hover text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> Sync Now
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
