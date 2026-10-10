/**
 * CampusLynx attendance provider.
 *
 * Maps the portal's attendance endpoints onto the shared dashboard contract:
 *   - `getstudentattendancedetail`  -> `AttendanceRecord[]` (summary list)
 *   - `getstudentsubjectpersentage` -> `AttendanceDetailsResponse` (day-by-day logs)
 *
 * Shapes below are pinned against live fixtures in `tests/fixtures/`
 * (`18-attendance-detail-1.json`, `20-attendance-percentage-*.json`), not
 * against the bundle. Two portal quirks are load-bearing:
 *   - the combined percentage key is literally `LTpercantage` (sic);
 *   - `cmpidkey` is an array of `{ subjectcomponentid }`, one entry per call.
 *
 * The dashboard's `detailLink` has no CampusLynx equivalent, so summary
 * records carry an opaque `campuslynx://attendance/detail?...` ref instead.
 * The frontend already treats `detailLink` as an opaque string it passes back
 * to `/api/attendance/details`, so no frontend change is needed: the details
 * route recognises the scheme and resolves it here. The ref carries no
 * secrets -- the session token stays server-side in the auth cookie.
 */

import type {
  AttendanceRecord,
  AttendanceDetailItem,
  AttendanceDetailsResponse,
} from "../../../shared/types";
import { PortalError } from "./types";

// ---------------------------------------------------------------------------
// Portal shapes (live-verified)
// ---------------------------------------------------------------------------

/** One entry of `getstudentattendancedetail.response.studentattendancelist`. */
export interface PortalSubjectRow {
  subjectid?: string;
  /** Display string, e.g. `"NANO SCIENCE(PH303)"`. */
  subjectcode?: string;
  /** Bare code, e.g. `"PH303"`. */
  individualsubjectcode?: string;
  /** Combined lecture+tutorial percentage. NB the portal's spelling. */
  LTpercantage?: number;
  Lpercentage?: number;
  Tpercentage?: number;
  Ppercentage?: number;
  Lsubjectcomponentid?: string;
  Tsubjectcomponentid?: string;
  Psubjectcomponentid?: string;
  [key: string]: unknown;
}

/** One entry of `getstudentsubjectpersentage.response.studentAttdsummarylist`. */
export interface PortalLogRow {
  datetime?: string;
  present?: string;
  classtype?: string;
  attendanceby?: string;
  [key: string]: unknown;
}

/** One entry of `getsemestercode-exammarks.response.semestercode`. */
export interface PortalRegistration {
  registrationid?: string;
  registrationcode?: string;
  registrationdesc?: string;
  registrationdatefrom?: number;
  registrationdateto?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Provider inputs
// ---------------------------------------------------------------------------

/** Registration-scoped identifiers every attendance call needs. */
export interface AttendanceContext {
  instituteid: string;
  stynumber: string;
  registrationid: string;
  registrationcode: string;
}

/** Component ids for one subject, keyed by grid column (Lecture/Tutorial/Practical). */
export interface SubjectComponents {
  L?: string;
  T?: string;
  P?: string;
}

/** Everything needed to fetch one subject's day-by-day logs. */
export interface SubjectRef {
  subject: string;
  subjectid: string;
  individualsubjectcode: string;
  components: SubjectComponents;
}

/**
 * Minimal transport surface. Production passes a closure over a `PortalClient`
 * bound to the session identity, e.g.
 * `(path, payload) => client.postEncrypted(path, payload, identity)`.
 */
export interface AttendanceTransport {
  postEncrypted(path: string, payload: Record<string, unknown>): Promise<unknown>;
}

// The portal's two attendance endpoints are named the opposite way round from
// what they return, so they are aliased here by what they actually yield:
//   SUBJECT_LIST_PATH -> one row per registered subject, with its percentages
//   CLASS_LOG_PATH    -> one row per class held for a single subject component
const SUBJECT_LIST_PATH = "/StudentClassAttendance/getstudentattendancedetail";
const CLASS_LOG_PATH = "/StudentClassAttendance/getstudentsubjectpersentage";
const SEMESTERCODES_PATH = "/studentcommonsontroller/getsemestercode-exammarks";

const DETAIL_SCHEME = "campuslynx://attendance/detail?";

const COMPONENT_TYPES: Array<{ key: keyof SubjectComponents; label: string }> = [
  { key: "L", label: "Lecture" },
  { key: "T", label: "Tutorial" },
  { key: "P", label: "Practical" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeFloat(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Parse a portal datetime string such as `"25/09/2026 (11:00:AM - 11:50 AM)"`
 * into a numeric sort key (YYYYMMDD integer).
 *
 * Uses arithmetic on the day/month/year parts rather than `new Date()` so that
 * the result is always in IST wall-clock terms and is never shifted by the
 * Node process timezone or UTC offset arithmetic.
 *
 * Returns 0 for any string that cannot be parsed, so unparseable rows sort to
 * the bottom (oldest) rather than throwing.
 */
export function parseDateForSort(dateStr: string): number {
  // The portal format starts with DD/MM/YYYY; anything after is timing noise.
  const match = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return 0;
  const day   = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year  = parseInt(match[3], 10);
  // Validate ranges to avoid silently accepting malformed strings.
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) return 0;
  // YYYYMMDD: a plain integer comparison gives the correct chronological order.
  return year * 10000 + month * 100 + day;
}

/**
 * The portal's subject labels carry the code in parentheses --
 * `"NANO SCIENCE(PH303)"` -- while the WebKiosk parser (and therefore the UI)
 * works with the bare name. Strip a single trailing parenthesised suffix so
 * both providers emit the same shape.
 */
export function displaySubjectName(raw: string): string {
  const cleaned = String(raw ?? "").trim().replace(/\s+/g, " ");
  return cleaned.replace(/\s*\([^()]*\)\s*$/, "");
}

/**
 * A component id from the summary grid can carry several ids in one
 * comma-separated string; `cmpidkey` wants one entry each. Every id observed in
 * the captured fixtures is a single `JESCP...` value, so this is a no-op in
 * practice -- it exists so a multi-component cell cannot silently be sent as one
 * bogus id.
 */
function componentIdsFor(raw: string): string[] {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Unwrap a portal envelope, throwing a `PortalError` on anything that is not
 * `{ status: { responseStatus: "Success" }, response: {...} }`.
 */
function extractResponse(payload: unknown, path: string): Record<string, unknown> {
  const envelope = payload as any;
  const response = envelope?.response;
  if (
    envelope?.status?.responseStatus === "Success" &&
    response &&
    typeof response === "object"
  ) {
    return response as Record<string, unknown>;
  }

  const is401 =
    envelope?.status === 401 ||
    envelope?.error === "Unauthorized" ||
    (envelope?.status?.errors && /unauthorized|session expired/i.test(String(envelope.status.errors)));

  const errors = envelope?.status?.errors ?? envelope?.error ?? envelope?.message;
  throw new PortalError(
    `The portal refused ${path}${errors ? `: ${String(errors)}` : "."}`,
    is401 ? 401 : 502,
    payload
  );
}

/**
 * Does a Failure envelope mean "you have no such records" rather than
 * "the request was wrong"?
 *
 * The portal answers a component with no classes ever held with
 * `{ responseStatus: "Failure", errors: ["NO Attendance Found"] }` rather than
 * an empty list -- two of thirteen captured subject/components do exactly this
 * (MINOR PROJECT-1 and SUMMER INTERNSHIP, both practical-only). Treating that
 * as an error would 502 the whole subject, so it has to be distinguishable from
 * a genuine failure such as an expired token. Match on the message, not on the
 * status alone, and let anything unrecognised still throw.
 */
function isNoRecordsFailure(payload: unknown): boolean {
  const envelope = payload as any;
  const errors = envelope?.status?.errors ?? envelope?.errors ?? envelope?.status?.message ?? envelope?.message;
  const messages = Array.isArray(errors) ? errors : errors ? [errors] : [];
  return messages.some((message) => /no attendance|no record|not found|records? not available/i.test(String(message)));
}

// ---------------------------------------------------------------------------
// Summary mapping
// ---------------------------------------------------------------------------

/**
 * Map the portal's per-subject percentages onto `AttendanceRecord`.
 *
 * Raw class counts stay zero, exactly as the WebKiosk summary parser leaves
 * them: the portal's summary endpoint reports percentages only, and counts
 * are derived from the day-by-day logs in `fetchAttendanceDetail`.
 */
export function mapAttendanceSummary(
  rows: PortalSubjectRow[],
  ctx: AttendanceContext
): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const subject = displaySubjectName(String(row.subjectcode ?? ""));
    if (!subject) continue;
    const normKey = subject.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(normKey)) continue;
    seen.add(normKey);

    const lecturePercent = round1(safeFloat(row.Lpercentage));
    const tutorialPercent = round1(safeFloat(row.Tpercentage));
    const practicalPercent = round1(safeFloat(row.Ppercentage));
    const overallPercentage = safeFloat(row.LTpercantage) > 0
      ? round1(safeFloat(row.LTpercantage))
      : (practicalPercent > 0 ? practicalPercent : round1(safeFloat(row.LTpercantage)));

    records.push({
      subject,
      percentage: overallPercentage,
      lecturePercent,
      tutorialPercent,
      practicalPercent,
      classesHeld: 0,
      classesAttended: 0,
      safeBunksLeft: 0,
      detailLink: buildDetailLink(ctx, {
        L: row.Lsubjectcomponentid,
        T: row.Tsubjectcomponentid,
        P: row.Psubjectcomponentid,
        subjectid: row.subjectid,
        individualsubjectcode: row.individualsubjectcode,
        percentage: overallPercentage,
      }),
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Detail-link refs (opaque to the frontend)
// ---------------------------------------------------------------------------

/**
 * Encode a subject's log-fetch coordinates as an opaque `campuslynx://` ref.
 * Carries identifiers only -- never the session token.
 */
export function buildDetailLink(
  ctx: AttendanceContext,
  subject: {
    subjectid?: string;
    individualsubjectcode?: string;
    L?: string;
    T?: string;
    P?: string;
    percentage?: number;
  }
): string {
  const params = new URLSearchParams({
    subjectid: subject.subjectid ?? "",
    code: subject.individualsubjectcode ?? "",
    reg: ctx.registrationid,
    regcode: ctx.registrationcode,
    sty: ctx.stynumber,
    inst: ctx.instituteid,
  });
  if (subject.percentage !== undefined) params.set("pct", String(subject.percentage));
  if (subject.L) params.set("l", subject.L);
  if (subject.T) params.set("t", subject.T);
  if (subject.P) params.set("p", subject.P);
  return `${DETAIL_SCHEME}${params.toString()}`;
}

/** Parsed form of a `buildDetailLink` ref; `null` for anything else. */
export interface ParsedDetailRef extends AttendanceContext {
  subjectid: string;
  individualsubjectcode: string;
  components: SubjectComponents;
  officialPercentage?: number;
}

export function parseDetailLink(link: string | null | undefined): ParsedDetailRef | null {
  if (!link || !link.startsWith(DETAIL_SCHEME)) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const q = url.searchParams;
  const subjectid = q.get("subjectid") ?? "";
  const registrationid = q.get("reg") ?? "";
  const registrationcode = q.get("regcode") ?? "";
  const stynumber = q.get("sty") ?? "";
  const instituteid = q.get("inst") ?? "";
  if (!subjectid || !registrationid) return null;
  const components: SubjectComponents = {};
  const l = q.get("l");
  const t = q.get("t");
  const p = q.get("p");
  if (l) components.L = l;
  if (t) components.T = t;
  if (p) components.P = p;
  const pctStr = q.get("pct");
  const officialPercentage = pctStr !== null ? safeFloat(pctStr) : undefined;
  return {
    subjectid,
    individualsubjectcode: q.get("code") ?? "",
    registrationid,
    registrationcode,
    stynumber,
    instituteid,
    components,
    officialPercentage,
  };
}

// ---------------------------------------------------------------------------
// Log mapping
// ---------------------------------------------------------------------------

/**
 * Map one portal log row. Returns `null` for rows without a recognisable
 * Present/Absent status -- mirroring the WebKiosk parser, which skips duty
 * leave and other non-attendance rows rather than guessing.
 */
export function mapAttendanceLog(
  row: PortalLogRow,
  type: string
): AttendanceDetailItem | null {
  const date = String(row.datetime ?? "").trim();
  const rawStatus = String(row.present ?? "").toLowerCase();
  if (!date || !rawStatus) return null;

  const isPresent = rawStatus.includes("present") || rawStatus === "p";
  const isAbsent = rawStatus.includes("absent") || rawStatus === "a";
  if (!isPresent && !isAbsent) return null;

  return {
    date,
    status: isPresent ? "Present" : "Absent",
    type,
  };
}

// ---------------------------------------------------------------------------
// Fetch orchestration
// ---------------------------------------------------------------------------

/**
 * Pick the current registration out of the semester-codes response.
 * Registrations carry a validity window; the one ending latest wins.
 */
export async function fetchLatestRegistration(
  transport: AttendanceTransport,
  instituteid: string
): Promise<PortalRegistration> {
  const response = extractResponse(
    await transport.postEncrypted(SEMESTERCODES_PATH, { instituteid }),
    SEMESTERCODES_PATH
  );
  const list = Array.isArray(response.semestercode)
    ? (response.semestercode as PortalRegistration[])
    : [];
  const withIds = list.filter((r) => r && (r.registrationid || r.registrationcode));
  if (!withIds.length) {
    throw new PortalError(
      `The portal returned no semestercode registrations for ${SEMESTERCODES_PATH}.`,
      502
    );
  }
  return withIds.reduce((best, cur) =>
    safeFloat(cur.registrationdateto) >= safeFloat(best.registrationdateto) ? cur : best
  );
}

/** Fetch the per-subject percentages for one registration and map them. */
export async function fetchAttendanceSummary(
  transport: AttendanceTransport,
  ctx: AttendanceContext
): Promise<AttendanceRecord[]> {
  const response = extractResponse(
    await transport.postEncrypted(SUBJECT_LIST_PATH, {
      instituteid: ctx.instituteid,
      stynumber: ctx.stynumber,
      registrationid: ctx.registrationid,
      registrationcode: ctx.registrationcode,
    }),
    SUBJECT_LIST_PATH
  );
  const rows = Array.isArray(response.studentattendancelist)
    ? (response.studentattendancelist as PortalSubjectRow[])
    : [];
  return mapAttendanceSummary(rows, ctx);
}

/**
 * Fetch day-by-day logs for one subject, one portal call per component the
 * subject actually has (Lecture / Tutorial / Practical columns). Logs merge in
 * L, T, P order with the component as each entry's `type`.
 *
 * The headline counts (`classesHeld` / `classesAttended`) are measured on the
 * same basis as the portal's headline percentage (`LTpercantage`): lectures and
 * tutorials only, dropping practicals whenever the subject has any L/T classes.
 * Practical-only subjects count their practicals. The full merged `logs` array
 * still carries every component for the day-by-day view.
 */
export async function fetchAttendanceDetail(
  transport: AttendanceTransport,
  ctx: AttendanceContext,
  subject: SubjectRef & { officialPercentage?: number }
): Promise<AttendanceDetailsResponse> {
  const logs: AttendanceDetailItem[] = [];

  for (const { key, label } of COMPONENT_TYPES) {
    const componentid = subject.components[key];
    if (!componentid) continue;
    const payload = await transport.postEncrypted(CLASS_LOG_PATH, {
      instituteid: ctx.instituteid,
      subjectid: subject.subjectid,
      registrationid: ctx.registrationid,
      cmpidkey: componentIdsFor(componentid).map((subjectcomponentid) => ({ subjectcomponentid })),
      subjectcode: subject.individualsubjectcode,
      registrationcode: ctx.registrationcode,
    });
    // A component with no classes ever held comes back as a Failure, not an
    // empty list. That is zero attendance, not a broken request.
    const response = isNoRecordsFailure(payload) ? {} : extractResponse(payload, CLASS_LOG_PATH);
    const rows = Array.isArray(response.studentAttdsummarylist)
      ? (response.studentAttdsummarylist as PortalLogRow[])
      : [];
    for (const row of rows) {
      const mapped = mapAttendanceLog(row, label);
      if (mapped) logs.push(mapped);
    }
  }

  // Sort logs latest-first by actual date value.
  // Sorting is done on the merged array (after all component calls) so that
  // lectures, tutorials, and practicals from the same date appear together,
  // ordered newest → oldest.  Within the same date, the original L→T→P
  // component order is preserved (Array.sort is stable in V8/Node ≥ 11).
  logs.sort((a, b) => parseDateForSort(b.date) - parseDateForSort(a.date));

  // Counts must share the basis of the headline percentage (`LTpercantage` is
  // lectures+tutorials only). Counting practicals too made the subject page
  // show the portal's percentage at rest and then jump to a different, lower
  // figure the moment a class was simulated -- attending a class appeared to
  // *drop* attendance. Practicals remain in `logs` for the day-by-day view but
  // are excluded from the counts whenever lectures/tutorials exist; a
  // practical-only subject has no L/T logs, so it counts all of them.
  const lectureOrTutorialLogs = logs.filter(
    (l) => l.type === "Lecture" || l.type === "Tutorial"
  );
  const countedLogs = lectureOrTutorialLogs.length > 0 ? lectureOrTutorialLogs : logs;

  const classesHeld = countedLogs.length;
  const classesAttended = countedLogs.filter((l) => l.status === "Present").length;
  const percentage =
    subject.officialPercentage !== undefined && subject.officialPercentage > 0
      ? subject.officialPercentage
      : classesHeld > 0
        ? round1((classesAttended / classesHeld) * 100)
        : 0;

  return {
    subject: subject.subject,
    classesHeld,
    classesAttended,
    percentage,
    logs,
  };
}
