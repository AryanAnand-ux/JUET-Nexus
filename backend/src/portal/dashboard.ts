/**
 * CampusLynx dashboard provider.
 *
 * Assembles the shared `DashboardResponse` contract from the portal's JSON
 * endpoints so the frontend never knows which backend served it. Every request
 * shape below was taken from the portal's own Angular bundle
 * (`/studentportal/main.*.js`), not guessed, and every response shape is pinned
 * by a captured live fixture in `tests/fixtures/`.
 *
 * Endpoint map (all POST unless noted):
 *   studentInfo     /studentsgpacgpa/loadData
 *                     body { instituteid } -> response.studentInfo[0]
 *                     { name, enrollmentno, branchdesc, stynumber, studentid }
 *   registrations   /studentcommonsontroller/getsemestercode-exammarks
 *                     (see fetchLatestRegistration in ./attendance)
 *   attendance      /StudentClassAttendance/getstudentattendancedetail
 *                     (see fetchAttendanceSummary in ./attendance)
 *   marks           /studentsexamview/getstudent-exammarks
 *                     body { instituteid, registrationid, companyid }
 *                     -> response.viewmarksbystudent[]
 *   semesters       /studentsgpacgpa/checkIfstudentmasterexist
 *                     body { instituteid, studentid, name, enrollmentno }
 *                     -> response.studentlov.currentsemester, then
 *                   /studentsgpacgpa/getallsemesterdata
 *                     body { instituteid, studentid, stynumber: currentsemester }
 *                     -> response.semesterList[] { stynumber, sgpa, cgpa, ... }
 *   notices         GET /token/marqeelist -> response.text[]
 *
 * Known gaps, stated plainly rather than faked:
 *   - `getallsemesterdata` answered 500 (SQLGrammarException) for the captured
 *     student with bundle-exact bodies, so `performance.semesters` is usually
 *     empty and SGPA/CGPA read 0. The frontend renders an "unavailable" state
 *     for that case instead of fake zeros. If the portal answers, the rows map
 *     normally -- nothing here needs to change.
 *   - The marquee carries plain strings only (no dates, no links), so notices
 *     degrade to `{ title, date: "", link: "" }`. The portal has no noticeboard.
 *   - The portal exposes no per-subject credits, so `courses[].credits` is 0.
 *     The courses page hides its credits UI when every course reports 0.
 *   - `getstudent-personalinformation` answered 400 with both bundle-exact
 *     bodies, so it is not called; `loadData` already yields name/enrollment/
 *     branch, which is all the contract needs.
 */

import * as zlib from "node:zlib";
import type {
  AttendanceRecord,
  DashboardResponse,
  DetailedCourseMarks,
  NoticeRecord,
  PerformanceData,
  RegisteredCourse,
  SemesterRecord,
  StudentInfo,
} from "../../../shared/types";
import { PortalError } from "./types";
import {
  fetchAttendanceSummary,
  fetchRegistrationsOrdered,
  parseDetailLink,
  type PortalRegistration,
} from "./attendance";

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const LOAD_DATA_PATH = "/studentsgpacgpa/loadData";
const MASTER_CHECK_PATH = "/studentsgpacgpa/checkIfstudentmasterexist";
const ALL_SEMESTERS_PATH = "/studentsgpacgpa/getallsemesterdata";
const EXAM_MARKS_PATH = "/studentsexamview/getstudent-exammarks";
const MARQUEE_PATH = "/token/marqeelist";

/** Transport the provider needs: encrypted POST plus the authenticated GET. */
export interface DashboardTransport {
  postEncrypted(path: string, payload: Record<string, unknown>): Promise<unknown>;
  getEncrypted(path: string): Promise<unknown>;
  getBuffer?(path: string): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// Raw portal shapes (all fields optional -- the portal is not our schema)
// ---------------------------------------------------------------------------

interface PortalStudentInfoRow {
  name?: unknown;
  enrollmentno?: unknown;
  branchdesc?: unknown;
  branchcode?: unknown;
  stynumber?: unknown;
  studentid?: unknown;
}

interface PortalSemesterRow {
  stynumber?: unknown;
  sgpa?: unknown;
  cgpa?: unknown;
  course_credits?: unknown;
  coursecredits?: unknown;
  credits?: unknown;
  earned_credit?: unknown;
  earnedcredits?: unknown;
  earned?: unknown;
}

export interface PortalMarkRow {
  subjectcode?: unknown;
  subjectdesc?: unknown;
  eventcode?: unknown;
  exameventid?: unknown;
  fullmarks?: unknown;
  passingmarks?: unknown;
  obtainedmarks?: unknown;
  weightage?: unknown;
  obtainedWeightage?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = num(value);
    if (n !== 0 || value === 0) return n;
  }
  return 0;
}

/**
 * Unwrap a portal envelope, throwing a `PortalError` on anything that is not
 * `{ status: { responseStatus: "Success" }, response: {...} }`. A Failure that
 * merely reports missing records can be tolerated by passing
 * `tolerateNoRecords`, which returns `{}` instead of throwing for it.
 */
function extractDashboardResponse(
  payload: unknown,
  path: string,
  tolerateNoRecords = false
): Record<string, unknown> {
  const envelope = payload as
    | { status?: { responseStatus?: string; errors?: unknown }; response?: unknown }
    | null
    | undefined;
  const response = envelope?.response;
  if (envelope?.status?.responseStatus === "Success" && response && typeof response === "object") {
    return response as Record<string, unknown>;
  }
  if (tolerateNoRecords) {
    const errors = envelope?.status?.errors;
    const messages = Array.isArray(errors) ? errors : errors ? [errors] : [];
    if (messages.some((m) => /no .*found|no record|not found|no data/i.test(String(m)))) {
      return {};
    }
  }
  const errors = envelope?.status?.errors;
  throw new PortalError(
    `The portal refused ${path}${errors ? `: ${String(errors)}` : "."}`,
    502,
    payload
  );
}

// ---------------------------------------------------------------------------
// Student profile
// ---------------------------------------------------------------------------

export interface CampusLynxProfile extends StudentInfo {
  branchcode: string;
  stynumber: string;
  studentid: string;
}

/** First (and normally only) `studentInfo` row from `loadData`. */
export async function fetchStudentProfile(
  transport: DashboardTransport,
  instituteid: string
): Promise<CampusLynxProfile> {
  const response = extractDashboardResponse(
    await transport.postEncrypted(LOAD_DATA_PATH, { instituteid }),
    LOAD_DATA_PATH
  );
  const row = (Array.isArray(response.studentInfo)
    ? (response.studentInfo as PortalStudentInfoRow[])[0]
    : undefined) as PortalStudentInfoRow | undefined;
  if (!row || !text(row.enrollmentno)) {
    throw new PortalError("The portal returned no student profile.", 502);
  }
  return {
    name: text(row.name),
    enrollment: text(row.enrollmentno),
    branch: text(row.branchdesc),
    branchcode: text(row.branchcode),
    stynumber: text(row.stynumber),
    studentid: text(row.studentid),
  };
}

// ---------------------------------------------------------------------------
// Semesters / SGPA / CGPA
// ---------------------------------------------------------------------------

export function mapSemesterRow(row: PortalSemesterRow): SemesterRecord {
  return {
    semester: Math.trunc(num(row.stynumber)),
    sgpa: num(row.sgpa),
    cgpa: num(row.cgpa),
    credits: firstNumber(row.course_credits, row.coursecredits, row.credits),
    earnedCredits: firstNumber(row.earned_credit, row.earnedcredits, row.earned),
  };
}

/**
 * Semester list plus the current semester pointer. Returns `null` when the
 * portal has no result data for the student (the live capture saw a 500 here
 * with bundle-exact bodies), so the caller can degrade to an empty
 * performance section instead of failing the whole dashboard.
 */
export async function fetchSemesters(
  transport: DashboardTransport,
  args: { instituteid: string; studentid: string; name: string; enrollmentno: string }
): Promise<{ semesters: SemesterRecord[]; currentStynumber: string } | null> {
  let master: Record<string, unknown>;
  try {
    master = extractDashboardResponse(
      await transport.postEncrypted(MASTER_CHECK_PATH, {
        instituteid: args.instituteid,
        studentid: args.studentid,
        name: args.name,
        enrollmentno: args.enrollmentno,
      }),
      MASTER_CHECK_PATH
    );
  } catch {
    return null;
  }
  const currentStynumber = text(
    (master.studentlov as { currentsemester?: unknown } | undefined)?.currentsemester
  );

  let list: Record<string, unknown>;
  try {
    list = extractDashboardResponse(
      await transport.postEncrypted(ALL_SEMESTERS_PATH, {
        instituteid: args.instituteid,
        studentid: args.studentid,
        stynumber: currentStynumber,
      }),
      ALL_SEMESTERS_PATH
    );
  } catch {
    return null;
  }
  const rows = Array.isArray(list.semesterList)
    ? (list.semesterList as PortalSemesterRow[])
    : [];
  return {
    semesters: rows.map(mapSemesterRow).filter((r) => r.semester > 0),
    currentStynumber,
  };
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

const GET_EVENTS_PATH = "/studentcommonsontroller/getstudentexamevents";

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length < 2 || clean.length % 2 !== 0) return "";
  const buf = Buffer.from(clean, "hex");
  if (buf.length >= 2 && buf[0] === 0x00 && buf[1] >= 0x20) {
    let out = "";
    for (let i = 0; i < buf.length; i += 2) {
      out += String.fromCharCode((buf[i] << 8) | buf[i + 1]);
    }
    return out;
  }
  return buf.toString("latin1");
}

export function extractTextFromPdf(pdfBuffer: Buffer): string {
  const contentStreams: string[] = [];
  let pos = 0;
  while (pos < pdfBuffer.length) {
    const streamStart = pdfBuffer.indexOf("stream", pos);
    if (streamStart === -1) break;

    let dataStart = streamStart + 6;
    if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const streamEnd = pdfBuffer.indexOf("endstream", dataStart);
    if (streamEnd === -1) break;

    let rawData = pdfBuffer.subarray(dataStart, streamEnd);
    while (
      rawData.length > 0 &&
      (rawData[rawData.length - 1] === 0x0a ||
        rawData[rawData.length - 1] === 0x0d ||
        rawData[rawData.length - 1] === 0x20 ||
        rawData[rawData.length - 1] === 0x00)
    ) {
      rawData = rawData.subarray(0, rawData.length - 1);
    }

    try {
      const decompressed = zlib.inflateSync(rawData);
      contentStreams.push(decompressed.toString("latin1"));
    } catch {
      try {
        const decompressedRaw = zlib.inflateRawSync(rawData);
        contentStreams.push(decompressedRaw.toString("latin1"));
      } catch {
        contentStreams.push(rawData.toString("latin1"));
      }
    }
    pos = streamEnd + 9;
  }

  const allText: string[] = [];
  for (const stream of contentStreams) {
    // Array TJ: [(str1) 20 (str2)] TJ or [<0041> 20 <0042>] TJ
    const tjRegex = /\[(.*?)\]\s*TJ/gs;
    let match: RegExpExecArray | null;
    while ((match = tjRegex.exec(stream)) !== null) {
      const inside = match[1];
      const partRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g;
      let pMatch: RegExpExecArray | null;
      let line = "";
      while ((pMatch = partRegex.exec(inside)) !== null) {
        if (pMatch[1] !== undefined) {
          line += pMatch[1];
        } else if (pMatch[2] !== undefined) {
          line += decodePdfHex(pMatch[2]);
        }
      }
      if (line.trim()) allText.push(line.trim());
    }

    // Single Tj: (str) Tj or <hex> Tj
    const singleTjRegex = /(?:\(([^)]*)\)|<([0-9a-fA-F]+)>)\s*Tj/g;
    while ((match = singleTjRegex.exec(stream)) !== null) {
      if (match[1] !== undefined) {
        if (match[1].trim()) allText.push(match[1].trim());
      } else if (match[2] !== undefined) {
        const decoded = decodePdfHex(match[2]);
        if (decoded.trim()) allText.push(decoded.trim());
      }
    }

    // Next line operators ' or "
    const quoteRegex = /(?:\(([^)]*)\)|<([0-9a-fA-F]+)>)\s*['"]/g;
    while ((match = quoteRegex.exec(stream)) !== null) {
      if (match[1] !== undefined) {
        if (match[1].trim()) allText.push(match[1].trim());
      } else if (match[2] !== undefined) {
        const decoded = decodePdfHex(match[2]);
        if (decoded.trim()) allText.push(decoded.trim());
      }
    }
  }
  return allText.join("\n");
}

export function parsePdfMarks(rawText: string): PortalMarkRow[] {
  if (!rawText) return [];
  const lines = rawText
    .split("\n")
    .map((l) => l.replace(/\\([()])/g, "$1").trim())
    .filter((l) => l.length > 0 && l !== "\u00a0");

  const isScoreCell = (line: string) => /^-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?$/.test(line) || line === "-" || line === "--";
  const isMarker = (line: string) => /om\s*\/\s*fm/i.test(line) || /ow\s*\/\s*wt/i.test(line) || /^obtained/i.test(line) || /^max/i.test(line) || /^weight/i.test(line);
  const isFooter = (line: string) => /^legend$/i.test(line) || /^description/i.test(line) || /^note[:\s]/i.test(line) || /^page\s+\d+/i.test(line);

  let subjCodeIdx = lines.findIndex((l) => /subject\s*code/i.test(l));
  if (subjCodeIdx === -1) {
    subjCodeIdx = lines.findIndex((l) => /^subject$/i.test(l) || /^course\s*code$/i.test(l) || /^subject\s*name/i.test(l));
  }
  if (subjCodeIdx === -1) return [];

  // Event labels appear after subject header and before score/header markers.
  const events: string[] = [];
  let idx = subjCodeIdx + 1;
  while (idx < lines.length) {
    const line = lines[idx];
    if (isMarker(line) || isScoreCell(line)) break;
    if (isFooter(line)) return [];
    if (!/^subject$/i.test(line) && !/^course$/i.test(line)) events.push(line);
    idx++;
  }
  if (events.length === 0) return [];

  while (idx < lines.length && isMarker(lines[idx])) idx++;

  type SubjectBlock = { labels: string[]; cells: string[] };
  const blocks: SubjectBlock[] = [];
  let current: SubjectBlock | null = null;
  const cellsNeeded = events.length * 2;

  const flush = () => {
    if (!current) return;
    if (current.cells.length > 0) {
      while (current.cells.length < cellsNeeded) current.cells.push("-");
      blocks.push(current);
    }
    current = null;
  };

  for (let i = idx; i < lines.length; i++) {
    const line = lines[i];
    if (isFooter(line)) break;
    if (isMarker(line)) continue;

    if (isScoreCell(line)) {
      if (!current) {
        // orphan score cell; ignore
        continue;
      }
      if (current.cells.length >= cellsNeeded) {
        flush();
        // if somehow another score appears immediately after a full block, drop it
        continue;
      }
      current.cells.push(line);
      if (current.cells.length >= cellsNeeded) flush();
      continue;
    }

    // Non-score, non-marker text: subject label/name/code (or noise)
    if (!current) {
      current = { labels: [line], cells: [] };
      continue;
    }
    if (current.cells.length === 0) {
      current.labels.push(line);
      continue;
    }
    if (current.cells.length < cellsNeeded) {
      // New subject started before previous completed; pad and move on.
      flush();
      current = { labels: [line], cells: [] };
      continue;
    }
    flush();
    current = { labels: [line], cells: [] };
  }
  flush();

  const rows: PortalMarkRow[] = [];
  for (const block of blocks) {
    let subjectdesc = "";
    let subjectcode = "";

    for (const label of block.labels) {
      const trimmed = label.trim();
      if (!trimmed) continue;

      const onlyCode = trimmed.match(/^\(([A-Z0-9_./-]+)\)$/i);
      if (onlyCode) {
        subjectcode = subjectcode || onlyCode[1].trim();
        continue;
      }

      const embedded = trimmed.match(/^(.*?)[\s]*\(([A-Z0-9_./-]+)\)\s*$/);
      if (embedded) {
        const namePart = embedded[1].trim();
        const codePart = embedded[2].trim();
        if (!subjectcode && /^[A-Z0-9]{2,}/i.test(codePart)) subjectcode = codePart;
        if (namePart) subjectdesc = subjectdesc ? `${subjectdesc} ${namePart}` : namePart;
        continue;
      }

      if (!subjectcode && /^[A-Z0-9]{2,}[A-Z0-9._/-]*$/i.test(trimmed) && trimmed.length <= 20 && !/\s/.test(trimmed)) {
        subjectcode = trimmed;
        continue;
      }

      subjectdesc = subjectdesc ? `${subjectdesc} ${trimmed}` : trimmed;
    }

    subjectdesc = subjectdesc.trim();
    subjectcode = subjectcode.trim();
    if (!subjectdesc && !subjectcode) continue;

    for (let e = 0; e < events.length; e++) {
      const omFm = block.cells[e * 2] ?? "-";
      const owWt = block.cells[e * 2 + 1] ?? "-";
      if (!omFm || omFm === "-" || omFm === "--" || !omFm.includes("/")) continue;

      const parts = omFm.split("/").map((p) => parseFloat(p.trim()));
      const obtained = Number.isFinite(parts[0]) ? parts[0] : 0;
      const max = Number.isFinite(parts[1]) ? parts[1] : 0;

      const wtParts = owWt && owWt !== "-" && owWt !== "--" && owWt.includes("/")
        ? owWt.split("/").map((p) => parseFloat(p.trim()))
        : [];
      const obtainedWeightage = Number.isFinite(wtParts?.[0]) ? wtParts[0] : obtained;
      const weightage = Number.isFinite(wtParts?.[1]) ? wtParts[1] : max;

      rows.push({
        subjectcode: subjectcode || subjectdesc,
        subjectdesc: subjectdesc || subjectcode,
        eventcode: events[e],
        fullmarks: max,
        obtainedmarks: obtained,
        weightage,
        obtainedWeightage,
      });
    }
  }

  return rows;
}

function findMarkRowsDeep(payload: unknown): PortalMarkRow[] {
  const seen = new Set<any>();
  const out: PortalMarkRow[] = [];

  function visit(node: unknown, depth: number) {
    if (!node || depth > 6) return;
    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.length > 0) {
        const objects = node.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
        if (objects.length > 0) {
          const score = (o: Record<string, unknown>) =>
            (o.subjectcode || o.subjectCode || o.subjectdesc || o.subjectDesc || o.subject ? 1 : 0) +
            (o.obtainedmarks || o.obtainedMarks || o.marks || o.obtained ? 1 : 0) +
            (o.eventcode || o.eventCode || o.exameventid || o.examEventId || o.event ? 1 : 0);
          const plausible = objects.filter((o) => score(o) >= 2);
          if (plausible.length > 0) out.push(...(plausible as unknown as PortalMarkRow[]));
        }
      }
      for (const item of node) visit(item, depth + 1);
      return;
    }

    const obj = node as Record<string, unknown>;
    const priorityKeys = ["viewmarksbystudent", "studentMarks", "studentmarks", "marks", "subjectMarks", "exammarks"];
    for (const k of priorityKeys) {
      if (Array.isArray(obj[k])) visit(obj[k], depth + 1);
    }
    for (const value of Object.values(obj)) visit(value, depth + 1);
  }

  visit(payload, 0);
  return out;
}

function extractMarkRowsFromPayload(rawResponse: unknown, path: string): PortalMarkRow[] {
  try {
    const response = extractDashboardResponse(rawResponse, path, true);
    const direct = (response as any).viewmarksbystudent;
    if (Array.isArray(direct)) return direct as PortalMarkRow[];
    const deep = findMarkRowsDeep(response);
    if (deep.length > 0) return deep;
  } catch {
    // fall through to deep scan on raw payload
  }
  const deepRaw = findMarkRowsDeep(rawResponse);
  return deepRaw;
}

export async function fetchMarkRows(
  transport: DashboardTransport,
  args: {
    instituteid: string;
    registrationid: string;
    companyid: string;
    registrationcode?: string;
    enrollment?: string;
  }
): Promise<PortalMarkRow[]> {
  const pdfRows: PortalMarkRow[] = [];
  const jsonRows: PortalMarkRow[] = [];

  // Strategy 1: Fetch the official Event-Wise Marks PDF report from CampusLynx.
  if (transport.getBuffer && args.registrationcode) {
    try {
      const reportPath = `/studentsexamview/printstudent-exammarks/${args.instituteid}/${args.registrationid}/${args.registrationcode}`;
      const pdfBuf = await transport.getBuffer(reportPath);
      if (pdfBuf && pdfBuf.length > 0) {
        const rawText = extractTextFromPdf(pdfBuf);
        const reportRows = parsePdfMarks(rawText);
        if (reportRows.length > 0) {
          pdfRows.push(...reportRows);
        }
      }
    } catch {
      // PDF report fetch failed, fall back to JSON
    }
  }

  // Strategy 2: Base JSON fetch (returns the latest published event only in many cases)
  try {
    const rawResponse = await transport.postEncrypted(EXAM_MARKS_PATH, {
      instituteid: args.instituteid,
      registrationid: args.registrationid,
      companyid: args.companyid,
    });
    const baseRows = extractMarkRowsFromPayload(rawResponse, EXAM_MARKS_PATH);
    if (baseRows.length > 0) {
      jsonRows.push(...baseRows);
    }
  } catch {
    // Tolerant
  }

  // Strategy 3: Multi-event query.
  const knownEventIds = new Set<string>();
  const seenEventKeys = new Set<string>();

  const addEventId = (id: unknown) => {
    const s = String(id ?? "").trim();
    if (s) knownEventIds.add(s);
  };

  const collectEventIdsDeep = (payload: unknown, depth = 0) => {
    if (!payload || depth > 6) return;
    if (typeof payload !== "object") return;
    const key = payload as any;
    if (seenEventKeys.has(key)) return;
    seenEventKeys.add(key);

    if (Array.isArray(payload)) {
      for (const item of payload) collectEventIdsDeep(item, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if ((lk.includes("exameventid") || lk === "eventid" || lk === "id") && (typeof v === "string" || typeof v === "number")) {
        const sv = String(v).trim();
        if (/^[A-Z0-9_-]{5,}$/i.test(sv)) addEventId(sv);
      }
      collectEventIdsDeep(v, depth + 1);
    }
  };

  // 3a: Try the dedicated events endpoint with a few payload variants
  const eventPayloadVariants: Record<string, unknown>[] = [
    { instituteid: args.instituteid, registationid: args.registrationid, registrationid: args.registrationid },
    { instituteid: args.instituteid, registrationid: args.registrationid },
    { instituteid: args.instituteid, registationid: args.registrationid },
    ...(args.registrationcode ? [{ instituteid: args.instituteid, registrationid: args.registrationid, registrationcode: args.registrationcode }] : []),
  ];

  for (let i = 0; i < eventPayloadVariants.length; i++) {
    try {
      const eventRes = (await transport.postEncrypted(GET_EVENTS_PATH, eventPayloadVariants[i])) as any;
      const rawEvents =
        eventRes?.response?.eventcode?.examevent ||
        eventRes?.response?.eventcode ||
        eventRes?.response?.examevent ||
        eventRes?.response?.events ||
        eventRes?.eventcode?.examevent ||
        [];

      if (Array.isArray(rawEvents)) {
        for (const ev of rawEvents) {
          addEventId(ev?.exameventid ?? ev?.eventid ?? ev?.id);
        }
      }
      collectEventIdsDeep(eventRes);
      if (knownEventIds.size > 0) break;
    } catch {
      // Tolerant
    }
  }

  // 3b: Collect distinct exameventid values from any fetched rows so far
  for (const row of jsonRows) {
    addEventId((row as any).exameventid ?? (row as any).examEventId ?? (row as any).eventid);
  }

  // 3c: Discover older/related event IDs by probing sequential suffixes.
  const discoveredIds = new Set<string>();
  // For each distinct prefix (e.g. JEEXV2609A), probe only IDs from 1 up to the
  // highest known sequence number for that prefix, plus 1 ahead. This avoids
  // the old behaviour of always probing up to max(seqNum+1, 8) IDs *per prefix*
  // when multiple month-prefixes exist (e.g. 2609, 2610, 2611), which inflated
  // the total to 24+ calls. Cap: highest seq for that prefix + 1 (min 2).
  const prefixMaxSeq = new Map<string, number>();
  for (const id of [...knownEventIds]) {
    const match = id.match(/^(.*?)(\d{7})$/);
    if (match) {
      const prefix = match[1];
      const seqNum = parseInt(match[2], 10);
      prefixMaxSeq.set(prefix, Math.max(prefixMaxSeq.get(prefix) ?? 0, seqNum));
    }
  }
  for (const [prefix, maxSeq] of prefixMaxSeq) {
    for (let i = 1; i <= maxSeq + 1; i++) {
      const probeId = `${prefix}${String(i).padStart(7, "0")}`;
      if (!knownEventIds.has(probeId)) discoveredIds.add(probeId);
    }
  }
  for (const id of discoveredIds) knownEventIds.add(id);

  // 3d: For each known event ID, query marks specifically for that event.
  if (knownEventIds.size > 0) {
    const ids = [...knownEventIds];
    const perEventPromises = ids.map(async (exameventid) => {
      try {
        const rawRes = await transport.postEncrypted(EXAM_MARKS_PATH, {
          instituteid: args.instituteid,
          registrationid: args.registrationid,
          companyid: args.companyid,
          exameventid,
        });
        return extractMarkRowsFromPayload(rawRes, EXAM_MARKS_PATH);
      } catch {
        return [] as PortalMarkRow[];
      }
    });

    const perEventResults = await Promise.allSettled(perEventPromises);
    for (const res of perEventResults) {
      if (res.status === "fulfilled" && res.value.length > 0) {
        jsonRows.push(...res.value);
      }
    }
  }

  // Build subject description -> subject code lookup from JSON rows so PDF rows
  // (which may lack parenthesized subject codes) normalize to the same code.
  const norm = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const descToCode = new Map<string, string>();
  for (const row of jsonRows) {
    const r = row as Record<string, unknown>;
    const code = norm(r.subjectcode || r.subjectCode || r.code);
    const desc = norm(r.subjectdesc || r.subjectDesc || r.subjectname || r.subjectName || r.subject);
    if (code && desc && code !== desc) {
      descToCode.set(desc, code);
    }
  }

  // Enrich PDF rows with known subject codes before deduplication.
  const enrichedPdfRows = pdfRows.map((row) => {
    const r = row as Record<string, unknown>;
    const code = norm(r.subjectcode);
    const desc = norm(r.subjectdesc);
    const mappedCode = descToCode.get(desc) || descToCode.get(code);
    if (mappedCode && (!code || code === desc)) {
      return { ...row, subjectcode: mappedCode };
    }
    return row;
  });

  // Deduplicate rows, preferring richer JSON rows over PDF rows when both exist.
  // Match by both (subjectcode + event) and (subjectdesc + event) so rows with
  // missing codes in one source still collapse cleanly.
  const seenKeys = new Set<string>();
  const deduped: PortalMarkRow[] = [];
  for (const row of [...jsonRows, ...enrichedPdfRows]) {
    const r = row as Record<string, unknown>;
    const code = norm(r.subjectcode || r.subjectCode || r.code);
    const desc = norm(r.subjectdesc || r.subjectDesc || r.subjectname || r.subjectName || r.subject);
    const ev = norm(r.eventcode || r.eventCode || r.eventdesc || r.eventDesc || r.event || r.exameventid);
    if (!code && !desc && !ev) continue;

    const codeKey = code ? `C:${code}:::${ev}` : "";
    const descKey = desc ? `D:${desc}:::${ev}` : "";
    if ((codeKey && seenKeys.has(codeKey)) || (descKey && seenKeys.has(descKey))) {
      continue;
    }
    if (codeKey) seenKeys.add(codeKey);
    if (descKey) seenKeys.add(descKey);
    deduped.push(row);
  }

  return deduped;
}

function getMarkField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lower = key.toLowerCase();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === lower && row[rk] !== undefined && row[rk] !== null) {
        return row[rk];
      }
    }
  }
  return undefined;
}

/** Group per-event rows into one entry per subject, preserving portal order. */
export function mapDetailedMarks(rows: PortalMarkRow[]): DetailedCourseMarks[] {
  const bySubject = new Map<string, DetailedCourseMarks>();
  for (const rawRow of rows) {
    const row = rawRow as Record<string, unknown>;
    const rawCode = text(getMarkField(row, "subjectcode", "subjectCode", "code"));
    const rawSubject = text(getMarkField(row, "subjectdesc", "subjectDesc", "subjectname", "subjectName", "subject"));
    const key = rawCode || rawSubject;
    if (!key) continue;

    let entry = bySubject.get(key);
    if (!entry) {
      const newEntry: DetailedCourseMarks = {
        subject: rawSubject || rawCode,
        code: rawCode || key,
        components: [],
        total: 0,
      };
      bySubject.set(key, newEntry);
      entry = newEntry;
    }

    const eventName = text(
      getMarkField(
        row,
        "eventcode",
        "eventCode",
        "eventdesc",
        "eventDesc",
        "exameventdesc",
        "exameventcode",
        "examevent",
        "event",
        "eventName",
        "eventname",
        "examEvent",
        "test",
        "testname",
        "assessment"
      )
    ) || "Marks";

    const obtained = num(getMarkField(row, "obtainedmarks", "obtainedMarks", "marks", "obtained"));
    const max = num(getMarkField(row, "fullmarks", "fullMarks", "maxmarks", "maxMarks", "weightage"));

    entry.components.push({
      name: eventName,
      obtained,
      max,
    });
    entry.total = Math.round((entry.total + obtained) * 10) / 10;
  }
  return [...bySubject.values()];
}

/** First ten mark rows, mirroring the WebKiosk parser's `recentMarks[0..10]`. */
export function mapRecentMarks(rows: PortalMarkRow[]): Array<{
  subject: string;
  marks: number;
  code?: string;
  event?: string;
  max?: number;
}> {
  return rows.map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const subject =
      text(getMarkField(row, "subjectdesc", "subjectDesc", "subjectname", "subjectName", "subject")) ||
      text(getMarkField(row, "subjectcode", "subjectCode", "code"));
    const code = text(getMarkField(row, "subjectcode", "subjectCode", "code"));
    const event = text(
      getMarkField(
        row,
        "eventcode",
        "eventCode",
        "eventdesc",
        "eventDesc",
        "exameventdesc",
        "exameventcode",
        "examevent",
        "event",
        "eventName",
        "eventname",
        "examEvent",
        "test",
        "testname",
        "assessment"
      )
    );
    const marks = num(getMarkField(row, "obtainedmarks", "obtainedMarks", "marks", "obtained"));
    const max = num(getMarkField(row, "fullmarks", "fullMarks", "maxmarks", "maxMarks", "weightage"));
    return {
      subject,
      marks,
      code: code || undefined,
      event: event || undefined,
      max: max || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/**
 * The portal has no registered-subjects endpoint that answers for students, so
 * courses are derived from the attendance summary: one row per registered
 * subject. The subject code rides in the record's detailLink ref (the display
 * subject was normalised to the bare name); type is inferred from which
 * components the subject carries. Credits are not exposed anywhere, so they
 * stay 0 -- the courses page hides its credits UI when every course reports 0.
 */
export function coursesFromRecords(records: AttendanceRecord[]): RegisteredCourse[] {
  return records.map((record) => {
    const ref = parseDetailLink(record.detailLink);
    const code = ref?.individualsubjectcode || record.subject;
    // Infer from the ref's component ids, not the percentages: a subject with
    // no classes held yet reports 0% everywhere, which would otherwise read as
    // having no components at all.
    const components = ref?.components ?? {};
    let type: RegisteredCourse["type"] = "Unknown";
    if (components.L || components.T) type = "Theory";
    else if (components.P) {
      type = /project|internship|dissertation|thesis|training|seminar/i.test(record.subject)
        ? "Project"
        : "Practical";
    }
    return { code, title: record.subject, type, credits: 0 };
  });
}

// ---------------------------------------------------------------------------
// Notices (marquee)
// ---------------------------------------------------------------------------

/** The portal has no noticeboard; the login marquee is the only channel. */
export async function fetchNotices(transport: DashboardTransport): Promise<NoticeRecord[]> {
  let response: Record<string, unknown>;
  try {
    response = extractDashboardResponse(
      await transport.getEncrypted(MARQUEE_PATH),
      MARQUEE_PATH,
      /* tolerateNoRecords */ true
    );
  } catch {
    return [];
  }
  const lines = Array.isArray(response.text) ? response.text : [];
  return lines
    .map((line) => text(line))
    .filter(Boolean)
    .map((title) => ({ title, date: "", link: "" }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface CampusLynxDashboardArgs {
  instituteid: string;
  companyid: string;
  username: string;
}

async function fetchMarkRowsWithFallback(
  transport: DashboardTransport,
  args: {
    instituteid: string;
    companyid: string;
    enrollment?: string;
  },
  registrations: PortalRegistration[]
): Promise<PortalMarkRow[]> {
  // Probe all candidate registrations concurrently so a new empty semester
  // does not add a sequential round-trip before the active semester is found.
  const candidates = registrations.slice(0, 3).filter((r) => r.registrationid);
  const results = await Promise.allSettled(
    candidates.map((reg) =>
      fetchMarkRows(transport, {
        instituteid: args.instituteid,
        registrationid: reg.registrationid!,
        companyid: args.companyid,
        registrationcode: reg.registrationcode,
        enrollment: args.enrollment,
      })
    )
  );

  // Return the first fulfilled result with rows, preserving registration order.
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.length > 0) {
      return result.value;
    }
  }
  return [];
}

async function fetchAttendanceWithFallback(
  transport: DashboardTransport,
  instituteid: string,
  stynumber: string,
  registrations: PortalRegistration[]
): Promise<AttendanceRecord[]> {
  // Probe all candidate registrations concurrently so a new empty semester
  // (e.g. 2027EVESEM added before data exists) does not add a full sequential
  // round-trip before the actual active semester is tried.
  const candidates = registrations.slice(0, 3).filter((r) => r.registrationid);
  const results = await Promise.allSettled(
    candidates.map((reg) =>
      fetchAttendanceSummary(transport, {
        instituteid,
        stynumber,
        registrationid: reg.registrationid!,
        registrationcode: reg.registrationcode ?? "",
      })
    )
  );

  // Return the first fulfilled result that has actual records, preserving
  // registration order (newest semester first, as sorted by fetchRegistrationsOrdered).
  let firstError: unknown = null;
  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.length > 0) return result.value;
    } else if (!firstError) {
      firstError = result.reason;
    }
  }
  if (firstError && results.every((r) => r.status === "rejected")) {
    throw firstError;
  }
  return [];
}

/**
 * Build the full dashboard. Profile, registration and attendance are required
 * (their absence means the session or the portal is broken, mirroring how the
 * WebKiosk route treats its main/attendance pages); marks, semesters and
 * notices degrade to empty on any failure, mirroring its tolerant pages.
 */
export async function fetchCampusLynxDashboard(
  transport: DashboardTransport,
  args: CampusLynxDashboardArgs
): Promise<DashboardResponse> {
  // Phase 1: Fetch student profile, ordered registrations, and notices concurrently.
  // None of these three depend on each other, saving multiple sequential roundtrips.
  const [profileSettled, regSettled, noticesSettled] = await Promise.allSettled([
    fetchStudentProfile(transport, args.instituteid),
    fetchRegistrationsOrdered(transport, args.instituteid),
    fetchNotices(transport),
  ]);

  if (profileSettled.status === "rejected") {
    throw profileSettled.reason;
  }
  const profile = profileSettled.value;

  if (regSettled.status === "rejected") {
    throw regSettled.reason;
  }
  const registrations = regSettled.value;
  const registration = registrations[0];
  if (!registration?.registrationid) {
    throw new PortalError("The portal returned no usable registration.", 502);
  }

  const notices = noticesSettled.status === "fulfilled" ? noticesSettled.value : [];

  // Phase 2: Fetch attendance, marks, and semesters concurrently.
  // Semesters has a race timeout because CampusLynx frequently hangs or errors on it.
  const semesterPromise = Promise.race([
    fetchSemesters(transport, {
      instituteid: args.instituteid,
      studentid: profile.studentid,
      name: profile.name,
      enrollmentno: profile.enrollment,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const [attendanceSettled, marksSettled, semestersSettled] = await Promise.allSettled([
    fetchAttendanceWithFallback(transport, args.instituteid, profile.stynumber, registrations),
    fetchMarkRowsWithFallback(
      transport,
      {
        instituteid: args.instituteid,
        companyid: args.companyid,
        enrollment: profile.enrollment || args.username,
      },
      registrations
    ),
    semesterPromise,
  ]);

  if (attendanceSettled.status === "rejected") {
    throw attendanceSettled.reason;
  }
  const attendance: AttendanceRecord[] = attendanceSettled.value;

  const markRows = marksSettled.status === "fulfilled" ? marksSettled.value : [];
  const semesterInfo =
    semestersSettled.status === "fulfilled" ? semestersSettled.value : null;

  const semesters = semesterInfo?.semesters ?? [];
  const current =
    semesters.find((s) => String(s.semester) === semesterInfo?.currentStynumber) ??
    semesters[semesters.length - 1];

  // Courses reuse the attendance records: each record's detailLink ref carries
  // the subject code the display name was normalised away from.
  const performance: PerformanceData = {
    currentSgpa: current?.sgpa ?? 0,
    cgpa: current?.cgpa ?? 0,
    semesters,
    recentMarks: mapRecentMarks(markRows),
  };

  return {
    student: { name: profile.name, enrollment: profile.enrollment, branch: profile.branch },
    attendance,
    performance,
    notices,
    courses: coursesFromRecords(attendance),
    detailedMarks: mapDetailedMarks(markRows),
  };
}
