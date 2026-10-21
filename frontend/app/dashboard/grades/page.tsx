"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useDashboard } from "@/hooks/useDashboard";
import { useGrades } from "@/hooks/useGrades";
import { GradeCard } from "@/components/GradeCard";
import { performLogout } from "@/utils/logout";
import { ArrowLeft, RefreshCw, Award } from "lucide-react";
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
      <p className="text-sm font-medium tracking-wide animate-pulse">Loading your grades…</p>
    </div>
    <div className="flex gap-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-9 w-24 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--line-subtle)] animate-pulse" />
      ))}
    </div>
    <div className="h-44 rounded-3xl bg-[var(--surface-subtle)] border border-[var(--line-subtle)] animate-pulse" />
    <div className="h-80 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--line-subtle)] animate-pulse" />
  </div>
);

export default function GradesPage() {
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
  const { data: gradesData, isLoading, error, refresh } = useGrades();

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
          <div>
            <Link
              href="/dashboard"
              prefetch={false}
              className="inline-flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-100 hover:text-brand-700 transition-colors w-fit mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Link>
            <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)] flex items-center gap-2.5">
              Gradebook
              <Award className="w-5 h-5 text-brand-600" />
            </h2>
          </div>

          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-strong)] text-xs font-semibold shadow-card hover:bg-[var(--surface-subtle)] transition-colors self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh Grades</span>
          </button>
        </div>

        {error && <ErrorBanner error={error} />}

        {isLoading ? (
          <LoadingSkeleton />
        ) : gradesData ? (
          <GradeCard grades={gradesData} />
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--line-subtle)] bg-[var(--surface-card)] p-12 text-center">
            <Award className="w-12 h-12 text-[var(--ink-muted)] opacity-50 mx-auto mb-3" />
            <h3 className="text-base font-bold text-[var(--ink-strong)]">
              No Grade Data Found
            </h3>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              Could not retrieve grade records for this student.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
