/**
 * Hermetic tests for the CampusLynx dashboard provider.
 *
 * Fixtures are genuine portal responses captured from a live login
 * (`scripts/capture-live.ts`), loaded from disk -- no network, no portal.
 * The one exception is the semester list: `getallsemesterdata` answered 500
 * with bundle-exact bodies during capture, so that path is exercised with an
 * inline synthetic Success shaped exactly like the bundle's consumer expects
 * (`semesterList[]` with `stynumber/sgpa/cgpa`, read by `getSemDetail`).
 */

import {
  fetchStudentProfile,
  fetchSemesters,
  fetchMarkRows,
  fetchNotices,
  mapDetailedMarks,
  mapRecentMarks,
  mapSemesterRow,
  coursesFromRecords,
  fetchCampusLynxDashboard,
  type DashboardTransport,
} from "../../src/portal/dashboard";
import { mapAttendanceSummary } from "../../src/portal/attendance";

const profileFixture = require("../fixtures/13-sgpa-loadData.json");
const semesterCodesFixture = require("../fixtures/12-semester-codes.json");
const summaryFixture = require("../fixtures/18-attendance-detail-1.json");
const marksFixture = require("../fixtures/19-marks-1.json");
const noticesFixture = require("../fixtures/22-notices.json");

const INSTITUTE = "INID2603J000001";

function stubTransport(
  replies: Record<string, unknown>,
  gets: Record<string, unknown> = {}
): DashboardTransport & {
  postCalls: Array<{ path: string; payload: Record<string, unknown> }>;
  getCalls: string[];
} {
  const postCalls: Array<{ path: string; payload: Record<string, unknown> }> = [];
  const getCalls: string[] = [];
  return {
    postCalls,
    getCalls,
    async postEncrypted(path: string, payload: Record<string, unknown>) {
      postCalls.push({ path, payload });
      if (!(path in replies)) throw new Error(`unexpected POST ${path}`);
      return replies[path];
    },
    async getEncrypted(path: string) {
      getCalls.push(path);
      if (!(path in gets)) throw new Error(`unexpected GET ${path}`);
      return gets[path];
    },
  };
}

const ctx = {
  instituteid: INSTITUTE,
  stynumber: "5",
  registrationid: "JERUM26030000034",
  registrationcode: "2026ODDSEM",
};

describe("fetchStudentProfile", () => {
  test("maps the loadData studentInfo row onto the contract", async () => {
    const transport = stubTransport({ "/studentsgpacgpa/loadData": profileFixture });
    const profile = await fetchStudentProfile(transport, INSTITUTE);

    expect(profile).toMatchObject({
      name: "DEMO STUDENT",
      enrollment: "24BCS001",
      branch: "COMPUTER SCIENCE AND ENGINEERING (AI & ML)",
      branchcode: "CSAIML",
      stynumber: "5",
      studentid: "JUET0000001",
    });
    expect(transport.postCalls[0].payload).toEqual({ instituteid: INSTITUTE });
  });

  test("throws when the portal returns no profile", async () => {
    const transport = stubTransport({
      "/studentsgpacgpa/loadData": { status: { responseStatus: "Success" }, response: {} },
    });
    await expect(fetchStudentProfile(transport, INSTITUTE)).rejects.toThrow(
      /no student profile/i
    );
  });
});

describe("fetchSemesters", () => {
  const args = {
    instituteid: INSTITUTE,
    studentid: "JUET0000001",
    name: "DEMO STUDENT",
    enrollmentno: "24BCS001",
  };

  // Shaped like the bundle's consumer expects: getSemDetail reads
  // e.stynumber / e.sgpa / e.cgpa off each semesterList row.
  const semesterList = {
    status: { responseStatus: "Success" },
    response: {
      semesterList: [
        { stynumber: 4, sgpa: 8.1, cgpa: 8.0, course_credits: 22, earned_credit: 22 },
        { stynumber: 5, sgpa: 8.6, cgpa: 8.2, course_credits: 24, earned_credit: 24 },
      ],
    },
  };
  const master = {
    status: { responseStatus: "Success" },
    response: { studentlov: { currentsemester: 5, studentid: "JUET0000001" } },
  };

  test("checks the master, then lists semesters with the current one", async () => {
    const transport = stubTransport({
      "/studentsgpacgpa/checkIfstudentmasterexist": master,
      "/studentsgpacgpa/getallsemesterdata": semesterList,
    });

    const result = await fetchSemesters(transport, args);

    expect(result?.currentStynumber).toBe("5");
    expect(result?.semesters).toEqual([
      { semester: 4, sgpa: 8.1, cgpa: 8.0, credits: 22, earnedCredits: 22 },
      { semester: 5, sgpa: 8.6, cgpa: 8.2, credits: 24, earnedCredits: 24 },
    ]);
    // Bundle-exact bodies: the master check carries the identity, the list
    // carries stynumber (not currentsem).
    expect(transport.postCalls[0]).toMatchObject({
      path: "/studentsgpacgpa/checkIfstudentmasterexist",
      payload: { instituteid: INSTITUTE, studentid: "JUET0000001", name: "DEMO STUDENT", enrollmentno: "24BCS001" },
    });
    expect(transport.postCalls[1]).toMatchObject({
      path: "/studentsgpacgpa/getallsemesterdata",
      payload: { instituteid: INSTITUTE, studentid: "JUET0000001", stynumber: "5" },
    });
  });

  test("returns null when the master check fails", async () => {
    const transport = stubTransport({
      "/studentsgpacgpa/checkIfstudentmasterexist": {
        status: { responseStatus: "Failure", errors: ["No Result Found"] },
      },
    });
    await expect(fetchSemesters(transport, args)).resolves.toBeNull();
  });

  test("returns null when the semester list 500s, as the live portal did", async () => {
    const transport = stubTransport({
      "/studentsgpacgpa/checkIfstudentmasterexist": master,
      "/studentsgpacgpa/getallsemesterdata": {
        status: 500,
        exception: "SQLGrammarException",
      },
    });
    await expect(fetchSemesters(transport, args)).resolves.toBeNull();
  });

  test("drops rows without a semester number", () => {
    expect(
      mapSemesterRow({ sgpa: 9 } as never)
    ).toMatchObject({ semester: 0, sgpa: 9, cgpa: 0, credits: 0, earnedCredits: 0 });
  });
});

describe("fetchMarkRows", () => {
  test("posts the bundle-exact body and returns the mark rows", async () => {
    const transport = stubTransport({ "/studentsexamview/getstudent-exammarks": marksFixture });
    const rows = await fetchMarkRows(transport, {
      instituteid: INSTITUTE,
      registrationid: "JERUM26030000034",
      companyid: "",
    });

    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ subjectcode: "CS109", eventcode: "TEST-1" });
    expect(transport.postCalls[0].payload).toEqual({
      instituteid: INSTITUTE,
      registrationid: "JERUM26030000034",
      companyid: "",
    });
  });

  test("treats a no-records Failure as an empty list, not an error", async () => {
    const transport = stubTransport({
      "/studentsexamview/getstudent-exammarks": {
        status: { responseStatus: "Failure", errors: ["NO Attendance Found"] },
      },
    });
    await expect(
      fetchMarkRows(transport, { instituteid: INSTITUTE, registrationid: "R", companyid: "" })
    ).resolves.toEqual([]);
  });
});

describe("mapDetailedMarks", () => {
  test("groups per-event rows into one entry per subject", () => {
    const rows = marksFixture.response.viewmarksbystudent;
    const detailed = mapDetailedMarks(rows);

    expect(detailed).toHaveLength(6);
    const networks = detailed.find((d) => d.code === "CS109")!;
    expect(networks.subject).toBe("COMPUTER NETWORKS");
    expect(networks.components).toEqual([{ name: "TEST-1", obtained: 10, max: 15 }]);
    expect(networks.total).toBe(10);
  });

  test("accumulates totals across events for the same subject", () => {
    const detailed = mapDetailedMarks([
      { subjectcode: "CS109", subjectdesc: "COMPUTER NETWORKS", eventcode: "TEST-1", fullmarks: 15, obtainedmarks: 10 },
      { subjectcode: "CS109", subjectdesc: "COMPUTER NETWORKS", eventcode: "TEST-2", fullmarks: 15, obtainedmarks: 12 },
    ]);
    expect(detailed).toHaveLength(1);
    expect(detailed[0].components).toHaveLength(2);
    expect(detailed[0].total).toBe(22);
  });
});

describe("mapRecentMarks", () => {
  test("takes the first ten rows as subject/mark pairs", () => {
    const recent = mapRecentMarks(marksFixture.response.viewmarksbystudent);
    expect(recent).toHaveLength(6);
    expect(recent[0]).toEqual({ subject: "COMPUTER NETWORKS", marks: 10 });
  });
});

describe("coursesFromRecords", () => {
  function records() {
    return mapAttendanceSummary(summaryFixture.response.studentattendancelist, ctx);
  }

  test("recovers the code from the detailLink ref, not the display name", () => {
    const courses = coursesFromRecords(records());
    expect(courses).toHaveLength(11);
    const nano = courses.find((c) => c.code === "PH303")!;
    expect(nano.title).toBe("NANO SCIENCE");
  });

  test("infers Theory / Practical / Project from the components", () => {
    const courses = coursesFromRecords(records());
    const byCode = new Map(courses.map((c) => [c.code, c.type]));
    // Lecture-only and lecture+tutorial rows are theory...
    expect(byCode.get("PH303")).toBe("Theory");
    expect(byCode.get("MA106")).toBe("Theory");
    // ...practical-only labs are practical...
    expect(byCode.get("CS212")).toBe("Practical");
    // ...and practical-only projects/internships are projects.
    expect(byCode.get("CS211")).toBe("Project");
    expect(byCode.get("CS003")).toBe("Project");
  });

  test("credits are 0: the portal exposes none", () => {
    for (const course of coursesFromRecords(records())) {
      expect(course.credits).toBe(0);
    }
  });
});

describe("fetchNotices", () => {
  test("maps the marquee lines onto notice records", async () => {
    const transport = stubTransport({}, { "/token/marqeelist": noticesFixture });
    const notices = await fetchNotices(transport);

    expect(notices).toHaveLength(4);
    expect(notices[0]).toEqual({ title: noticesFixture.response.text[0], date: "", link: "" });
    expect(transport.getCalls).toEqual(["/token/marqeelist"]);
  });

  test("degrades to empty when the marquee fails", async () => {
    const transport = stubTransport({}, {
      "/token/marqeelist": { status: { responseStatus: "Failure", errors: ["x"] } },
    });
    await expect(fetchNotices(transport)).resolves.toEqual([]);
  });
});

describe("fetchCampusLynxDashboard", () => {
  function fullTransport() {
    return stubTransport(
      {
        "/studentsgpacgpa/loadData": profileFixture,
        "/studentcommonsontroller/getsemestercode-exammarks": semesterCodesFixture,
        "/StudentClassAttendance/getstudentattendancedetail": summaryFixture,
        "/studentsexamview/getstudent-exammarks": marksFixture,
        "/studentsgpacgpa/checkIfstudentmasterexist": {
          status: { responseStatus: "Success" },
          response: { studentlov: { currentsemester: 5 } },
        },
        "/studentsgpacgpa/getallsemesterdata": {
          status: { responseStatus: "Success" },
          response: { semesterList: [{ stynumber: 5, sgpa: 8.6, cgpa: 8.2 }] },
        },
      },
      { "/token/marqeelist": noticesFixture }
    );
  }

  test("assembles the full contract from the portal", async () => {
    const dashboard = await fetchCampusLynxDashboard(fullTransport(), {
      instituteid: INSTITUTE,
      companyid: "",
      username: "24BCS001",
    });

    expect(dashboard.student).toMatchObject({ name: "DEMO STUDENT", enrollment: "24BCS001" });
    expect(dashboard.attendance).toHaveLength(11);
    expect(dashboard.attendance[0].subject).toBe("NANO SCIENCE");
    expect(dashboard.performance).toMatchObject({ currentSgpa: 8.6, cgpa: 8.2 });
    expect(dashboard.performance.semesters).toHaveLength(1);
    expect(dashboard.performance.recentMarks).toHaveLength(6);
    expect(dashboard.courses).toHaveLength(11);
    expect(dashboard.detailedMarks).toHaveLength(6);
    expect(dashboard.notices).toHaveLength(4);
  });

  test("degrades marks, semesters and notices independently", async () => {
    const transport = stubTransport(
      {
        "/studentsgpacgpa/loadData": profileFixture,
        "/studentcommonsontroller/getsemestercode-exammarks": semesterCodesFixture,
        "/StudentClassAttendance/getstudentattendancedetail": summaryFixture,
        "/studentsexamview/getstudent-exammarks": {
          status: { responseStatus: "Failure", errors: ["Invalid Registration"] },
        },
        "/studentsgpacgpa/checkIfstudentmasterexist": {
          status: { responseStatus: "Failure", errors: ["No Result Found"] },
        },
      },
      {
        "/token/marqeelist": { status: { responseStatus: "Failure", errors: ["x"] } },
      }
    );

    const dashboard = await fetchCampusLynxDashboard(transport, {
      instituteid: INSTITUTE,
      companyid: "",
      username: "24BCS001",
    });

    // Required sections still served...
    expect(dashboard.student.enrollment).toBe("24BCS001");
    expect(dashboard.attendance).toHaveLength(11);
    // ...tolerant sections empty rather than failing the whole dashboard.
    expect(dashboard.detailedMarks).toEqual([]);
    expect(dashboard.performance).toMatchObject({ currentSgpa: 0, cgpa: 0, semesters: [] });
    expect(dashboard.notices).toEqual([]);
  });

  test("throws when the profile is missing", async () => {
    const transport = stubTransport({
      "/studentsgpacgpa/loadData": { status: { responseStatus: "Success" }, response: {} },
    });
    await expect(
      fetchCampusLynxDashboard(transport, { instituteid: INSTITUTE, companyid: "", username: "x" })
    ).rejects.toThrow(/no student profile/i);
  });
});
