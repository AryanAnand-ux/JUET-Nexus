/**
 * CampusLynx Exam Schedule provider.
 *
 * Confirmed ERP flow (one-hop via /api/proxy/*):
 * 1. POST /studentcommonsontroller/getsemestercode-withstudentexamevents
 *    body: { clientid, instituteid }
 *    -> response.semesterCodeinfo.semestercode[]
 *       Each row carries registrationid / registrationdesc and the portal's
 *       registration date bounds. The portal, not this client, owns the list
 *       of semesters that can have exam events.
 *
 * 2. POST /studentcommonsontroller/getstudentexamevents
 *    body: { instituteid, registationid: registrationid } // portal typo is intentional
 *    -> response.eventcode.examevent[]
 *       Every exam type (e.g. TEST-2, TEST-3, Make-up Test) is represented by
 *       exameventid + exameventdesc. No exam-type names are hardcoded here.
 *
 * 3. POST /studentsttattview/getstudent-examschedule
 *    body: { instituteid, registrationid, exameventid }
 *    -> response.subjectinfo[]
 *
 * Semester and exam-event selections are supplied by the caller. When a
 * selection is absent the provider preserves the previous behaviour: newest
 * semester, then the last exam event returned by the portal.
 */

import type {
  ExamScheduleResponse,
  ExamScheduleItem,
  ExamEvent,
  ExamSemester,
} from "@/types";
import type { JuetSession } from "./session";

type PortalIdentity = JuetSession;

export interface ExamTransport {
  postEncrypted(path: string, payload: Record<string, unknown>): Promise<unknown>;
}

const GET_SEMESTERS_PATH =
  "/studentcommonsontroller/getsemestercode-withstudentexamevents";
const GET_EVENTS_PATH =
  "/studentcommonsontroller/getstudentexamevents";
const GET_SCHEDULE_PATH =
  "/studentsttattview/getstudent-examschedule";

/** Portal wall-clock values are IST; no timezone conversion is inferred. */
const PORTAL_TIMEZONE_OFFSET = "+05:30";

export interface ExamMetadataCache {
  registrationid: string;
  semester: string;
  availableEvents: ExamEvent[];
  /** Added by the hook so metadata can expire. The provider ignores it. */
  ts?: number;
}

export interface ExamOptions {
  registrationid?: string;
  exameventid?: string;
  codeToNameMap?: Record<string, string>;
  cachedSemesters?: ExamSemester[] | null;
  cachedMetadata?: ExamMetadataCache | null;
  /** Force fresh semester/event metadata even when cached values are supplied. */
  force?: boolean;
  onSemestersResolved?: (semesters: ExamSemester[]) => void;
  onMetadataResolved?: (meta: ExamMetadataCache) => void;
}

function asText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function applyMeridiem(hour: number, meridiem?: string): number {
  const marker = meridiem?.toUpperCase();
  if (marker === "PM" && hour < 12) return hour + 12;
  if (marker === "AM" && hour === 12) return 0;
  return hour;
}

function hasExplicitOffset(value: string): boolean {
  return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value);
}

/**
 * Parse the portal's date/time strings as IST wall-clock values.
 *
 * The ERP returns either ISO-like dates or DD/MM/YYYY strings. Treating them
 * as device-local dates and then formatting in Asia/Kolkata shifts exam times
 * for users outside IST, so every naive value is normalised to +05:30 here.
 */
export function parseExamDateTime(str: string): Date | null {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;

  if (hasExplicitOffset(s)) {
    const explicit = new Date(s);
    return isNaN(explicit.getTime()) ? null : explicit;
  }

  const isoMatch = s.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i
  );
  if (isoMatch) {
    const [, y, m, d, hr, min, sec, meridiem] = isoMatch;
    const hour =
      hr !== undefined
        ? applyMeridiem(parseInt(hr, 10), meridiem)
        : 0;
    const minute = min !== undefined ? parseInt(min, 10) : 0;
    const second = sec !== undefined ? parseInt(sec, 10) : 0;
    const normalized =
      `${y}-${pad2(parseInt(m, 10))}-${pad2(parseInt(d, 10))}` +
      `T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${PORTAL_TIMEZONE_OFFSET}`;
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/);
  if (dmyMatch) {
    const [, dStr, mStr, yStr, rest] = dmyMatch;
    let day = parseInt(dStr, 10);
    let month = parseInt(mStr, 10);
    const year = parseInt(yStr, 10);

    // Some portal rows use MM/DD/YYYY. Only swap when unambiguous.
    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }

    const timeMatch = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      const hour = applyMeridiem(parseInt(timeMatch[1], 10), timeMatch[4]);
      const minute = parseInt(timeMatch[2], 10);
      const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const normalized =
        `${year}-${pad2(month)}-${pad2(day)}` +
        `T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${PORTAL_TIMEZONE_OFFSET}`;
      const parsed = new Date(normalized);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    const normalized = `${year}-${pad2(month)}-${pad2(day)}T00:00:00${PORTAL_TIMEZONE_OFFSET}`;
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function semesterTimestamp(semester: ExamSemester): number {
  for (const key of ["registrationdateto", "registrationdatefrom"] as const) {
    const value = semester[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = parseExamDateTime(value)?.getTime();
      if (parsed && Number.isFinite(parsed)) return parsed;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
  }
  return 0;
}

/** Pick the newest semester, preserving portal order when dates are absent. */
function pickLatestSemester(semesters: ExamSemester[]): ExamSemester {
  const withTimestamps = semesters.map((semester) => ({
    semester,
    ts: semesterTimestamp(semester),
  }));

  if (!withTimestamps.some((entry) => entry.ts > 0)) {
    return semesters[semesters.length - 1];
  }

  return withTimestamps.reduce((best, cur) =>
    cur.ts >= best.ts ? cur : best
  ).semester;
}

/** Normalise ERP semester rows without inventing semesters. */
export function normalizeExamSemesters(raw: unknown): ExamSemester[] {
  const body = raw as Record<string, any> | null | undefined;
  const candidates =
    body?.response?.semesterCodeinfo?.semestercode ??
    body?.response?.semestercode ??
    body?.semesterCodeinfo?.semestercode ??
    body?.semestercode;

  if (!Array.isArray(candidates)) return [];

  const seen = new Set<string>();
  const semesters: ExamSemester[] = [];
  for (const row of candidates) {
    if (!row || typeof row !== "object") continue;
    const registrationid = asText(
      (row as Record<string, unknown>).registrationid ??
        (row as Record<string, unknown>).registrationId
    );
    if (!registrationid || seen.has(registrationid)) continue;
    seen.add(registrationid);

    const registrationdesc = asText(
      (row as Record<string, unknown>).registrationdesc ??
        (row as Record<string, unknown>).semesterdesc ??
        (row as Record<string, unknown>).description
    );
    const rawRow = row as Record<string, unknown>;
    const dateValue = (key: string): string | number | undefined => {
      const value = rawRow[key];
      return typeof value === "string" || typeof value === "number" ? value : undefined;
    };

    semesters.push({
      registrationid,
      registrationdesc,
      registrationdateto: dateValue("registrationdateto"),
      registrationdatefrom: dateValue("registrationdatefrom"),
    });
  }
  return semesters;
}

/** Normalise ERP exam-event rows without inventing exam types. */
export function normalizeExamEvents(raw: unknown): ExamEvent[] {
  const body = raw as Record<string, any> | null | undefined;
  const candidates =
    body?.response?.eventcode?.examevent ??
    body?.response?.examevent ??
    body?.eventcode?.examevent ??
    body?.examevent;

  if (!Array.isArray(candidates)) return [];

  const seen = new Set<string>();
  const events: ExamEvent[] = [];
  for (const row of candidates) {
    if (!row || typeof row !== "object") continue;
    const exameventid = asText(
      (row as Record<string, unknown>).exameventid ??
        (row as Record<string, unknown>).eventid
    );
    if (!exameventid || seen.has(exameventid)) continue;
    seen.add(exameventid);

    const exameventdesc = asText(
      (row as Record<string, unknown>).exameventdesc ??
        (row as Record<string, unknown>).eventdesc ??
        (row as Record<string, unknown>).description
    );
    events.push({ exameventid, exameventdesc });
  }
  return events;
}

/**
 * Clean a subject string so only the course title/name is displayed.
 *
 * Handles:
 * - Trailing parenthesized codes: "CONCEPTS OF ECONOMICS (HS301)" -> "CONCEPTS OF ECONOMICS"
 * - Trailing bracketed codes: "COMPUTER NETWORKS [18B11CI514]" -> "COMPUTER NETWORKS"
 * - Leading code prefixes: "HS301 - CONCEPTS OF ECONOMICS" -> "CONCEPTS OF ECONOMICS"
 * - Trailing code suffixes: "CONCEPTS OF ECONOMICS - HS301" -> "CONCEPTS OF ECONOMICS"
 * - Code before paren: "HS301 (CONCEPTS OF ECONOMICS)" -> "CONCEPTS OF ECONOMICS"
 * - Direct lookup via codeToNameMap
 */
export function cleanSubjectName(rawStr: string, codeToNameMap?: Record<string, string>): string {
  if (!rawStr) return "";
  const trimmed = String(rawStr).trim();

  if (codeToNameMap) {
    const direct = codeToNameMap[trimmed.toUpperCase()] || codeToNameMap[trimmed];
    if (direct) return direct;
  }

  let s = trimmed.replace(/\s+/g, " ");

  const codeBeforeParenMatch = s.match(/^[A-Za-z0-9_-]{2,12}\s*\(([^()]+)\)$/);
  if (codeBeforeParenMatch && /[a-zA-Z]{3,}/.test(codeBeforeParenMatch[1])) {
    return codeBeforeParenMatch[1].trim();
  }

  s = s.replace(/\s*\([^()]*\)\s*$/, "");
  s = s.replace(/\s*\[[^[\]]*\]\s*$/, "");

  const leadingCodeMatch = s.match(/^[A-Za-z0-9_-]{2,12}\s*[:–-]\s*(.+)$/);
  if (leadingCodeMatch && /[a-zA-Z]{3,}/.test(leadingCodeMatch[1])) {
    s = leadingCodeMatch[1].trim();
  }

  const trailingCodeMatch = s.match(/^(.+?)\s*[:–-]\s*[A-Za-z0-9_-]{2,12}$/);
  if (trailingCodeMatch && /[a-zA-Z]{3,}/.test(trailingCodeMatch[1])) {
    s = trailingCodeMatch[1].trim();
  }

  if (codeToNameMap) {
    const mapped = codeToNameMap[s.toUpperCase()] || codeToNameMap[s];
    if (mapped) return mapped;
  }

  return s.trim();
}

function getFieldCI(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  const lowerKeys = keys.map((key) => key.toLowerCase());
  for (const [key, value] of Object.entries(obj)) {
    if (!lowerKeys.includes(key.toLowerCase()) || value === null || value === undefined) {
      continue;
    }
    const text = String(value).trim();
    if (text.length > 0) return text;
  }
  return undefined;
}

const DATE_FIELD_KEYS_LC = new Set(["datetime", "examdate", "date", "datetimeupto"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function findTimeValue(obj: Record<string, unknown>): string | undefined {
  const humanTimePattern =
    /\d{1,2}:\d{2}\s*(?:am|pm)(?:\s*(?:to|-|–)\s*\d{1,2}:\d{2}\s*(?:am|pm)?)?|\d{1,2}:\d{2}\s+(?:to|-|–)\s+\d{1,2}:\d{2}/i;

  for (const [key, value] of Object.entries(obj)) {
    if (DATE_FIELD_KEYS_LC.has(key.toLowerCase())) continue;
    if (typeof value !== "string") continue;
    if (ISO_DATE_RE.test(value)) continue;
    const match = value.match(humanTimePattern);
    if (match) return match[0].trim();
  }
  return undefined;
}

function normalizeDateString(rawDate: string): string {
  const dmyMatch = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/);
  if (!dmyMatch) return rawDate;

  const [, dStr, mStr, yStr, rest] = dmyMatch;
  let day = parseInt(dStr, 10);
  let month = parseInt(mStr, 10);
  const year = parseInt(yStr, 10);
  if (month > 12 && day <= 12) {
    const temp = day;
    day = month;
    month = temp;
  }
  return `${year}-${pad2(month)}-${pad2(day)}${rest ? rest.trim() : ""}`;
}

function mapScheduleItems(rawItems: unknown, codeToNameMap?: Record<string, string>): ExamScheduleItem[] {
  if (!Array.isArray(rawItems)) return [];
  const items: ExamScheduleItem[] = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;

    const candidateKeys = [
      "subjectname",
      "subjectdesc",
      "subjectdescription",
      "subject_desc",
      "coursename",
      "papername",
      "subject",
      "subjectcode",
    ];
    const candidates: string[] = [];
    for (const key of candidateKeys) {
      const value = getFieldCI(row, key);
      if (value && !candidates.includes(value)) candidates.push(value);
    }

    const isBareCode = (value: string) => /^[A-Za-z0-9_-]{2,12}$/.test(value.trim());
    let selectedSubject = "";
    for (const candidate of candidates) {
      const cleaned = cleanSubjectName(candidate, codeToNameMap);
      if (!isBareCode(candidate) && cleaned.length > 0) {
        selectedSubject = cleaned;
        break;
      }
    }
    if (!selectedSubject && candidates.length > 0) {
      selectedSubject = cleanSubjectName(candidates[0], codeToNameMap);
    }

    const rawDate = asText(getFieldCI(row, "examdate", "date", "datetime"));
    const fromTime = getFieldCI(row, "fromtime", "starttime");
    const toTime = getFieldCI(row, "totime", "endtime");
    const rawTime = (
      getFieldCI(row, "examtime", "time", "timings", "timing", "slot", "timeslot") ??
      (fromTime && toTime ? `${fromTime} to ${toTime}` : undefined) ??
      getFieldCI(row, "datetimeupto") ??
      findTimeValue(row) ??
      ""
    ).trim();
    const roomcode = asText(getFieldCI(row, "roomcode", "roomno", "roomnumber", "room"));
    const seatno = asText(getFieldCI(row, "seatno", "seatnumber", "seat"));

    items.push({
      subject: selectedSubject,
      datetime: normalizeDateString(rawDate),
      datetimeupto: rawTime,
      roomcode,
      seatno,
    });
  }

  items.sort((a, b) => {
    const timeA = parseExamDateTime(a.datetime)?.getTime() ?? Number.POSITIVE_INFINITY;
    const timeB = parseExamDateTime(b.datetime)?.getTime() ?? Number.POSITIVE_INFINITY;
    return timeA - timeB;
  });

  return items;
}

export async function fetchExamSchedule(
  transport: ExamTransport,
  identity: PortalIdentity,
  options?: ExamOptions
): Promise<ExamScheduleResponse> {
  const force = options?.force === true;

  // Step 1: semesters that actually have exam events in CampusLynx.
  let semesters = force ? [] : options?.cachedSemesters ?? [];
  if (semesters.length === 0) {
    const semRes = await transport.postEncrypted(GET_SEMESTERS_PATH, {
      clientid: identity.clientid,
      instituteid: identity.instituteid,
    });
    semesters = normalizeExamSemesters(semRes);
    options?.onSemestersResolved?.(semesters);
  }

  if (semesters.length === 0) {
    return {
      semester: "",
      event: "",
      items: [],
      availableEvents: [],
      availableSemesters: [],
    };
  }

  const requestedRegistrationId = asText(options?.registrationid);
  const selectedSemester =
    (requestedRegistrationId &&
      semesters.find((semester) => semester.registrationid === requestedRegistrationId)) ||
    pickLatestSemester(semesters);
  const registrationid = selectedSemester.registrationid;
  const semesterDesc = selectedSemester.registrationdesc;

  // Step 2: exam events for the selected semester. Every option comes from ERP.
  const metadataUsable =
    !force &&
    options?.cachedMetadata?.registrationid === registrationid &&
    options.cachedMetadata.availableEvents.length > 0;

  let availableEvents = metadataUsable
    ? options!.cachedMetadata!.availableEvents
    : [];

  if (availableEvents.length === 0) {
    const eventRes = await transport.postEncrypted(GET_EVENTS_PATH, {
      instituteid: identity.instituteid,
      // The upstream API really does spell this key "registationid".
      registationid: registrationid,
    });
    availableEvents = normalizeExamEvents(eventRes);
    options?.onMetadataResolved?.({
      registrationid,
      semester: semesterDesc,
      availableEvents,
    });
  }

  const requestedEventId = asText(options?.exameventid);
  const targetEvent =
    (requestedEventId &&
      availableEvents.find((event) => event.exameventid === requestedEventId)) ||
    availableEvents[availableEvents.length - 1];
  const exameventid = targetEvent?.exameventid ?? "";
  const eventDesc = targetEvent?.exameventdesc ?? "";

  if (!exameventid) {
    return {
      semester: semesterDesc,
      event: eventDesc,
      items: [],
      availableEvents,
      availableSemesters: semesters,
      registrationid,
      exameventid,
    };
  }

  // Step 3: timetable for the selected semester + exam event.
  const scheduleRes = (await transport.postEncrypted(GET_SCHEDULE_PATH, {
    instituteid: identity.instituteid,
    registrationid,
    exameventid,
  })) as Record<string, any> | null | undefined;

  const items = mapScheduleItems(
    scheduleRes?.response?.subjectinfo ?? scheduleRes?.subjectinfo,
    options?.codeToNameMap
  );

  return {
    semester: semesterDesc,
    event: eventDesc,
    items,
    availableEvents,
    availableSemesters: semesters,
    registrationid,
    exameventid,
  };
}
