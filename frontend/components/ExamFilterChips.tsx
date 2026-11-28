"use client";

import React from "react";
import type { ExamEvent } from "@/types";
import { FilterPills } from "./FilterPills";

export interface ExamFilterChipsProps {
  events: ExamEvent[];
  selectedEventId: string;
  isLoading?: boolean;
  onSelect: (eventId: string) => void;
}

/**
 * Exam-specific adapter for the universal filter pills. Options come only
 * from the ERP exam-event response; no "All" option and no label bar.
 */
export function ExamFilterChips({
  events,
  selectedEventId,
  isLoading = false,
  onSelect,
}: ExamFilterChipsProps) {
  return (
    <FilterPills
      options={events.map((event) => ({
        id: event.exameventid,
        label: event.exameventdesc || event.exameventid,
        title: event.exameventdesc || event.exameventid,
      }))}
      selectedId={selectedEventId}
      onSelect={onSelect}
      isLoading={isLoading}
      className="mb-4"
    />
  );
}
