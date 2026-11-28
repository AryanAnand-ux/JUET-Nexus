/**
 * Performance Hub Component
 * Marks & Evaluations with canvas-level score cards, live filters, a compact
 * summary, and exam / subject grouping views.
 */

"use client";

import React, { useState, useMemo } from "react";
import type { PerformanceData, DetailedCourseMarks } from "@/types";
import {
  formatMarkValue,
  summarizeMarks,
  type MarkItem,
} from "@/lib/marksHelpers";
import { ClipboardList } from "lucide-react";
import { FilterPills } from "./FilterPills";

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

type ViewMode = "exam" | "subject";

function examLabelFor(item: MarkItem, assessment: AssessmentType): string {
  const name = item.assessmentName?.trim();
  if (name) return name.toUpperCase();
  if (assessment !== "ALL") {
    return (
      ASSESSMENT_OPTIONS.find((option) => option.id === assessment)?.fullLabel ?? assessment
    ).toUpperCase();
  }
  return "MARKS";
}

function cardMetaFor(item: MarkItem, assessment: AssessmentType): string {
  const tag = examLabelFor(item, assessment);
  const code = item.code?.trim().toUpperCase();
  return code ? `${code} · ${tag}` : tag;
}

interface ScoreCardProps {
  title: string;
  meta: string;
  obtained?: number | null;
  max?: number | null;
  children?: React.ReactNode;
}

/** A single canvas-level score card. */
const ScoreCard: React.FC<ScoreCardProps> = ({ title, meta, obtained, max, children }) => {
  return (
    <section className="mb-3 rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] shadow-none transition-colors hover:border-[var(--ink-muted)]">
      <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h4
            className="truncate text-sm font-extrabold uppercase tracking-[0.08em] text-[var(--ink-strong)]"
            title={title}
          >
            {title}
          </h4>
          <p
            className="mt-1 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] tabular-nums"
            title={meta}
          >
            {meta}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-extrabold text-[var(--ink-strong)] tabular-nums">
          <strong>{formatMarkValue(obtained)}</strong>
          <span className="ml-1 font-semibold text-[var(--ink-muted)]">
            / {formatMarkValue(max)}
          </span>
        </span>
      </div>

      {children}
    </section>
  );
};

const PerformanceHubComponent: React.FC<PerformanceHubProps> = ({
  performance,
  detailedMarks = [],
}) => {
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentType>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("exam");

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

  const assessmentItems = useMemo<MarkItem[]>(() => {
    const findCourse = (subject: string) =>
      courseIndex.byLower.get(subject.trim().toLowerCase()) ||
      courseIndex.byClean.get(courseIndex.clean(subject));

    if (selectedAssessment === "ALL") {
      // Prefer individual exam components when available: they power both views
      // and prevent the same mark being counted twice.
      const componentRows: MarkItem[] = [];
      for (const course of detailedMarks || []) {
        for (const component of course.components || []) {
          componentRows.push({
            subject: course.subject,
            code: course.code,
            obtained: component.obtained,
            max: component.max,
            assessmentName: component.name,
          });
        }
      }
      if (componentRows.length > 0) return componentRows;

      if (performance.recentMarks && performance.recentMarks.length > 0) {
        return performance.recentMarks.map((mark) => {
          const matchingCourse = findCourse(mark.subject);
          const maxForMark =
            mark.max || matchingCourse?.components?.reduce((sum, c) => sum + (c.max || 0), 0);
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
      }));
    }

    // Specific evaluation: T1, P1, T2, P2, T3
    const matched: MarkItem[] = [];

    for (const course of detailedMarks || []) {
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

    // Fallback: if detailedMarks is empty/stale in the client cache, use recentMarks.
    if (matched.length === 0 && performance.recentMarks && performance.recentMarks.length > 0) {
      for (const mark of performance.recentMarks) {
        let isMatch = false;
        if (mark.event) {
          isMatch = matchesAssessment(mark.event, selectedAssessment);
        }

        // For T1: a generic/missing event that doesn't match another evaluation
        // is treated as T1, matching the portal's single-test semesters.
        if (!isMatch && selectedAssessment === "T1") {
          const isOther =
            mark.event &&
            (matchesAssessment(mark.event, "T2") ||
              matchesAssessment(mark.event, "T3") ||
              matchesAssessment(mark.event, "P1") ||
              matchesAssessment(mark.event, "P2"));
          if (!isOther) isMatch = true;
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

  const summary = useMemo(() => summarizeMarks(assessmentItems), [assessmentItems]);

  const subjectGroups = useMemo(() => {
    const groups = new Map<string, { subject: string; code?: string; items: MarkItem[] }>();
    for (const item of assessmentItems) {
      const key = (item.code || item.subject).trim().toLowerCase() || item.subject;
      let group = groups.get(key);
      if (!group) {
        group = { subject: item.subject, code: item.code, items: [] };
        groups.set(key, group);
      }
      group.items.push(item);
    }
    return Array.from(groups.values());
  }, [assessmentItems]);

  const hasAnyMarks =
    (performance.recentMarks && performance.recentMarks.length > 0) || detailedMarks.length > 0;
  const filterLabel =
    ASSESSMENT_OPTIONS.find((option) => option.id === selectedAssessment)?.fullLabel ??
    selectedAssessment;

  return (
    <>
      {/* Two-column live summary */}
      <section className="mb-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)]">
        <div className="border-r border-[var(--line-subtle)] px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Total Scored
          </p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--ink-strong)] sm:text-xl">
            {formatMarkValue(summary.scored)}
            <span className="ml-1.5 text-sm font-semibold text-[var(--ink-muted)] sm:text-base">
              / {formatMarkValue(summary.maximum)}
            </span>
          </p>
        </div>
        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Overall Percentage
          </p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--ink-strong)] sm:text-xl">
            {summary.percentage === null ? "—" : `${formatMarkValue(summary.percentage)}%`}
          </p>
        </div>
      </section>

      {/* View toggle — active option is high-contrast inverted */}
      <div className="mb-3">
        <div
          role="group"
          aria-label="Marks view"
          className="inline-flex rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] p-1"
        >
          {(["exam", "subject"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                viewMode === mode
                  ? "border-[var(--ink-strong)] bg-[var(--ink-strong)] text-[var(--surface-page)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-strong)]"
              }`}
            >
              {mode === "exam" ? "By Exam" : "By Subject"}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal filter pills — shared universal design with Exam */}
      <FilterPills
        options={ASSESSMENT_OPTIONS.map((option) => ({
          id: option.id,
          label: option.label,
          title: option.fullLabel,
        }))}
        selectedId={selectedAssessment}
        onSelect={setSelectedAssessment}
        className="mb-4"
      />

      {!hasAnyMarks ? (
        <section className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line-subtle)] bg-[var(--surface-subtle)]">
            <ClipboardList className="h-5 w-5 text-[var(--ink-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--ink-strong)]">No marks published yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-[var(--ink-muted)]">
            The university portal has not released evaluation marks for the current semester.
          </p>
        </section>
      ) : assessmentItems.length === 0 ? (
        <section className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-card)] p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line-subtle)] bg-[var(--surface-subtle)]">
            <ClipboardList className="h-5 w-5 text-[var(--ink-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--ink-strong)]">
            No marks published for {filterLabel}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-[var(--ink-muted)]">
            The university portal has not released results for this evaluation yet.
          </p>
        </section>
      ) : viewMode === "exam" ? (
        assessmentItems.map((item, index) => (
          <ScoreCard
            key={`${item.code || item.subject}-${item.assessmentName || index}`}
            title={item.subject}
            meta={cardMetaFor(item, selectedAssessment)}
            obtained={item.obtained}
            max={item.max}
          />
        ))
      ) : (
        subjectGroups.map((group) => {
          const groupSummary = summarizeMarks(group.items);
          const percentageLabel =
            groupSummary.percentage === null
              ? "OVERALL —"
              : `${formatMarkValue(groupSummary.percentage)}% OVERALL`;
          const code = group.code?.trim().toUpperCase();

          return (
            <ScoreCard
              key={`${group.subject}-${group.code || ""}`}
              title={group.subject}
              meta={code ? `${code} · ${percentageLabel}` : percentageLabel}
              obtained={groupSummary.scored}
              max={groupSummary.maximum}
            >
              <div className="divide-y divide-[var(--line-subtle)] border-t border-[var(--line-subtle)]">
                {group.items.map((item, index) => (
                  <div
                    key={`${item.assessmentName || "mark"}-${index}`}
                    className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5"
                  >
                    <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] tabular-nums">
                      {examLabelFor(item, selectedAssessment)}
                    </span>
                    <span className="shrink-0 text-xs font-extrabold text-[var(--ink-strong)] tabular-nums">
                      {formatMarkValue(item.obtained)}
                      <span className="ml-1 font-semibold text-[var(--ink-muted)]">
                        / {formatMarkValue(item.max)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </ScoreCard>
          );
        })
      )}
    </>
  );
};

export const PerformanceHub = React.memo(PerformanceHubComponent);
PerformanceHub.displayName = "PerformanceHub";
