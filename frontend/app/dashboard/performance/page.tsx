"use client";

/**
 * Performance Page
 * Displays the CGPA Viewer (PerformanceHub) with a premium visual design
 */

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PerformanceHub } from "@/components/PerformanceHub";
import { useDashboard } from "@/hooks/useDashboard";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

const ErrorBanner: React.FC<{ error: { message: string } }> = ({ error }) => (
  <div className="mb-6 border border-red-200 rounded-2xl bg-red-50 p-4 flex items-start gap-3 shadow-sm">
    <span className="text-red-500 mt-0.5">⚠</span>
    <p className="text-sm font-medium text-red-700 font-nunito">
      {error.message}
    </p>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="border border-gray-100 bg-gray-50 rounded-[24px] h-[350px] animate-pulse shadow-sm" />
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

  const handleLogout = () => {
    localStorage.removeItem("enrollment");
    localStorage.removeItem("dob");
    localStorage.removeItem("password");
    localStorage.removeItem("role");
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
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-nunito"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Attendance
            </Link>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight font-nunito">
            Academic Performance
          </h2>
          <p className="text-sm font-medium text-slate-400 font-nunito mt-1">
            Track your SGPA, CGPA, and recent course grades
          </p>
        </div>
        
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 transition-all shadow-sm active:scale-95 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
          <span>Sync Academic Standings</span>
        </button>
      </div>

      {error && <ErrorBanner error={error} />}

      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <PerformanceHub performance={data.performance} />
      ) : (
        <div className="border border-gray-200 rounded-[24px] bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-400 font-nunito mb-4">
            No performance data available. Let&apos;s sync your WebKiosk standings.
          </p>
          <button
            onClick={refresh}
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
