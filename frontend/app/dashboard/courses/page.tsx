"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useDashboard } from "@/hooks/useDashboard";
import { performLogout } from "@/utils/logout";
import { ArrowLeft, RefreshCw, Search, BookOpen, Layers, Award } from "lucide-react";
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
      <p className="text-sm font-medium tracking-wide animate-pulse">Loading your courses…</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="border border-[var(--line-subtle)] bg-[var(--surface-subtle)] rounded-[20px] h-[160px] animate-pulse shadow-card"
        />
      ))}
    </div>
  </div>
);

export default function CoursesPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const storedEnrollment = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
    if (!storedEnrollment) {
      router.push("/login");
    } else {
      setEnrollment(storedEnrollment);
    }
  }, [router]);

  const { data, isLoading, error, invalidateCache } = useDashboard(enrollment);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) return null;

  // Filter courses by search term
  const courses = data?.courses || [];
  // The new portal exposes no per-subject credits; when every course reports
  // 0, hide the credits UI rather than displaying rows of "0 Credits".
  const hasCredits = courses.some((course) => course.credits > 0);
  const filteredCourses = courses.filter(
    (course) =>
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout
      studentName={data?.student.name || "Student"}
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      {/* Header bar and Actions */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard"
              className="text-xs font-semibold text-brand-600 dark:text-brand-100 hover:text-brand-700 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Attendance
            </Link>
          </div>
          <h2 className="text-3xl font-editorial-italic text-[var(--ink-strong)]">
            Registered Courses
          </h2>
        </div>
        
        <button
          onClick={invalidateCache}
          disabled={isLoading}
          className="flex items-center gap-2 border border-[var(--line-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)] text-[var(--ink-strong)] rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50 transition-all shadow-card active:scale-95 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
          <span>Sync Curriculum</span>
        </button>
      </div>

      {error && <ErrorBanner error={error} />}

      {/* Search and Stats Summary */}
      {data && courses.length > 0 && (
        <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
            <input
              type="text"
              placeholder="Search course or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-card)] border border-[var(--line-subtle)] rounded-xl text-base sm:text-sm font-medium text-[var(--ink-strong)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all touch-manipulation"
            />
          </div>

          {/* Stats Badges */}
          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl px-4 py-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-600" />
              <span className="text-xs font-semibold text-[var(--ink-strong)]">
                {courses.length} Courses Total
              </span>
            </div>
            {hasCredits && (
            <div className="bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-xl px-4 py-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-[var(--ink-strong)]">
                {courses.reduce((acc, c) => acc + c.credits, 0)} Total Credits
              </span>
            </div>
            )}
          </div>
        </div>
      )}

      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data && courses.length > 0 ? (
        <>
          {filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => {
                // Color mapping for course types
                const badgeColor =
                  course.type === "Theory"
                    ? "bg-neutral-100 dark:bg-neutral-800 text-[var(--ink-strong)] border-[var(--line-subtle)]"
                    : course.type === "Practical"
                    ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/50 dark:border-purple-900/50"
                    : course.type === "Project"
                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/50 dark:border-rose-900/50"
                    : "bg-neutral-100 dark:bg-neutral-800 text-[var(--ink-strong)] border-[var(--line-subtle)]";

                return (
                  <div
                    key={course.code}
                    className="group border border-[var(--line-subtle)] bg-[var(--surface-card)] rounded-[20px] p-5 shadow-card hover:shadow-elevated transition-all duration-300 hover:border-brand-500/40 hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px]"
                  >
                    <div>
                      {/* Code and Credits */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-xs font-bold text-brand-700 dark:text-brand-100 tracking-wider font-mono bg-brand-50 dark:bg-brand-500/15 border border-brand-100 dark:border-brand-500/30 px-2.5 py-1 rounded-lg">
                          {course.code}
                        </span>
                        {hasCredits && (
                        <span className="text-xs font-medium text-[var(--ink-muted)] flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" /> {course.credits} Credits
                        </span>
                        )}
                      </div>

                      {/* Course Title */}
                      <h3 className="font-semibold text-[var(--ink-strong)] text-lg leading-snug group-hover:text-[var(--accent-text)] transition-colors">
                        {course.title}
                      </h3>
                    </div>

                    {/* Badge / Footer */}
                    <div className="mt-4 pt-3 border-t border-[var(--line-subtle)] flex items-center justify-between">
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] border px-2.5 py-0.5 rounded-full ${badgeColor}`}>
                        {course.type}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-[var(--line-subtle)] rounded-[24px] bg-[var(--surface-card)] p-12 text-center shadow-card">
              <p className="text-sm text-[var(--ink-muted)]">
                No courses match your search &quot;{searchTerm}&quot;.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="border border-[var(--line-subtle)] rounded-[24px] bg-[var(--surface-card)] p-12 text-center shadow-card">
          <p className="text-sm text-[var(--ink-muted)] mb-4">
            No registered courses data available. Let&apos;s sync your portal curriculum.
          </p>
          <button
            onClick={invalidateCache}
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
