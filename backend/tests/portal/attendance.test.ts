/**
 * Hermetic tests for the CampusLynx attendance provider.
 *
 * Fixtures are genuine portal responses captured from a live login
 * (`scripts/capture-live.ts`), loaded from disk -- no network, no portal.
 * These tests pin the mapping between the portal's shapes and the shared
 * `AttendanceRecord` / `AttendanceDetailsResponse` contract, so a portal-side
 * field rename or a mapper regression fails loudly instead of shipping wrong
 * percentages to the dashboard.
 */

import {
  mapAttendanceSummary,
  mapAttendanceLog,
  buildDetailLink,
  parseDetailLink,
  displaySubjectName,
  fetchLatestRegistration,
  fetchAttendanceSummary,
  fetchAttendanceDetail,
  type AttendanceContext,
  type AttendanceTransport,
} from "../../src/portal/attendance";

const detailFixture = require("../fixtures/18-attendance-detail-1.json");
const logsFixture = require("../fixtures/20-attendance-percentage-L1-250011.json");
const semesterCodesFixture = require("../fixtures/12-semester-codes.json");

const ctx: AttendanceContext = {
  instituteid: "INID2603J000001",
  stynumber: "5",
  registrationid: "JERUM26030000034",
  registrationcode: "2026ODDSEM",
};

function rows() {
  return detailFixture.response.studentattendancelist;
}

/** Stub transport that replays canned portal responses by endpoint path. */
function stubTransport(replies: Record<string, unknown>): AttendanceTransport & {
  calls: Array<{ path: string; payload: Record<string, unknown> }>;
} {
  const calls: Array<{ path: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    async postEncrypted(path: string, payload: Record<string, unknown>) {
      calls.push({ path, payload });
      if (!(path in replies)) throw new Error(`unexpected POST ${path}`);
      return replies[path];
    },
  };
}

describe("mapAttendanceSummary", () => {
  test("maps all 11 subjects from the live fixture", () => {
    const records = mapAttendanceSummary(rows(), ctx);
    expect(records).toHaveLength(11);
    // The dashboard contract keeps raw counts at zero -- WebKiosk never
    // supplied them on the summary page either.
    for (const record of records) {
      expect(record.classesHeld).toBe(0);
      expect(record.classesAttended).toBe(0);
      expect(record.safeBunksLeft).toBe(0);
      expect(typeof record.detailLink).toBe("string");
    }
  });

  test("normalises the portal's NAME(CODE) label to the bare WebKiosk-style name", () => {
    // The WebKiosk parser emits bare names ("Data Structures"), so the portal
    // provider strips the trailing "(CODE)" for the same shape. The code itself
    // still rides in the record's detailLink ref.
    const records = mapAttendanceSummary(rows(), ctx);
    expect(records[0].subject).toBe("NANO SCIENCE");
  });

  test("lecture-only subject: LT combined + lecture, no tutorial/practical", () => {
    const records = mapAttendanceSummary(rows(), ctx);
    const nano = records[0];
    expect(nano.percentage).toBe(88.5);
    expect(nano.lecturePercent).toBe(88.5);
    expect(nano.tutorialPercent).toBe(0);
    expect(nano.practicalPercent).toBe(0);
  });

  test("lecture+tutorial subject keeps each component separate", () => {
    const records = mapAttendanceSummary(rows(), ctx);
    // The display name no longer carries the code; look it up via the ref.
    const prob = records.find(
      (r) => parseDetailLink(r.detailLink!)?.individualsubjectcode === "MA106"
    );
    expect(prob).toBeDefined();
    expect(prob!.percentage).toBe(86.5);
    expect(prob!.lecturePercent).toBe(89.7);
    expect(prob!.tutorialPercent).toBe(75);
    expect(prob!.practicalPercent).toBe(0);
  });

  test("lab subject reports the practical component", () => {
    const records = mapAttendanceSummary(rows(), ctx);
    const lab = records.find(
      (r) => parseDetailLink(r.detailLink!)?.individualsubjectcode === "CS212"
    );
    expect(lab).toBeDefined();
    expect(lab!.percentage).toBe(75);
    expect(lab!.practicalPercent).toBe(75);
    expect(lab!.lecturePercent).toBe(0);
  });

  test("every record carries a parseable detail link", () => {
    const records = mapAttendanceSummary(rows(), ctx);
    for (const record of records) {
      const ref = parseDetailLink(record.detailLink!);
      expect(ref).not.toBeNull();
      expect(ref!.registrationid).toBe(ctx.registrationid);
      expect(ref!.subjectid).toBeTruthy();
    }
  });

  test("detail link round-trips the component ids needed for log fetches", () => {
    const records = mapAttendanceSummary(rows(), ctx);
    const prob = records.find(
      (r) => parseDetailLink(r.detailLink!)?.individualsubjectcode === "MA106"
    )!;
    const ref = parseDetailLink(prob.detailLink!)!;
    expect(ref.components.L).toBe("JESCP06030000001");
    expect(ref.components.T).toBe("JESCP26030000002");
    expect(ref.individualsubjectcode).toBe("MA106");
  });

  test("rejects WebKiosk links and garbage", () => {
    expect(parseDetailLink("ViewDatewiseLecAttendance.jsp?x=1")).toBeNull();
    expect(parseDetailLink("")).toBeNull();
    expect(parseDetailLink("campuslynx://attendance/detail?subjectid=")).toBeNull();
  });
});

describe("mapAttendanceLog", () => {
  test("maps all 26 lecture logs from the live fixture", () => {
    const logs = logsFixture.response.studentAttdsummarylist.map((row: any) =>
      mapAttendanceLog(row, "Lecture")
    );
    expect(logs).toHaveLength(26);
    expect(logs.every(Boolean)).toBe(true);
  });

  test("keeps the portal datetime string verbatim and tags the component", () => {
    const first = mapAttendanceLog(logsFixture.response.studentAttdsummarylist[0], "Lecture")!;
    expect(first.date).toBe("25/09/2026 (11:00:AM - 11:50 AM)");
    expect(first.status).toBe("Present");
    expect(first.type).toBe("Lecture");
  });

  test("maps Absent rows and skips unrecognised statuses", () => {
    expect(mapAttendanceLog({ datetime: "d", present: "Absent" }, "Tutorial")!).toEqual({
      date: "d",
      status: "Absent",
      type: "Tutorial",
    });
    expect(mapAttendanceLog({ datetime: "d", present: "On Duty" }, "Lecture")).toBeNull();
    expect(mapAttendanceLog({ datetime: "", present: "Present" }, "Lecture")).toBeNull();
  });
});

describe("fetchLatestRegistration", () => {
  test("picks the registration out of the semester-codes response", async () => {
    const transport = stubTransport({
      "/studentcommonsontroller/getsemestercode-exammarks": semesterCodesFixture,
    });
    const reg = await fetchLatestRegistration(transport, ctx.instituteid);
    expect(reg.registrationid).toBe("JERUM26030000034");
    expect(reg.registrationcode).toBe("2026ODDSEM");
    expect(transport.calls[0].payload).toEqual({ instituteid: ctx.instituteid });
  });

  test("throws a PortalError when the portal reports Failure", async () => {
    const transport = stubTransport({
      "/studentcommonsontroller/getsemestercode-exammarks": {
        status: { responseStatus: "Failure", errors: ["Inavlid Input Supplied (@BODY)"] },
        response: {},
      },
    });
    await expect(fetchLatestRegistration(transport, ctx.instituteid)).rejects.toThrow(
      /semestercode/i
    );
  });
});

describe("fetchAttendanceSummary", () => {
  test("posts the chained body and returns mapped records", async () => {
    const transport = stubTransport({
      "/StudentClassAttendance/getstudentattendancedetail": detailFixture,
    });
    const records = await fetchAttendanceSummary(transport, ctx);
    expect(records).toHaveLength(11);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toEqual({
      path: "/StudentClassAttendance/getstudentattendancedetail",
      payload: {
        instituteid: ctx.instituteid,
        stynumber: ctx.stynumber,
        registrationid: ctx.registrationid,
        registrationcode: ctx.registrationcode,
      },
    });
  });
});

describe("fetchAttendanceDetail", () => {
  test("fetches each present component and merges the logs", async () => {
    const transport = stubTransport({
      "/StudentClassAttendance/getstudentsubjectpersentage": logsFixture,
    });
    const records = mapAttendanceSummary(rows(), ctx);
    const prob = records.find(
      (r) => parseDetailLink(r.detailLink!)?.individualsubjectcode === "MA106"
    )!;
    const ref = parseDetailLink(prob.detailLink!)!;

    const detail = await fetchAttendanceDetail(transport, ctx, {
      subject: prob.subject,
      subjectid: ref.subjectid,
      individualsubjectcode: ref.individualsubjectcode,
      components: ref.components,
    });

    // MA106 has L + T components: two portal calls.
    expect(transport.calls).toHaveLength(2);
    const bodies = transport.calls.map((c) => c.payload);
    expect(bodies[0]).toMatchObject({
      instituteid: ctx.instituteid,
      subjectid: "250027",
      subjectcode: "MA106",
      registrationcode: ctx.registrationcode,
    });
    // cmpidkey is a single-element array of { subjectcomponentid }.
    expect(bodies[0].cmpidkey).toEqual([{ subjectcomponentid: "JESCP06030000001" }]);
    expect(bodies[1].cmpidkey).toEqual([{ subjectcomponentid: "JESCP26030000002" }]);

    expect(detail.subject).toBe(prob.subject);
    // The stub replays the same 26-log fixture (23 present, 3 absent) for both
    // the L and T components, so the merged detail doubles both counts.
    expect(detail.classesHeld).toBe(52);
    expect(detail.classesAttended).toBe(46);
    expect(detail.percentage).toBe(88.5);
    expect(detail.logs).toHaveLength(52);
    expect(detail.logs[0].type).toBe("Lecture");
    expect(detail.logs[26].type).toBe("Tutorial");
  });

  test("a subject with no components returns empty logs without calling", async () => {
    const transport = stubTransport({});
    const detail = await fetchAttendanceDetail(transport, ctx, {
      subject: "X",
      subjectid: "1",
      individualsubjectcode: "X101",
      components: {},
    });
    expect(transport.calls).toHaveLength(0);
    expect(detail).toEqual({
      subject: "X",
      classesHeld: 0,
      classesAttended: 0,
      percentage: 0,
      logs: [],
    });
  });

  // Two of the thirteen captured subject/components come back as a Failure
  // rather than an empty list. Treating that as an error 502'd the whole
  // subject, so MINOR PROJECT-1 and SUMMER INTERNSHIP could not be opened.
  test("a component with no attendance yet reports zero instead of failing", async () => {
    const noAttendance = require("../fixtures/20-attendance-percentage-P1-250034.json");
    expect(noAttendance.status.responseStatus).toBe("Failure");

    const transport = stubTransport({
      "/StudentClassAttendance/getstudentsubjectpersentage": noAttendance,
    });
    const detail = await fetchAttendanceDetail(transport, ctx, {
      subject: "MINOR PROJECT-1",
      subjectid: "250034",
      individualsubjectcode: "CS211",
      components: { P: "JESCP06030000003" },
    });

    expect(detail.classesHeld).toBe(0);
    expect(detail.classesAttended).toBe(0);
    expect(detail.percentage).toBe(0);
    expect(detail.logs).toEqual([]);
  });

  test("a Failure that is not 'no records' still surfaces as an error", async () => {
    const transport = stubTransport({
      "/StudentClassAttendance/getstudentsubjectpersentage": {
        status: { responseStatus: "Failure", errors: ["Invalid Registration"] },
      },
    });

    await expect(
      fetchAttendanceDetail(transport, ctx, {
        subject: "X",
        subjectid: "1",
        individualsubjectcode: "X101",
        components: { L: "JESCP06030000001" },
      })
    ).rejects.toThrow(/Invalid Registration/);
  });

  test("splits a comma-separated component id into one cmpidkey entry each", async () => {
    const transport = stubTransport({
      "/StudentClassAttendance/getstudentsubjectpersentage": {
        status: { responseStatus: "Success" },
        response: { studentAttdsummarylist: [] },
      },
    });

    await fetchAttendanceDetail(transport, ctx, {
      subject: "X",
      subjectid: "1",
      individualsubjectcode: "X101",
      components: { L: "JESCP06030000001,JESCP06030000009" },
    });

    expect(transport.calls[0].payload.cmpidkey).toEqual([
      { subjectcomponentid: "JESCP06030000001" },
      { subjectcomponentid: "JESCP06030000009" },
    ]);
  });
});

describe("displaySubjectName", () => {
  test("strips one trailing parenthesised code", () => {
    expect(displaySubjectName("NANO SCIENCE(PH303)")).toBe("NANO SCIENCE");
    expect(displaySubjectName("NANO SCIENCE (PH303)")).toBe("NANO SCIENCE");
  });

  test("leaves bare names and inner parentheses alone", () => {
    expect(displaySubjectName("Data Structures")).toBe("Data Structures");
    expect(displaySubjectName("LAB (A) WORK")).toBe("LAB (A) WORK");
    expect(displaySubjectName("")).toBe("");
  });
});

describe("buildDetailLink", () => {  test("builds links the frontend can pass back untouched", () => {
    const link = buildDetailLink(ctx, {
      subjectid: "250011",
      individualsubjectcode: "PH303",
      L: "JESCP06030000001",
    });
    // Opaque to the frontend: no spaces, URL-safe, carries no secrets.
    expect(link.startsWith("campuslynx://attendance/detail?")).toBe(true);
    expect(link).not.toContain(" ");
    expect(link.toLowerCase()).not.toContain("bearer");
    expect(parseDetailLink(link)).toMatchObject({
      subjectid: "250011",
      individualsubjectcode: "PH303",
      registrationid: ctx.registrationid,
    });
  });
});
