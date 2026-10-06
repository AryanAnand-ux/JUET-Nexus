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
import { useSessionKeepAlive } from "@/hooks/useSessionKeepAlive";
import { performLogout } from "@/utils/logout";
import { AlertTriangle, MapPin, RefreshCw, Copy, Check } from "lucide-react";
import { NotificationToggle } from "@/components/NotificationToggle";

/**
 * Error Display Component
 */
const ErrorBanner: React.FC<{ error: { message: string } }> = ({ error }) => (
  <div className="mb-6 border border-red-200 rounded-2xl bg-red-50 p-4 flex items-start gap-3 shadow-sm animate-shake">
    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
    <p className="text-sm font-medium text-red-700 font-nunito">
      {error.message}
    </p>
  </div>
);

/**
 * Loading Skeleton Component
 */
const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="border border-gray-100 dark:border-slate-800 bg-gray-100 dark:bg-slate-800/60 rounded-2xl h-[280px] animate-pulse shadow-sm"
      />
    ))}
  </div>
);

export default function DashboardPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data,
    isLoading,
    error,
    invalidateCache,
    cachedAt,
  } = useDashboard(enrollment);

  // Proactively refresh the portal token every 10 min + on app foreground
  // Prevents the 15-min CampusLynx token from expiring between sessions
  useSessionKeepAlive(!!enrollment);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
    if (stored) {
      setEnrollment(stored);
    } else {
      router.push("/login");
    }
  }, [router]);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  const handleCopyEnrollment = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!enrollment) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center font-nunito">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-gray-500 dark:text-slate-400">Checking session...</p>
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
      {/* Header Section — Premium Gradient Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[24px] p-6 md:p-8 mb-8 border border-slate-800 shadow-xl">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[250px] h-[250px] bg-violet-600/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
              Academic Portal
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-2 tracking-tight font-nunito leading-tight">
              {data?.student.name ? `Welcome back, ${data.student.name}.` : "Welcome back."}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300 font-medium">
              <span className="flex items-center">
                <MapPin className="w-4 h-4 mr-1.5 flex-shrink-0 text-indigo-400" /> 
                {data?.student.branch || "Academic Branch"}
              </span>
              {data?.student.enrollment && (
                <>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={() => handleCopyEnrollment(data.student.enrollment)}
                    title="Click to copy enrollment number"
                    className="group bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 px-3 py-1 rounded-full text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>{data.student.enrollment}</span>
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors" />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 self-start md:self-center flex flex-wrap items-center gap-3">
            <NotificationToggle enrollment={enrollment} />
            <button
              onClick={invalidateCache}
              disabled={isLoading}
              className="flex items-center gap-2 border border-slate-700 bg-slate-800/80 hover:bg-slate-800 hover:border-indigo-500 text-white rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 transition-all shadow-lg hover:shadow-indigo-950/20 active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
              <span>Sync Portal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && <ErrorBanner error={error} />}

      {/* Loading State */}
      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <div className="space-y-6">
          {/* Overall Attendance Summary Banner */}
          {totalHeld > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-colors">
              <div className="flex items-center gap-5 w-full md:w-auto">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-2xl font-nunito ${
                  overallPct >= 75
                    ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-900/60"
                    : overallPct >= 70
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60"
                }`}>
                  {overallPct.toFixed(0)}%
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-nunito">Overall Attendance</h3>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      overallPct >= 75
                        ? "bg-green-100/70 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : overallPct >= 70
                        ? "bg-amber-100/70 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-rose-100/70 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    }`}>
                      {overallPct >= 75 ? "Good Standing" : overallPct >= 70 ? "Caution Zone" : "Critical"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-400 font-medium font-nunito mt-1">
                    {totalAttended} of {totalHeld} total classes attended across all enrolled courses
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 w-full md:w-auto justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 dark:border-slate-800">
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Academic Standing</p>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 font-nunito">
                    {overallPct >= 75 ? "Eligible for Examinations" : "Below 75% Requirement"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Attendance Tracker Component */}
          <AttendanceTracker attendanceRecords={data.attendance} />

          {/* Footer Info */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-slate-800 pt-6">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 font-nunito">
              Last synced: {cachedAt ? new Date(cachedAt).toLocaleString() : new Date().toLocaleString()}
            </p>
            <p className="text-xs font-medium text-gray-400 dark:text-slate-500 font-nunito">
              Secure portal session is active and verified.
            </p>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
