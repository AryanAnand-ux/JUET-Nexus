"use client";

import React from "react";

export interface FilterPillOption<T extends string = string> {
  id: T;
  label: string;
  title?: string;
}

export interface FilterPillsProps<T extends string = string> {
  options: FilterPillOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * Universal horizontal filter pills.
 *
 * One design source for the Marks assessment filters and the Exam exam-type
 * filters: inverted high-contrast active state, token-driven colors,
 * touch-friendly sizing, and horizontal scrolling on narrow screens.
 */
export function FilterPills<T extends string = string>({
  options,
  selectedId,
  onSelect,
  isLoading = false,
  className = "",
}: FilterPillsProps<T>) {
  if (options.length === 0) return null;

  return (
    <div className={`flex w-full gap-2 overflow-x-auto pb-1 ${className}`.trim()}>
      {options.map((option) => {
        const isActive = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            title={option.title}
            disabled={isLoading}
            aria-pressed={isActive}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
              isActive
                ? "border-[var(--ink-strong)] bg-[var(--ink-strong)] text-[var(--surface-page)]"
                : "border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-muted)] hover:text-[var(--ink-strong)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
