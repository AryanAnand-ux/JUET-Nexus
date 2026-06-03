"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FigmaCard, FigmaButton } from "@/components/base";
import { useAttendanceDetails } from "@/hooks/useAttendanceDetails";

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

  useEffect(() => {
    const stored = localStorage.getItem("enrollment");
    if (!stored) router.push("/login");
    else setEnrollment(stored);
  }, [router]);

  const { data, isLoading, error, fetchDetails } = useAttendanceDetails(
    subjectName,
    detailLink
  );

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

  const handleLogout = () => {
    localStorage.removeItem("enrollment");
    localStorage.removeItem("dob");
    localStorage.removeItem("password");
    localStorage.removeItem("role");
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
    if (isMeetingTarget) {
      let bunks = 0;
      while (
        (simulatedAttended / (simulatedTotal + bunks)) * 100 >=
        targetPercentage
      ) {
        bunks++;
        if (bunks > 1000) break; // safety
      }
      actionText = bunks > 1
        ? `You can safely bunk ${bunks - 1} more class${bunks - 1 !== 1 ? "es" : ""}.`
        : "You cannot bunk any more classes.";
    } else {
      let attends = 0;
      while (
        ((simulatedAttended + attends) / (simulatedTotal + attends)) * 100 <
        targetPercentage
      ) {
        attends++;
        if (attends > 1000) break; // safety
      }
      actionText = `Attend ${attends} consecutive class${attends !== 1 ? "es" : ""} to reach ${targetPercentage}%.`;
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
            <h2 className="text-3xl font-bold text-figma-dark tracking-tight font-nunito">
              {subjectName}
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-1 font-nunito">
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
                <span className="text-sm font-black bg-figma-dark text-white px-2.5 py-0.5 rounded-full font-nunito">
                  {targetPercentage}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={targetPercentage}
                onChange={(e) => setTargetPercentage(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-figma-maroon"
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
        </div>

        {/* RIGHT: Daily Log */}
        <div className="xl:col-span-2 space-y-4">
          <h3 className="text-xl font-bold text-figma-dark mb-4 font-nunito">
            Day-by-Day Log
          </h3>

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
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 font-nunito">
                      Date
                    </th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 font-nunito">
                      Type
                    </th>
                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 font-nunito">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.logs].reverse().map((log, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0"
                    >
                      <td className="p-4 text-sm font-semibold text-figma-dark whitespace-nowrap font-nunito">
                        {log.date}
                      </td>
                      <td className="p-4 text-sm font-medium text-gray-500 font-nunito">
                        {log.type}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            log.status === "Present"
                              ? "bg-green-100 text-green-700 border border-green-200"
                              : "bg-red-100 text-red-700 border border-red-200"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
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
