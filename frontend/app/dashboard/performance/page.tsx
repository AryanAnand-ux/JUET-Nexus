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
import { GpaPredictor } from "@/components/GpaPredictor";
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
    <div className="border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60 rounded-[24px] h-[350px] animate-pulse shadow-sm" />
  </div>
);

export default function PerformancePage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"standing" | "predictor">("standing");

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
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 font-nunito"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Attendance
            </Link>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight font-nunito">
            Academic Performance
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 font-nunito mt-1">
            Track your SGPA, CGPA, and recent course grades
          </p>
        </div>
        
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 transition-all shadow-sm active:scale-95 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
          <span>Sync Academic Standings</span>
        </button>
      </div>

      {/* Tabs Switcher */}
      {data && (
        <div className="mb-6 flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm p-1 rounded-xl w-fit border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
          <button
            onClick={() => setActiveTab("standing")}
            className={`px-4 py-2 rounded-lg text-sm font-bold font-nunito transition-all duration-200 ${
              activeTab === "standing"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/30 dark:border-slate-700/50"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Academic Standing
          </button>
          <button
            onClick={() => setActiveTab("predictor")}
            className={`px-4 py-2 rounded-lg text-sm font-bold font-nunito transition-all duration-200 ${
              activeTab === "predictor"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/30 dark:border-slate-700/50"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            GPA Predictor
          </button>
        </div>
      )}

      {error && <ErrorBanner error={error} />}

      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        activeTab === "standing" ? (
          <PerformanceHub performance={data.performance} detailedMarks={data.detailedMarks} />
        ) : (
          <GpaPredictor 
            key={data.courses ? data.courses.map(c => c.code).join(',') : 'empty'}
            courses={data.courses} 
            performance={data.performance} 
          />
        )
      ) : (
        <div className="border border-gray-200 dark:border-slate-800 rounded-[24px] bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-400 dark:text-slate-500 font-nunito mb-4">
            No performance data available. Let&apos;s sync your portal standings.
          </p>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-indigo-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> Sync Now
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
