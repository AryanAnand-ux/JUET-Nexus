/** Pure helpers for deciding which attendance component percentages to render. */

import { parseDetailLink } from "./portalAttendance.ts";

export type AttendanceComponentKey = "L" | "T" | "P";

export interface AttendanceComponentDisplay {
  key: AttendanceComponentKey;
  value: number;
}

interface AttendanceComponentSource {
  lecturePercent: number;
  tutorialPercent: number;
  practicalPercent: number;
  detailLink?: string | null;
}

/**
 * A component is shown when the portal's detail ref says the component exists,
 * even if its current percentage is a genuine 0%. When component metadata is
 * unavailable, fall back to the conservative legacy rule (show positive values
 * only) so a missing component is never rendered as a fabricated zero.
 */
export function getDisplayableAttendanceComponents(
  record: AttendanceComponentSource
): AttendanceComponentDisplay[] {
  const components = parseDetailLink(record.detailLink)?.components;
  const hasComponentMetadata = Boolean(components && Object.keys(components).length > 0);

  const candidates: Array<{
    key: AttendanceComponentKey;
    value: number;
    present?: string;
  }> = [
    { key: "L", value: record.lecturePercent, present: components?.L },
    { key: "T", value: record.tutorialPercent, present: components?.T },
    { key: "P", value: record.practicalPercent, present: components?.P },
  ];

  return candidates
    .filter(({ value, present }) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      return hasComponentMetadata ? Boolean(present) : value > 0;
    })
    .map(({ key, value }) => ({ key, value }));
}
