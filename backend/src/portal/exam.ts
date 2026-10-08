/**
 * CampusLynx Exam Schedule provider.
 *
 * Confirmed by reference implementation (lazyportal):
 * 1. POST /studentcommonsontroller/getsemestercode-withstudentexamevents
 *    body: { clientid, instituteid }
 *    -> response.semesterCodeinfo.semestercode[]
 *
 * 2. POST /studentcommonsontroller/getstudentexamevents
 *    body: { instituteid, registationid: registrationid } // note typo in portal key
 *    -> response.eventcode.examevent[]
 *
 * 3. POST /studentsttattview/getstudent-examschedule
 *    body: { instituteid, registrationid, exameventid }
 *    -> response.subjectinfo[]
 */

import type {
  ExamScheduleResponse,
  ExamScheduleItem,
} from "../../../shared/types";
import type { PortalIdentity } from "./types";

export interface ExamTransport {
  postEncrypted(path: string, payload: Record<string, unknown>): Promise<unknown>;
}

const GET_SEMESTERS_PATH =
  "/studentcommonsontroller/getsemestercode-withstudentexamevents";
const GET_EVENTS_PATH =
  "/studentcommonsontroller/getstudentexamevents";
const GET_SCHEDULE_PATH =
  "/studentsttattview/getstudent-examschedule";

export interface ExamOptions {
  exameventid?: string;
  codeToNameMap?: Record<string, string>;
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

  // If there's an exact match in the mapping (e.g. "HS301" -> "CONCEPTS OF ECONOMICS")
  if (codeToNameMap) {
    const direct = codeToNameMap[trimmed.toUpperCase()] || codeToNameMap[trimmed];
    if (direct) return direct;
  }

  let s = trimmed.replace(/\s+/g, " ");

  // If format is "CODE (NAME)", e.g. "HS301 (CONCEPTS OF ECONOMICS)"
  const codeBeforeParenMatch = s.match(/^[A-Za-z0-9_-]{2,12}\s*\(([^()]+)\)$/);
  if (codeBeforeParenMatch && /[a-zA-Z]{3,}/.test(codeBeforeParenMatch[1])) {
    return codeBeforeParenMatch[1].trim();
  }

  // Strip trailing parenthesized code: "CONCEPTS OF ECONOMICS (HS301)" -> "CONCEPTS OF ECONOMICS"
  s = s.replace(/\s*\([^()]*\)\s*$/, "");

  // Strip trailing bracketed code: "CONCEPTS OF ECONOMICS [HS301]" -> "CONCEPTS OF ECONOMICS"
  s = s.replace(/\s*\[[^[\]]*\]\s*$/, "");

  // Strip leading code with separator: "HS301 - CONCEPTS OF ECONOMICS" or "HS301: CONCEPTS OF ECONOMICS"
  const leadingCodeMatch = s.match(/^[A-Za-z0-9_-]{2,12}\s*[:–-]\s*(.+)$/);
  if (leadingCodeMatch && /[a-zA-Z]{3,}/.test(leadingCodeMatch[1])) {
    s = leadingCodeMatch[1].trim();
  }

  // Strip trailing code with separator: "CONCEPTS OF ECONOMICS - HS301"
  const trailingCodeMatch = s.match(/^(.+?)\s*[:–-]\s*[A-Za-z0-9_-]{2,12}$/);
  if (trailingCodeMatch && /[a-zA-Z]{3,}/.test(trailingCodeMatch[1])) {
    s = trailingCodeMatch[1].trim();
  }

  // Check map again after stripping
  if (codeToNameMap) {
    const mapped = codeToNameMap[s.toUpperCase()] || codeToNameMap[s];
    if (mapped) return mapped;
  }

  return s.trim();
}

function parseExamDateTime(str: string): Date | null {
  if (!str) return null;
  const s = str.trim();
  const isoMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, y, m, d, hr, min, sec] = isoMatch;
    if (hr !== undefined) {
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(hr, 10), parseInt(min, 10), sec ? parseInt(sec, 10) : 0);
    }
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/);
  if (dmyMatch) {
    let [, dStr, mStr, yStr, rest] = dmyMatch;
    let d = parseInt(dStr, 10);
    let m = parseInt(mStr, 10);
    const y = parseInt(yStr, 10);
    if (m > 12 && d <= 12) {
      const temp = d;
      d = m;
      m = temp;
    }
    const timeMatch = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      let hr = parseInt(timeMatch[1], 10);
      const min = parseInt(timeMatch[2], 10);
      const sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const mer = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
      if (mer === "PM" && hr < 12) hr += 12;
      if (mer === "AM" && hr === 12) hr = 0;
      return new Date(y, m - 1, d, hr, min, sec);
    }
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function fetchExamSchedule(
  transport: ExamTransport,
  identity: PortalIdentity,
  options?: ExamOptions
): Promise<ExamScheduleResponse> {
  // Step 1: get semesters with student exam events
  const semRes = (await transport.postEncrypted(GET_SEMESTERS_PATH, {
    clientid: identity.clientid,
    instituteid: identity.instituteid,
  })) as any;

  const semesters = semRes?.response?.semesterCodeinfo?.semestercode;
  if (!Array.isArray(semesters) || semesters.length === 0) {
    return { semester: "", event: "", items: [] };
  }

  // Pick the active / latest semester (highest registrationdateto or last entry)
  const latestSemester = semesters.reduce((best, cur) => {
    const curTo = Number(cur?.registrationdateto) || Number(cur?.registrationdatefrom) || 0;
    const bestTo = Number(best?.registrationdateto) || Number(best?.registrationdatefrom) || 0;
    if (curTo > 0 && bestTo > 0) {
      return curTo >= bestTo ? cur : best;
    }
    return cur;
  }, semesters[semesters.length - 1]);

  const registrationid = latestSemester?.registrationid;
  const semesterDesc = String(latestSemester?.registrationdesc ?? "").trim();

  if (!registrationid) {
    return { semester: semesterDesc, event: "", items: [] };
  }

  // Step 2: get exam events for this registration
  // Note: the portal API uses the typo 'registationid'
  const eventRes = (await transport.postEncrypted(GET_EVENTS_PATH, {
    instituteid: identity.instituteid,
    registationid: registrationid,
  })) as any;

  const events = eventRes?.response?.eventcode?.examevent;
  if (!Array.isArray(events) || events.length === 0) {
    return { semester: semesterDesc, event: "", items: [] };
  }

  const availableEvents = events
    .map((ev: any) => ({
      exameventid: String(ev.exameventid ?? ""),
      exameventdesc: String(ev.exameventdesc ?? "").trim(),
    }))
    .filter((ev) => ev.exameventid.length > 0);

  // If specific event requested, find it; otherwise default to the last one (most recent)
  const targetEvent = options?.exameventid
    ? events.find((ev: any) => String(ev.exameventid) === options.exameventid) ?? events[events.length - 1]
    : events[events.length - 1];

  const exameventid = targetEvent?.exameventid;
  const eventDesc = String(targetEvent?.exameventdesc ?? "").trim();

  if (!exameventid) {
    return { semester: semesterDesc, event: eventDesc, items: [], availableEvents };
  }

  // Step 3: get student exam schedule
  const scheduleRes = (await transport.postEncrypted(GET_SCHEDULE_PATH, {
    instituteid: identity.instituteid,
    registrationid,
    exameventid,
  })) as any;

  const rawItems = scheduleRes?.response?.subjectinfo;
  const items: ExamScheduleItem[] = [];

  // Case-insensitive field lookup helper (portal uses mixed PascalCase/camelCase)
  function getFieldCI(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
    const lowerKeys = keys.map((k) => k.toLowerCase());
    for (const [k, v] of Object.entries(obj)) {
      if (lowerKeys.includes(k.toLowerCase()) && v !== null && v !== undefined) {
        const s = String(v).trim();
        if (s.length > 0) return s;
      }
    }
    return undefined;
  }

  // Regex scan: find any value that looks like a human time or time range.
  // Requires am/pm marker OR a range separator to avoid matching bare HH:MM tokens
  // embedded in ISO date strings like "2026-12-10T00:00:00".
  const DATE_FIELD_KEYS_LC = new Set(["datetime", "examdate", "date", "datetimeupto"]);
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
  function findTimeValue(obj: Record<string, unknown>): string | undefined {
    const humanTimePattern =
      /\d{1,2}:\d{2}\s*(?:am|pm)(?:\s*(?:to|-|–)\s*\d{1,2}:\d{2}\s*(?:am|pm)?)?|\d{1,2}:\d{2}\s+(?:to|-|–)\s+\d{1,2}:\d{2}/i;
    for (const [k, v] of Object.entries(obj)) {
      if (DATE_FIELD_KEYS_LC.has(k.toLowerCase())) continue;
      if (typeof v !== "string") continue;
      if (ISO_DATE_RE.test(v)) continue;
      if (humanTimePattern.test(v)) {
        const m = v.match(humanTimePattern);
        if (m) return m[0].trim();
      }
    }
    return undefined;
  }

  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      if (!raw) continue;
      // Candidate keys for subject name/desc/code
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
      for (const k of candidateKeys) {
        const val = getFieldCI(raw, k);
        if (val && !candidates.includes(val)) {
          candidates.push(val);
        }
      }

      const isBareCode = (str: string) => /^[A-Za-z0-9_-]{2,12}$/.test(str.trim());

      // Score candidates: prefer full titles over bare course codes
      let selectedSubject = "";
      for (const cand of candidates) {
        const cleaned = cleanSubjectName(cand, options?.codeToNameMap);
        if (!isBareCode(cand) && cleaned.length > 0) {
          selectedSubject = cleaned;
          break;
        }
      }

      if (!selectedSubject && candidates.length > 0) {
        selectedSubject = cleanSubjectName(candidates[0], options?.codeToNameMap);
      }

      const subject = selectedSubject || "";

      const rawDate = String(
        getFieldCI(raw, "examdate", "date", "datetime") ?? ""
      ).trim();

      // Try explicit time fields first (case-insensitive), then combine from/to, then regex scan
      const fromTime = getFieldCI(raw, "fromtime", "starttime");
      const toTime = getFieldCI(raw, "totime", "endtime");
      const rawTime = (
        getFieldCI(raw, "examtime", "time", "timings", "timing", "slot", "timeslot") ??
        (fromTime && toTime ? `${fromTime} to ${toTime}` : undefined) ??
        getFieldCI(raw, "datetimeupto") ??
        findTimeValue(raw) ??
        ""
      ).trim();

      const roomcode = String(
        getFieldCI(raw, "roomcode", "roomno", "roomnumber", "room") ?? ""
      ).trim();

      const seatno = String(
        getFieldCI(raw, "seatno", "seatnumber", "seat") ?? ""
      ).trim();

      let normalizedDate = rawDate;
      const dmyMatch = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/);
      if (dmyMatch) {
        let [, dStr, mStr, yStr, rest] = dmyMatch;
        let d = parseInt(dStr, 10);
        let m = parseInt(mStr, 10);
        const y = parseInt(yStr, 10);
        if (m > 12 && d <= 12) {
          const temp = d;
          d = m;
          m = temp;
        }
        const pad = (n: number) => String(n).padStart(2, "0");
        normalizedDate = `${y}-${pad(m)}-${pad(d)}${rest ? rest.trim() : ""}`;
      }

      items.push({
        subject,
        datetime: normalizedDate,
        datetimeupto: rawTime,
        roomcode,
        seatno,
      });
    }
  }

  items.sort((a, b) => {
    const timeA = parseExamDateTime(a.datetime)?.getTime() ?? 0;
    const timeB = parseExamDateTime(b.datetime)?.getTime() ?? 0;
    return timeA - timeB;
  });

  return {
    semester: semesterDesc,
    event: eventDesc,
    items,
    availableEvents,
  };
}
