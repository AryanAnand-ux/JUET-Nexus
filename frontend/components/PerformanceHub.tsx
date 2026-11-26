/**
 * Performance Hub Component
 * Modern dashboard display for Marks & Evaluations
 */

"use client";

import React, { useState, useMemo } from "react";
import { FigmaCard } from "./base";
import type { PerformanceData, DetailedCourseMarks } from "@/types";
import { ClipboardList } from "lucide-react";

export type AssessmentType = "ALL" | "T1" | "P1" | "T2" | "P2" | "T3";

export const ASSESSMENT_OPTIONS: { id: AssessmentType; label: string; fullLabel: string }[] = [
  { id: "ALL", label: "All", fullLabel: "All Evaluations" },
  { id: "T1", label: "T1", fullLabel: "Test 1 (T1)" },
  { id: "P1", label: "P1", fullLabel: "Practical 1 (P1)" },
  { id: "T2", label: "T2", fullLabel: "Test 2 (T2)" },
  { id: "P2", label: "P2", fullLabel: "Practical 2 (P2)" },
  { id: "T3", label: "T3", fullLabel: "Test 3 (T3)" },
];

const RE_T1 = [
  /\bT[-_\s]?1(?![0-9])/i,
  /\bTEST[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\bEXAM[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\bTHEORY[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\bSESSIONAL[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\bINTERNAL[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\b(?:1ST|FIRST)\s*(?:TEST|EXAM|EVALUATION|ASSESSMENT)\b/i,
  /\bMINOR[-_\s]?1\b/i,
  /\bMID[-_\s]?TERM[-_\s]?1\b/i,
  /\bPERIODIC[-_\s]?TEST[-_\s]?1\b/i,
  /\bPT[-_\s]?1(?![0-9])/i,
];

const RE_P1 = [
  /\bP[-_\s]?1(?![0-9])/i,
  /\bPRACTICAL[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\bPR[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
  /\bLAB[-_\s]?(?:1|I)(?![0-9a-zA-Z])/i,
];

const RE_T2 = [
  /\bT[-_\s]?2(?![0-9])/i,
  /\bTEST[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\bEXAM[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\bTHEORY[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\bSESSIONAL[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\bINTERNAL[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\b(?:2ND|SECOND)\s*(?:TEST|EXAM|EVALUATION|ASSESSMENT)\b/i,
  /\bMINOR[-_\s]?2\b/i,
  /\bMID[-_\s]?TERM[-_\s]?2\b/i,
  /\bPERIODIC[-_\s]?TEST[-_\s]?2\b/i,
  /\bPT[-_\s]?2(?![0-9])/i,
];

const RE_P2 = [
  /\bP[-_\s]?2(?![0-9])/i,
  /\bPRACTICAL[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\bPR[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
  /\bLAB[-_\s]?(?:2|II)(?![0-9a-zA-Z])/i,
];

const RE_T3 = [
  /\bT[-_\s]?3(?![0-9])/i,
  /\bTEST[-_\s]?(?:3|III)(?![0-9a-zA-Z])/i,
  /\bEXAM[-_\s]?(?:3|III)(?![0-9a-zA-Z])/i,
  /\bTHEORY[-_\s]?(?:3|III)(?![0-9a-zA-Z])/i,
  /\b(?:3RD|THIRD)\s*(?:TEST|EXAM|EVALUATION|ASSESSMENT)\b/i,
  /\bEND[-_\s]?TERM\b/i,
  /\bEND[-_\s]?SEM(?:ESTER)?\b/i,
  /\bMAJOR\b/i,
];

/**
 * Normalizes and maps ERP assessment event codes (e.g. "TEST-1", "T-1", "PRACTICAL-1", "P1")
 * to standard assessment filter categories.
 */
export function matchesAssessment(componentName: string, assessment: AssessmentType): boolean {
  if (assessment === "ALL") return true;
  if (!componentName) return false;

  const raw = componentName.trim();
  const normalized = raw.toUpperCase().replace(/[\s_-]+/g, "");

  switch (assessment) {
    case "T1":
      return (
        normalized === "TEST1" ||
        normalized === "T1" ||
        normalized === "TESTI" ||
        normalized === "TI" ||
        normalized === "1" ||
        normalized === "01" ||
        normalized === "TEST" ||
        normalized === "MARKS" ||
        normalized === "EXAM1" ||
        normalized === "EXAMI" ||
        normalized === "THEORY1" ||
        normalized === "THEORYI" ||
        normalized.startsWith("TEST1") ||
        normalized.startsWith("T1") ||
        normalized.includes("TEST1") ||
        normalized.includes("TEST-1") ||
        RE_T1.some((re) => re.test(raw))
      );
    case "P1":
      return (
        normalized === "PRACTICAL1" ||
        normalized === "P1" ||
        normalized === "PR1" ||
        normalized === "LAB1" ||
        normalized === "PRACTICALI" ||
        normalized.startsWith("PRACTICAL1") ||
        normalized.startsWith("P1") ||
        normalized.startsWith("LAB1") ||
        normalized.includes("PRACTICAL1") ||
        normalized.includes("LAB1") ||
        RE_P1.some((re) => re.test(raw))
      );
    case "T2":
      return (
        normalized === "TEST2" ||
        normalized === "T2" ||
        normalized === "TESTII" ||
        normalized === "TII" ||
        normalized === "2" ||
        normalized === "02" ||
        normalized === "EXAM2" ||
        normalized === "EXAMII" ||
        normalized === "THEORY2" ||
        normalized === "THEORYII" ||
        normalized.startsWith("TEST2") ||
        normalized.startsWith("T2") ||
        normalized.includes("TEST2") ||
        normalized.includes("TEST-2") ||
        RE_T2.some((re) => re.test(raw))
      );
    case "P2":
      return (
        normalized === "PRACTICAL2" ||
        normalized === "P2" ||
        normalized === "PR2" ||
        normalized === "LAB2" ||
        normalized === "PRACTICALII" ||
        normalized.startsWith("PRACTICAL2") ||
        normalized.startsWith("P2") ||
        normalized.startsWith("LAB2") ||
        normalized.includes("PRACTICAL2") ||
        normalized.includes("LAB2") ||
        RE_P2.some((re) => re.test(raw))
      );
    case "T3":
      return (
        normalized === "TEST3" ||
        normalized === "T3" ||
        normalized === "TESTIII" ||
        normalized === "TIII" ||
        normalized === "3" ||
        normalized === "03" ||
        normalized === "EXAM3" ||
        normalized === "EXAMIII" ||
        normalized === "THEORY3" ||
        normalized === "THEORYIII" ||
        normalized.startsWith("TEST3") ||
        normalized.startsWith("T3") ||
        normalized.includes("TEST3") ||
        normalized.includes("TEST-3") ||
        RE_T3.some((re) => re.test(raw))
      );
    default:
      return false;
  }
}

export interface PerformanceHubProps {
  performance: PerformanceData;
  detailedMarks?: DetailedCourseMarks[];
}

const PerformanceHubComponent: React.FC<PerformanceHubProps> = ({
  performance,
  detailedMarks = [],
}) => {
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentType>("ALL");

  const courseIndex = useMemo(() => {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const byLower = new Map<string, DetailedCourseMarks>();
    const byClean = new Map<string, DetailedCourseMarks>();
    for (const m of detailedMarks || []) {
      byLower.set(m.subject.trim().toLowerCase(), m);
      byClean.set(clean(m.subject), m);
    }
    return { byLower, byClean, clean };
  }, [detailedMarks]);

  const assessmentItems = useMemo(() => {
    const findCourse = (subject: string) =>
      courseIndex.byLower.get(subject.trim().toLowerCase()) ||
      courseIndex.byClean.get(courseIndex.clean(subject));

    if (selectedAssessment === "ALL") {
      if (performance.recentMarks && performance.recentMarks.length > 0) {
        return performance.recentMarks.map((mark) => {
          const matchingCourse = findCourse(mark.subject);
          const maxForMark = mark.max || matchingCourse?.components?.reduce((sum, c) => sum + (c.max || 0), 0);
          return {
            subject: mark.subject,
            code: mark.code || matchingCourse?.code,
            obtained: mark.marks,
            max: maxForMark,
            assessmentName: mark.event || undefined,
          };
        });
      }
      return (detailedMarks || []).map((m) => ({
        subject: m.subject,
        code: m.code,
        obtained: m.total,
        max: m.components?.reduce((sum, c) => sum + (c.max || 0), 0),
        assessmentName: undefined,
      }));
    }

    // Specific evaluation: T1, P1, T2, P2, T3
    const matched: Array<{
      subject: string;
      code?: string;
      obtained: number;
      max?: number;
      assessmentName?: string;
    }> = [];

    if (detailedMarks && detailedMarks.length > 0) {
      for (const course of detailedMarks) {
        if (!course.components || course.components.length === 0) continue;
        let comp = course.components.find((c) => matchesAssessment(c.name, selectedAssessment));

        // Smart fallback for T1: If no explicit component matched T1, but the course has a component
        // that is not explicitly T2/T3/P1/P2 (e.g. "Marks", "Test", or 1st component), it is T1!
        if (!comp && selectedAssessment === "T1") {
          comp = course.components.find(
            (c) =>
              !matchesAssessment(c.name, "T2") &&
              !matchesAssessment(c.name, "T3") &&
              !matchesAssessment(c.name, "P1") &&
              !matchesAssessment(c.name, "P2")
          );
        }

        if (comp) {
          matched.push({
            subject: course.subject,
            code: course.code,
            obtained: comp.obtained,
            max: comp.max,
            assessmentName: comp.name,
          });
        }
      }
    }

    // Fallback: If no components matched via detailedMarks (e.g. detailedMarks is empty/stale in client localStorage),
    // check performance.recentMarks
    if (matched.length === 0 && performance.recentMarks && performance.recentMarks.length > 0) {
      for (const mark of performance.recentMarks) {
        let isMatch = false;
        if (mark.event) {
          isMatch = matchesAssessment(mark.event, selectedAssessment);
        }

        // For T1: if mark.event didn't explicitly match (or is missing/generic),
        // but it also doesn't match T2/T3/P1/P2: it IS a T1 mark in JUET!
        if (!isMatch && selectedAssessment === "T1") {
          const isOther = mark.event && (
            matchesAssessment(mark.event, "T2") ||
            matchesAssessment(mark.event, "T3") ||
            matchesAssessment(mark.event, "P1") ||
            matchesAssessment(mark.event, "P2")
          );
          if (!isOther) {
            isMatch = true;
          }
        }

        if (isMatch) {
          const matchingCourse = findCourse(mark.subject);
          matched.push({
            subject: mark.subject,
            code: mark.code || matchingCourse?.code,
            obtained: mark.marks,
            max: mark.max || matchingCourse?.components?.[0]?.max,
            assessmentName: mark.event || "T1",
          });
        }
      }
    }

    return matched;
  }, [selectedAssessment, performance.recentMarks, detailedMarks, courseIndex]);

  const hasAnyMarks = (performance.recentMarks && performance.recentMarks.length > 0) || detailedMarks.length > 0;

  return (
    <FigmaCard
      className="border border-[var(--line-subtle)] shadow-card rounded-[24px] p-6 md:p-8"
    >
      {/* Assessment Filter Segmented Control */}
      <div className="flex items-center gap-1 bg-[var(--surface-subtle)] border border-[var(--line-subtle)] rounded-[12px] p-1 overflow-x-auto mb-6 w-fit max-w-full">
        {ASSESSMENT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelectedAssessment(option.id)}
            title={option.fullLabel}
            className={`px-3 py-1.5 rounded-[9px] text-[11px] font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
              selectedAssessment === option.id
                ? "bg-[var(--surface-card)] text-[var(--accent-text)] shadow-sm border border-[var(--line-subtle)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink-body)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!hasAnyMarks ? (
        <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-card)] border border-[var(--line-subtle)] flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--ink-strong)]">
            No marks published yet
          </p>
          <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xs mx-auto">
            The university portal has not released evaluation marks for the current semester.
          </p>
        </div>
      ) : assessmentItems.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-card)] border border-[var(--line-subtle)] flex items-center justify-center mx-auto mb-3">
            <ClipboardList className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--ink-strong)]">
            No marks published for {ASSESSMENT_OPTIONS.find((o) => o.id === selectedAssessment)?.fullLabel ?? selectedAssessment}
          </p>
          <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xs mx-auto">
            The university portal has not released results for this evaluation yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {assessmentItems.map((item, idx) => (
            <div
              key={`${item.subject}-${idx}`}
              className="border border-[var(--line-subtle)] bg-[var(--surface-subtle)] rounded-2xl p-4 flex justify-between items-center shadow-sm gap-3"
            >
              <div className="flex flex-col gap-0.5 min-w-0 pr-2 flex-1">
                <span className="font-extrabold text-sm text-[var(--ink-strong)] font-nunito break-words leading-snug">
                  {item.subject}
                </span>
                {item.code && (
                  <span className="text-[10px] font-mono font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                    {item.code}
                  </span>
                )}
                {item.assessmentName && (
                  <span className="text-[10px] font-semibold text-[var(--ink-muted)] uppercase tracking-wide break-words">
                    {item.assessmentName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="border border-[var(--line-subtle)] bg-[var(--surface-card)] rounded-xl px-3 py-1.5 shadow-sm text-center">
                  <span className="font-extrabold text-sm text-[var(--ink-strong)] font-nunito">
                    {item.obtained.toFixed(1)}
                  </span>
                  {item.max && item.max > 0 ? (
                    <span className="text-[11px] font-bold text-[var(--ink-muted)] font-nunito ml-1">
                      / {item.max}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </FigmaCard>
  );
};

export const PerformanceHub = React.memo(PerformanceHubComponent);
PerformanceHub.displayName = "PerformanceHub";
