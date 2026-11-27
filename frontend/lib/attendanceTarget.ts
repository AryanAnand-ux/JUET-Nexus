/** Shared, persistent attendance target (percent). No UI or React dependencies. */

export const DEFAULT_ATTENDANCE_TARGET = 75;
export const ATTENDANCE_TARGET_STORAGE_KEY = "juet.attendance.target.v1";

const MIN_TARGET = 1;
const MAX_TARGET = 100;

/** Validate & normalise a stored or user-entered target. Returns null when unusable. */
export function normalizeAttendanceTarget(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;

  if (!Number.isFinite(numeric)) return null;
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(numeric)));
}

export function readAttendanceTarget(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_TARGET_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAttendanceTarget(raw);
  } catch {
    return null;
  }
}

export function writeAttendanceTarget(value: number): void {
  const normalized = normalizeAttendanceTarget(value);
  if (normalized === null || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTENDANCE_TARGET_STORAGE_KEY, String(normalized));
  } catch {
    // Storage can be unavailable (private mode / quota); in-memory value still applies.
  }
}
