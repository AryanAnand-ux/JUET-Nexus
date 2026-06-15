"use client";

/**
 * Dashboard Page
 * Main entry point for authenticated users
 * Displays all dashboard widgets with a premium visual design
 */

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { BunkMeter } from "@/components/BunkMeter";
import { useDashboard } from "@/hooks/useDashboard";
import { performLogout } from "@/utils/logout";
import { AlertTriangle, MapPin, RefreshCw } from "lucide-react";
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
        className="border border-gray-100 bg-gray-50 rounded-2xl h-[280px] animate-pulse shadow-sm"
      />
    ))}
  </div>
);

export default function DashboardPage() {
  const router = useRouter();
  // Get enrollment from storage or redirect
  const [enrollment, setEnrollment] = React.useState<string | null>(null);
  const {
    data,
    isLoading,
    error,
    invalidateCache,
    cachedAt,
  } = useDashboard(enrollment);

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

  if (!enrollment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-nunito">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-gray-500">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      studentName={data?.student.name || "Student"}
      enrollment={data?.student.enrollment || enrollment}
      onLogout={handleLogout}
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
                  <span className="bg-slate-800 border border-slate-700/80 px-2.5 py-0.5 rounded-full text-xs font-bold text-slate-300">
                    {data.student.enrollment}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 self-start md:self-center flex flex-wrap items-center gap-3">
            <NotificationToggle enrollment={enrollment} />
            <button
              onClick={invalidateCache}
              disabled={isLoading}
              className="flex items-center gap-2 border border-slate-700 bg-slate-800/80 hover:bg-slate-800 hover:border-indigo-500 text-white rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 transition-all shadow-lg hover:shadow-indigo-950/20 active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
              <span>Sync WebKiosk</span>
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
          {/* Bunk Meter Widget */}
          <BunkMeter attendanceRecords={data.attendance} />

          {/* Footer Info */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 pt-6">
            <p className="text-xs font-bold text-gray-400 font-nunito">
              Last synced: {cachedAt ? new Date(cachedAt).toLocaleString() : new Date().toLocaleString()}
            </p>
            <p className="text-xs font-medium text-gray-400 font-nunito">
              Secure WebKiosk session is active and verified.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-[24px] bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-500 font-nunito mb-4">
            No data available. Let&apos;s sync your WebKiosk credentials.
          </p>
          <button
            onClick={invalidateCache}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> Sync Now
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
