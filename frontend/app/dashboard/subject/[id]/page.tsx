"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FigmaCard } from "@/components/base";
import { useAttendanceDetails } from "@/hooks/useAttendanceDetails";
import { computeScenarioPercentage, calculateBunkStatus } from "@/utils/bunkHelpers";
import { performLogout } from "@/utils/logout";

function SubjectDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const subjectName = decodeURIComponent(rawId || "Subject Details");
  const detailLink = searchParams.get("link");

  // URL-passed percentages (available immediately)
  const urlPct = parseFloat(searchParams.get("pct") || "0");
  const urlLp = parseFloat(searchParams.get("lp") || "0");
  const urlTp = parseFloat(searchParams.get("tp") || "0");
  const urlPp = parseFloat(searchParams.get("pp") || "0");

  const [enrollment, setEnrollment] = useState<string | null>(null);

  // Interactive Calculator State
  const [targetPercentage, setTargetPercentage] = useState(75);
  const [simulatedAttended, setSimulatedAttended] = useState(0);
  const [simulatedTotal, setSimulatedTotal] = useState(0);
  const [hasDetailData, setHasDetailData] = useState(false);
  const [extraAttends, setExtraAttends] = useState(0);
  const [extraBunks, setExtraBunks] = useState(0);

  // Advanced Scenario Simulation State
  const [simulatedBunks, setSimulatedBunks] = useState(0);
  const [simulatedAttends, setSimulatedAttends] = useState(0);

  // Log filter state
  const [logFilter, setLogFilter] = useState<"all" | "present" | "absent">("all");

  const { data, isLoading, error, fetchDetails } = useAttendanceDetails(
    subjectName,
    detailLink
  );

  const actualAttended = data?.classesAttended ?? 0;
  const actualHeld = data?.classesHeld ?? 0;

  const scenarioPercent = computeScenarioPercentage(
    actualAttended,
    actualHeld,
    simulatedBunks,
    simulatedAttends
  );

  const getScenarioStatusTheme = (pct: number, target: number) => {
    if (pct >= target) {
      return {
        colorClass: "bg-green-500/10 border-green-500/20 text-green-700",
        message: `On Track: You will meet your ${target}% target.`,
      };
    }
    if (pct >= target - 5) {
      return {
        colorClass: "bg-amber-500/10 border-amber-500/20 text-amber-700",
        message: `Warning: Close to boundary. Drop risk.`,
      };
    }
    return {
      colorClass: "bg-rose-500/10 border-rose-500/20 text-rose-700",
      message: `Defaulter Risk: Attendance will fall below target.`,
    };
  };

  const scenarioStatus = getScenarioStatusTheme(scenarioPercent, targetPercentage);

  useEffect(() => {
    const stored = localStorage.getItem("enrollment");
    if (!stored) router.push("/login");
    else setEnrollment(stored);
  }, [router]);

  useEffect(() => {
    if (enrollment && detailLink) fetchDetails();
  }, [enrollment, detailLink, fetchDetails]);

  // Sync simulator state when detail data loads
  useEffect(() => {
    if (data && data.classesHeld > 0) {
      setSimulatedAttended(data.classesAttended);
      setSimulatedTotal(data.classesHeld);
      setHasDetailData(true);
    }
  }, [data]);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) return null;

  const handleAttend = () => {
    setSimulatedAttended((prev) => prev + 1);
    setSimulatedTotal((prev) => prev + 1);
    setExtraAttends((prev) => prev + 1);
  };

  const handleBunk = () => {
    setSimulatedTotal((prev) => prev + 1);
    setExtraBunks((prev) => prev + 1);
  };

  const resetSimulation = () => {
    if (data && data.classesHeld > 0) {
      setSimulatedAttended(data.classesAttended);
      setSimulatedTotal(data.classesHeld);
      setExtraAttends(0);
      setExtraBunks(0);
    }
  };

  const displayPercent = simulatedTotal > 0
    ? (simulatedAttended / simulatedTotal) * 100
    : urlPct;

  const isMeetingTarget = displayPercent >= targetPercentage;

  const getRingColor = (percent: number) => {
    if (percent >= 91) return "text-green-500";
    if (percent >= 81) return "text-blue-500";
    if (percent >= 71) return "text-orange-500";
    return "text-red-800";
  };

  const getStatusBadgeColor = (percent: number) => {
    if (percent >= 91) return "bg-green-100 text-green-700 border-green-200";
    if (percent >= 81) return "bg-blue-100 text-blue-700 border-blue-200";
    if (percent >= 71) return "bg-orange-100 text-orange-700 border-orange-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, displayPercent) / 100) * circumference;

  // Compute action text only when we have raw counts
  let actionText = "";
  if (simulatedTotal > 0) {
    const bunkStatus = calculateBunkStatus(simulatedAttended, simulatedTotal, targetPercentage);
    if (bunkStatus.status === "critical") {
      if (bunkStatus.count === Infinity) {
        actionText = "It is impossible to reach 100% attendance.";
      } else {
        actionText = `Attend ${bunkStatus.count} consecutive class${bunkStatus.count !== 1 ? "es" : ""} to reach ${targetPercentage}%.`;
      }
    } else {
      actionText = bunkStatus.count > 0
        ? `You can safely bunk ${bunkStatus.count} more class${bunkStatus.count !== 1 ? "es" : ""}.`
        : "You cannot bunk any more classes.";
    }
  }

  return (
    <DashboardLayout
      studentName="Student"
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      {/* Header */}
      <div className="mb-6 font-nunito">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm font-bold uppercase tracking-wider text-gray-400 hover:text-figma-maroon transition-colors mb-3 inline-flex items-center gap-1.5"
        >
          ← Back to Dashboard
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-3xl font-bold text-figma-dark dark:text-slate-100 tracking-tight font-nunito break-words">
              {subjectName}
            </h2>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mt-1 font-nunito">
              Attendance Details & Simulation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${getStatusBadgeColor(urlPct)}`}>
              {urlPct.toFixed(0)}% Overall
            </span>
            {urlLp > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-gray-200 bg-white text-gray-500 font-nunito">
                L: {urlLp}%
              </span>
            )}
            {urlTp > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-gray-200 bg-white text-gray-500 font-nunito">
                T: {urlTp}%
              </span>
            )}
            {urlPp > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-gray-200 bg-white text-gray-500 font-nunito">
                P: {urlPp}%
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-red-200 rounded-2xl bg-red-50 p-4 flex items-start gap-3">
          <span className="text-red-500 mt-0.5">⚠</span>
          <p className="text-sm font-medium text-red-700 font-nunito">
            {error.message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* LEFT: Calculator */}
        <div className="xl:col-span-1 space-y-6">
          <FigmaCard heading="Attendance Calculator">
            {/* Ring */}
            <div className="flex justify-center my-6">
              <div className="relative w-40 h-40 flex items-center justify-center shrink-0 bg-white/60 border border-gray-100 rounded-full shadow-sm">
                <svg className="transform -rotate-90 w-40 h-40">
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    className="text-gray-100"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`transition-all duration-700 ${getRingColor(displayPercent)}`}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-black tracking-tighter text-figma-dark leading-none font-nunito">
                    {displayPercent.toFixed(0)}
                  </span>
                  <span className="text-xs font-bold text-gray-400 font-nunito">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            {simulatedTotal > 0 && (
              <div className="flex justify-around text-center mb-6 border-y border-gray-100 py-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-xs uppercase font-bold text-gray-400 font-nunito">
                    Attended
                  </p>
                  <p className="text-2xl font-black text-figma-dark font-nunito">
                    {simulatedAttended}
                  </p>
                </div>
                <div className="w-px bg-gray-200" />
                <div>
                  <p className="text-xs uppercase font-bold text-gray-400 font-nunito">
                    Total
                  </p>
                  <p className="text-2xl font-black text-figma-dark font-nunito">{simulatedTotal}</p>
                </div>
              </div>
            )}

            {!hasDetailData && isLoading && (
              <div className="mb-6 py-3 text-center">
                <p className="text-xs font-medium text-gray-400 animate-pulse font-nunito">
                  Loading class counts from WebKiosk…
                </p>
              </div>
            )}

            {!hasDetailData && !isLoading && !detailLink && (
              <div className="mb-6 py-3 text-center">
                <p className="text-xs font-medium text-gray-400 font-nunito">
                  Daily log unavailable — showing overall percentage only.
                </p>
              </div>
            )}

            {/* Target Slider */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs uppercase font-bold tracking-wider text-gray-500 font-nunito">
                  Target Criteria
                </label>
                <span className="text-sm font-black bg-accent-primary text-white px-2.5 py-0.5 rounded-full font-nunito">
                  {targetPercentage}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={targetPercentage}
                onChange={(e) => setTargetPercentage(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />
            </div>

            {/* Action Text */}
            {simulatedTotal > 0 && (
              <div
                className={`p-4 rounded-xl border mb-6 ${
                  isMeetingTarget
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                <p className="text-sm font-bold text-center font-nunito">
                  {actionText || "Simulate classes below."}
                </p>
              </div>
            )}

            {/* Buttons */}
            {simulatedTotal > 0 && (
              <>
                <div className="flex gap-3">
                  <button
                    onClick={handleAttend}
                    className="flex-1 flex flex-col items-center gap-1 py-3 px-4 rounded-xl bg-green-500 hover:bg-green-600 text-white border-2 border-green-600 font-bold transition-all hover:-translate-y-1 shadow-sm font-nunito"
                  >
                    <span className="text-sm font-black">+ Attend</span>
                    {extraAttends > 0 && (
                      <span className="text-[10px] font-bold opacity-80">+{extraAttends} added</span>
                    )}
                  </button>
                  <button
                    onClick={handleBunk}
                    className="flex-1 flex flex-col items-center gap-1 py-3 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white border-2 border-red-600 font-bold transition-all hover:-translate-y-1 shadow-sm font-nunito"
                  >
                    <span className="text-sm font-black">− Bunk</span>
                    {extraBunks > 0 && (
                      <span className="text-[10px] font-bold opacity-80">+{extraBunks} skipped</span>
                    )}
                  </button>
                </div>

                {data &&
                  (simulatedAttended !== data.classesAttended ||
                    simulatedTotal !== data.classesHeld) && (
                    <button
                      onClick={resetSimulation}
                      className="w-full mt-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-figma-dark transition-colors font-nunito"
                    >
                      ↻ Reset to Actual
                    </button>
                  )}
              </>
            )}
          </FigmaCard>

          {/* Advanced Bunk Planner (Scenario Simulation) */}
          <FigmaCard heading="Advanced Bunk Planner">
            {actualHeld === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs font-semibold text-gray-400 font-nunito leading-normal">
                  Detailed class counts are unavailable for this subject. Sync details or view overall stats above.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Bunk Input */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs uppercase font-bold tracking-wider text-gray-500 font-nunito">
                      Miss classes (Bunk N)
                    </label>
                    <span className="text-xs font-bold text-gray-400 font-mono">
                      {simulatedBunks} classes
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={simulatedBunks}
                      onChange={(e) => setSimulatedBunks(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={simulatedBunks}
                      onChange={(e) => setSimulatedBunks(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-center font-extrabold text-slate-800 text-sm shadow-inner font-mono focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* Attend Input */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs uppercase font-bold tracking-wider text-gray-500 font-nunito">
                      Attend classes (Attend M)
                    </label>
                    <span className="text-xs font-bold text-gray-400 font-mono">
                      {simulatedAttends} classes
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={simulatedAttends}
                      onChange={(e) => setSimulatedAttends(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={simulatedAttends}
                      onChange={(e) => setSimulatedAttends(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-center font-extrabold text-slate-800 text-sm shadow-inner font-mono focus:outline-none focus:border-green-500"
                    />
                  </div>
                </div>

                {/* Scenario Results Box */}
                <div className={`p-5 rounded-[20px] border transition-all duration-300 ${scenarioStatus.colorClass}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                    Simulation Outcome
                  </p>
                  <div className="flex items-baseline gap-1.5 mb-2">
                    <span className="text-4xl font-black tracking-tighter font-mono leading-none">
                      {scenarioPercent.toFixed(1)}
                    </span>
                    <span className="text-sm font-bold opacity-80">%</span>
                  </div>
                  <p className="text-sm font-bold leading-snug">
                    {scenarioStatus.message}
                  </p>
                </div>

                {(simulatedBunks > 0 || simulatedAttends > 0) && (
                  <button
                    onClick={() => {
                      setSimulatedBunks(0);
                      setSimulatedAttends(0);
                    }}
                    className="w-full py-2 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-figma-dark transition-colors font-nunito"
                  >
                    Clear Scenario
                  </button>
                )}
              </div>
            )}
          </FigmaCard>
        </div>

        {/* RIGHT: Daily Log */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <h3 className="text-xl font-bold text-figma-dark font-nunito">
              Day-by-Day Log
            </h3>
            
            {data && data.logs.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setLogFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-nunito transition-all ${
                    logFilter === "all"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All ({data.logs.length})
                </button>
                <button
                  onClick={() => setLogFilter("present")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-nunito transition-all ${
                    logFilter === "present"
                      ? "bg-white text-green-600 shadow-sm"
                      : "text-slate-500 hover:text-green-600"
                  }`}
                >
                  Present ({data.logs.filter((l) => l.status === "Present").length})
                </button>
                <button
                  onClick={() => setLogFilter("absent")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-nunito transition-all ${
                    logFilter === "absent"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-slate-500 hover:text-red-600"
                  }`}
                >
                  Absent ({data.logs.filter((l) => l.status === "Absent").length})
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="border border-gray-100 bg-gray-50 rounded-2xl h-14 animate-pulse"
                />
              ))}
            </div>
          ) : data && data.logs.length > 0 ? (
            <div className="bg-white dark:bg-slate-950/20 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-x-auto shadow-sm">
              <table className="w-full text-left border-collapse min-w-[500px] sm:min-w-0">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 font-nunito">
                      Date
                    </th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 font-nunito">
                      Type
                    </th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 font-nunito">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filteredLogs = data.logs.filter((log) => {
                      if (logFilter === "all") return true;
                      if (logFilter === "present") return log.status === "Present";
                      if (logFilter === "absent") return log.status === "Absent";
                      return true;
                    });
                    
                    if (filteredLogs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-sm font-medium text-slate-400 font-nunito">
                            No logs match the selected filter.
                          </td>
                        </tr>
                      );
                    }
                    
                    return [...filteredLogs].reverse().map((log, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-100 dark:border-slate-900/60 hover:bg-gray-50 dark:hover:bg-slate-900/30 transition-colors last:border-0 dark:border-slate-800/50"
                      >
                        <td className="p-4 text-sm font-semibold text-figma-dark dark:text-slate-200 whitespace-nowrap font-nunito">
                          {log.date}
                        </td>
                        <td className="p-4 text-sm font-medium text-gray-500 dark:text-slate-400 font-nunito">
                          {log.type}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border backdrop-blur-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] ${
                              log.status === "Present"
                                ? "bg-green-500/10 text-green-700 border-green-500/20"
                                : "bg-red-500/10 text-red-700 border-red-500/20"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              log.status === "Present" ? "bg-green-500 animate-pulse" : "bg-red-500"
                            }`} />
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-medium text-slate-500 font-nunito">
                {detailLink
                  ? "No daily records were found on WebKiosk for this subject."
                  : "Daily attendance log is not available for this subject."}
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function SubjectDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50 font-nunito">
          <p className="text-sm font-medium text-gray-400 animate-pulse">
            Loading…
          </p>
        </div>
      }
    >
      <SubjectDetailContent />
    </Suspense>
  );
}
