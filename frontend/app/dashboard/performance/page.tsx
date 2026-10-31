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
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Typing } from "@/components/loading-ui/typing";

import { useToast } from "@/context/ToastContext";

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

  const { data, isLoading, error, invalidateCache } = useDashboard(enrollment);
  const toast = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (isSyncing || isLoading) return;
    setIsSyncing(true);
    const success = await invalidateCache();
    setIsSyncing(false);
    if (success) {
      toast.success("Academic standings synced successfully");
    } else {
      toast.error("Failed to sync academic standings. Please try again.");
    }
  };

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
      onRefresh={handleSync}
      isRefreshing={isSyncing || isLoading}
    >
      {/* Header bar and Navigation */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Link 
            href="/dashboard" 
            prefetch={false}
            className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-strong)] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Attendance
          </Link>
        </div>
        <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)]">
          Academic Performance
        </h2>
      </div>

      {error && <ErrorBanner error={error} />}

      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <PerformanceHub performance={data.performance} detailedMarks={data.detailedMarks} />
      ) : (
        <div className="border border-[var(--line-subtle)] rounded-[24px] bg-[var(--surface-card)] p-12 text-center shadow-card">
          <p className="text-sm text-[var(--ink-muted)]">
            No academic performance data available for this semester.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
