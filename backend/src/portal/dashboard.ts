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
  fetchLatestRegistration,
  parseDetailLink,
  type AttendanceContext,
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

export async function fetchMarkRows(
  transport: DashboardTransport,
  args: { instituteid: string; registrationid: string; companyid: string }
): Promise<PortalMarkRow[]> {
  const response = extractDashboardResponse(
    await transport.postEncrypted(EXAM_MARKS_PATH, {
      instituteid: args.instituteid,
      registrationid: args.registrationid,
      companyid: args.companyid,
    }),
    EXAM_MARKS_PATH,
    /* tolerateNoRecords */ true
  );
  return Array.isArray(response.viewmarksbystudent)
    ? (response.viewmarksbystudent as PortalMarkRow[])
    : [];
}

/** Group per-event rows into one entry per subject, preserving portal order. */
export function mapDetailedMarks(rows: PortalMarkRow[]): DetailedCourseMarks[] {
  const bySubject = new Map<string, DetailedCourseMarks>();
  for (const row of rows) {
    const code = text(row.subjectcode);
    if (!code) continue;
    let entry = bySubject.get(code);
    if (!entry) {
      entry = { subject: text(row.subjectdesc) || code, code, components: [], total: 0 };
      bySubject.set(code, entry);
    }
    const obtained = num(row.obtainedmarks);
    entry.components.push({
      name: text(row.eventcode) || "Marks",
      obtained,
      max: num(row.fullmarks),
    });
    entry.total = Math.round((entry.total + obtained) * 10) / 10;
  }
  return [...bySubject.values()];
}

/** First ten mark rows, mirroring the WebKiosk parser's `recentMarks[0..10]`. */
export function mapRecentMarks(rows: PortalMarkRow[]): Array<{ subject: string; marks: number }> {
  return rows.slice(0, 10).map((row) => ({
    subject: text(row.subjectdesc) || text(row.subjectcode),
    marks: num(row.obtainedmarks),
  }));
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
  const profile = await fetchStudentProfile(transport, args.instituteid);

  const registration = await fetchLatestRegistration(transport, args.instituteid);
  if (!registration.registrationid) {
    throw new PortalError("The portal returned no usable registration.", 502);
  }

  const ctx: AttendanceContext = {
    instituteid: args.instituteid,
    stynumber: profile.stynumber,
    registrationid: registration.registrationid,
    registrationcode: registration.registrationcode ?? "",
  };
  const attendance: AttendanceRecord[] = await fetchAttendanceSummary(transport, ctx);

  const [marksSettled, semestersSettled, noticesSettled] = await Promise.allSettled([
    fetchMarkRows(transport, {
      instituteid: args.instituteid,
      registrationid: registration.registrationid,
      companyid: args.companyid,
    }),
    fetchSemesters(transport, {
      instituteid: args.instituteid,
      studentid: profile.studentid,
      name: profile.name,
      enrollmentno: profile.enrollment,
    }),
    fetchNotices(transport),
  ]);

  const markRows = marksSettled.status === "fulfilled" ? marksSettled.value : [];
  const semesterInfo =
    semestersSettled.status === "fulfilled" ? semestersSettled.value : null;
  const notices = noticesSettled.status === "fulfilled" ? noticesSettled.value : [];

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
