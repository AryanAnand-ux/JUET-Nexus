"use client";

import React, { useState } from "react";
import type { GradeCardResponse, GradeSubject } from "@/types";
import {
  Award,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";

interface GradeCardProps {
  grades: GradeCardResponse[];
}

function getGradeBadgeStyle(grade: string): string {
  const g = grade.trim().toUpperCase();
  if (["O", "A+", "A"].includes(g)) {
    return "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
  }
  if (["B+", "B"].includes(g)) {
    return "bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800";
  }
  if (["C+", "C", "D", "P"].includes(g)) {
    return "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  }
  if (["F", "E", "AB", "FAIL"].includes(g)) {
    return "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";
  }
  return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700";
}

export const GradeCard: React.FC<GradeCardProps> = ({ grades }) => {
  const [selectedSemesterIndex, setSelectedSemesterIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  if (!grades || grades.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--line-subtle)] bg-[var(--surface-card)] p-12 text-center">
        <Award className="w-12 h-12 text-[var(--ink-muted)] mx-auto mb-3" />
        <h3 className="text-base font-bold text-[var(--ink-strong)]">
          No Grade Card Records Available
        </h3>
        <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-sm mx-auto">
          Grade card results have not yet been published by the examination branch.
        </p>
      </div>
    );
  }

  const currentSemester = grades[selectedSemesterIndex] || grades[0];
  const subjects = currentSemester.subjects || [];

  const filteredSubjects = subjects.filter(
    (s) =>
      s.subjectdesc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.subjectcode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0);

  const isSubjectFailed = (status?: string, grade?: string) => {
    const g = grade?.toUpperCase().trim() || "";
    const s = status?.toLowerCase().trim() || "";
    return ["F", "FAIL", "AB"].includes(g) || s === "fail";
  };

  const isSubjectPassed = (status?: string, grade?: string) => {
    if (isSubjectFailed(status, grade)) return false;
    const s = status?.toLowerCase().trim() || "";
    const g = grade?.toUpperCase().trim() || "";
    return s === "pass" || (g !== "" && !["F", "FAIL", "AB"].includes(g));
  };

  const passedSubjects = subjects.filter((s) => isSubjectPassed(s.status, s.grade)).length;

  return (
    <div className="space-y-6">
      {/* Semester Tab Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {grades.map((sem, idx) => (
          <button
            key={`${sem.semester}-${idx}`}
            onClick={() => {
              setSelectedSemesterIndex(idx);
              setSearchTerm("");
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all shrink-0 border ${
              selectedSemesterIndex === idx
                ? "bg-midnight dark:bg-brand-600 text-white border-midnight dark:border-brand-600 shadow-card"
                : "bg-[var(--surface-card)] text-[var(--ink-muted)] border-[var(--line-subtle)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-strong)]"
            }`}
          >
            {sem.semester.startsWith("Semester") ? sem.semester : `Semester ${sem.semester}`}
          </button>
        ))}
      </div>

      {/* Overview Stats Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-midnight via-carbon to-midnight text-white p-6 sm:p-8 shadow-banner border border-white/5 relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-44 h-44 rounded-full bg-brand-500/25 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-editorial-italic font-normal tracking-normal">
              {currentSemester.semester.startsWith("Semester")
                ? currentSemester.semester
                : `Semester ${currentSemester.semester}`}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
              <p className="text-xs text-slate-400">Semester SGPA</p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {currentSemester.sgpa ? currentSemester.sgpa.toFixed(2) : "N/A"}
              </p>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
              <p className="text-xs text-slate-400">Cumulative CGPA</p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {currentSemester.cgpa ? currentSemester.cgpa.toFixed(2) : "N/A"}
              </p>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
              <p className="text-xs text-slate-400">Total Credits</p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {totalCredits || "—"}
              </p>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
              <p className="text-xs text-slate-400">Subjects Cleared</p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {passedSubjects} / {subjects.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Input */}
      {subjects.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
            <input
              type="text"
              placeholder="Search course or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-strong)] text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/30 transition-all shadow-card placeholder:text-[var(--ink-muted)]"
            />
          </div>
          <span className="text-xs text-[var(--ink-muted)] self-center sm:self-auto">
            {filteredSubjects.length} courses recorded
          </span>
        </div>
      )}

      {/* Subjects View */}
      {subjects.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-8 text-center text-[var(--ink-muted)]">
          No grade card records have been published yet.
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-8 text-center text-[var(--ink-muted)]">
          No courses matching &ldquo;{searchTerm}&rdquo;
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] shadow-card">
          {/* Table for tablet / desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--line-subtle)] bg-[var(--surface-subtle)] text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.16em]">
                  <th className="py-3.5 px-5">Course</th>
                  <th className="py-3.5 px-5 text-center">Code</th>
                  <th className="py-3.5 px-5 text-center">Credits</th>
                  <th className="py-3.5 px-5 text-center">Grade</th>
                  <th className="py-3.5 px-5 text-center">Grade Point</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-subtle)] text-sm">
                {filteredSubjects.map((sub, idx) => (
                  <tr
                    key={`${sub.subjectcode}-${idx}`}
                    className="hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    <td className="py-4 px-5 font-semibold text-[var(--ink-strong)]">
                      {sub.subjectdesc || "Untitled Course"}
                    </td>
                    <td className="py-4 px-5 text-center font-mono text-xs text-gray-500 dark:text-slate-400 font-medium">
                      {sub.subjectcode || "—"}
                    </td>
                    <td className="py-4 px-5 text-center font-semibold text-gray-700 dark:text-slate-300">
                      {sub.credits || "—"}
                    </td>
                    <td className="py-4 px-5 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-black border ${getGradeBadgeStyle(
                          sub.grade
                        )}`}
                      >
                        {sub.grade || "—"}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-center font-semibold text-gray-700 dark:text-slate-300">
                      {sub.gradepoint > 0 ? sub.gradepoint : (isSubjectFailed(sub.status, sub.grade) ? "0" : "—")}
                    </td>
                    <td className="py-4 px-5 text-center">
                      {isSubjectPassed(sub.status, sub.grade) ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          Fail
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards for mobile */}
          <div className="sm:hidden divide-y divide-[var(--line-subtle)]">
            {filteredSubjects.map((sub, idx) => (
              <div key={`${sub.subjectcode}-${idx}`} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-[var(--ink-strong)] text-sm">
                      {sub.subjectdesc || "Untitled Course"}
                    </h4>
                    <p className="text-xs font-mono text-gray-400 dark:text-slate-500 mt-0.5">
                      {sub.subjectcode}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-black border shrink-0 ${getGradeBadgeStyle(
                      sub.grade
                    )}`}
                  >
                    {sub.grade || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 pt-1">
                  <span>Credits: <strong className="text-gray-900 dark:text-slate-200">{sub.credits}</strong></span>
                  <span>Point: <strong className="text-gray-900 dark:text-slate-200">{sub.gradepoint > 0 ? sub.gradepoint : (isSubjectFailed(sub.status, sub.grade) ? "0" : "—")}</strong></span>
                  <span className={`font-semibold ${isSubjectPassed(sub.status, sub.grade) ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {isSubjectPassed(sub.status, sub.grade) ? "Pass" : "Fail"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
