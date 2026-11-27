/** Pure helpers for marks summaries. Shared by the marks UI and its tests. */

export interface MarkItem {
  subject: string;
  code?: string;
  obtained?: number;
  max?: number;
  assessmentName?: string;
}

export interface MarkSummary {
  /** Sum of scores with a usable maximum, or null when nothing is published. */
  scored: number | null;
  /** Sum of the matching maximum marks, or null when nothing is published. */
  maximum: number | null;
  /** weighted percentage from the same usable marks, or null when unavailable. */
  percentage: number | null;
  /** Number of marks included in both totals. */
  counted: number;
}

/**
 * Uses only marks that have both a finite obtained value and a usable maximum.
 * A missing maximum is never coerced to zero, so it cannot skew the percentage.
 */
export function summarizeMarks(items: readonly MarkItem[]): MarkSummary {
  let scored = 0;
  let maximum = 0;
  let counted = 0;

  for (const item of items) {
    const obtained = item.obtained;
    const max = item.max;
    if (
      typeof obtained !== "number" ||
      !Number.isFinite(obtained) ||
      obtained < 0 ||
      typeof max !== "number" ||
      !Number.isFinite(max) ||
      max <= 0
    ) {
      continue;
    }
    scored += obtained;
    maximum += max;
    counted += 1;
  }

  return {
    scored: counted > 0 ? scored : null,
    maximum: counted > 0 ? maximum : null,
    percentage: maximum > 0 ? (scored / maximum) * 100 : null,
    counted,
  };
}

/** Compact display formatter; unavailable values render as an em dash. */
export function formatMarkValue(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
