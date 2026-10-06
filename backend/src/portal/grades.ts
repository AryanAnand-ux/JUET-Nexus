/**
 * CampusLynx Grade Card provider.
 *
 * Confirmed portal endpoints:
 * 1. POST /studentgradecard/getstudentinfo
 *    body: { instituteid }
 *    -> response.studentinfo[0] or response.studentInfo[0]
 *       { branch, program, stynumber, studentid, ... }
 *
 * 2. POST /studentgradecard/getstudentgradecard
 *    body: { instituteid, stynumber, studentid }
 *    -> response.gradecarddata[] or response.studentgradecard[]
 */

import type { GradeCardResponse, GradeSubject } from "../../../shared/types";
import { PortalError, type PortalIdentity } from "./types";

export interface GradeTransport {
  postEncrypted(path: string, payload: Record<string, unknown>): Promise<unknown>;
}

const GET_STUDENT_INFO_PATH = "/studentgradecard/getstudentinfo";
const LOAD_DATA_PATH = "/studentsgpacgpa/loadData";
const GET_GRADECARD_PATH = "/studentgradecard/getstudentgradecard";

function num(val: unknown): number {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function text(val: unknown): string {
  return String(val ?? "").trim();
}

function parseGradeSubject(raw: any): GradeSubject {
  return {
    subjectdesc: text(raw.subjectdesc || raw.subjectname || raw.subject || ""),
    subjectcode: text(raw.subjectcode || raw.subjectid || raw.code || ""),
    grade: text(raw.grade || raw.grades || raw.gradeobtained || ""),
    gradepoint: num(raw.gradepoint ?? raw.grade_point ?? raw.gp),
    credits: num(raw.credits ?? raw.course_credits ?? raw.coursecredits ?? raw.credit),
    status: text(raw.status || raw.resultstatus || raw.result || "Pass"),
  };
}

export async function fetchGradeCard(
  transport: GradeTransport,
  identity: PortalIdentity
): Promise<GradeCardResponse[]> {
  // Step 1: get student info for stynumber & studentid
  let stynumber = "";
  let studentid = "";

  try {
    const infoRes = (await transport.postEncrypted(GET_STUDENT_INFO_PATH, {
      instituteid: identity.instituteid,
    })) as any;

    const infoList =
      infoRes?.response?.studentinfo ||
      infoRes?.response?.studentInfo ||
      infoRes?.response?.studentList;

    if (Array.isArray(infoList) && infoList.length > 0) {
      const info = infoList[0];
      stynumber = text(info.stynumber || info.semester || "");
      studentid = text(info.studentid || info.id || "");
    }
  } catch (err) {
    if (err instanceof PortalError && err.status === 401) {
      throw err;
    }
    // Non-fatal, try fallback below
  }

  // Fallback to loadData if student info wasn't resolved
  if (!studentid || !stynumber) {
    try {
      const loadRes = (await transport.postEncrypted(LOAD_DATA_PATH, {
        instituteid: identity.instituteid,
      })) as any;

      const loadRow = loadRes?.response?.studentInfo?.[0];
      if (loadRow) {
        if (!stynumber) stynumber = text(loadRow.stynumber);
        if (!studentid) studentid = text(loadRow.studentid);
      }
    } catch (err) {
      if (err instanceof PortalError && err.status === 401) {
        throw err;
      }
      // Keep best-effort studentid / stynumber
    }
  }

  if (!studentid) {
    studentid = identity.memberid || text(identity.userid || "");
  }

  // Step 2: fetch grade card data
  const gradeRes = (await transport.postEncrypted(GET_GRADECARD_PATH, {
    instituteid: identity.instituteid,
    stynumber: stynumber || "1",
    studentid,
  })) as any;

  const rawData =
    gradeRes?.response?.gradecarddata ||
    gradeRes?.response?.studentgradecard ||
    gradeRes?.response?.gradecard ||
    gradeRes?.response?.semesterdata ||
    gradeRes?.response;

  if (!rawData) {
    return [];
  }

  const results: GradeCardResponse[] = [];

  if (Array.isArray(rawData)) {
    // Check if rawData items represent semesters (contain a subjects/subjectlist array)
    // or flat subject rows
    const firstItem = rawData[0];
    const isSemesterItem =
      firstItem &&
      (Array.isArray(firstItem.subjects) ||
        Array.isArray(firstItem.subjectlist) ||
        Array.isArray(firstItem.gradelist) ||
        Array.isArray(firstItem.gradecardlist));

    if (isSemesterItem) {
      for (const sem of rawData) {
        if (!sem) continue;
        const subList =
          sem.subjects || sem.subjectlist || sem.gradelist || sem.gradecardlist || [];
        const subjects: GradeSubject[] = Array.isArray(subList)
          ? subList.map(parseGradeSubject)
          : [];

        results.push({
          semester: text(sem.semester || sem.semesterdesc || sem.stynumber || "Semester"),
          sgpa: num(sem.sgpa),
          cgpa: num(sem.cgpa),
          subjects,
        });
      }
    } else {
      // Group flat subject rows by semester / stynumber
      const groups = new Map<string, { sgpa: number; cgpa: number; subjects: GradeSubject[] }>();

      for (const row of rawData) {
        if (!row) continue;
        const semKey = text(row.semester || row.semesterdesc || row.stynumber || "Semester");
        let group = groups.get(semKey);
        if (!group) {
          group = {
            sgpa: num(row.sgpa),
            cgpa: num(row.cgpa),
            subjects: [],
          };
          groups.set(semKey, group);
        } else {
          if (!group.sgpa && row.sgpa) group.sgpa = num(row.sgpa);
          if (!group.cgpa && row.cgpa) group.cgpa = num(row.cgpa);
        }
        group.subjects.push(parseGradeSubject(row));
      }

      for (const [semester, data] of groups.entries()) {
        results.push({
          semester,
          sgpa: data.sgpa,
          cgpa: data.cgpa,
          subjects: data.subjects,
        });
      }
    }
  } else if (typeof rawData === "object" && rawData !== null) {
    // Single semester object
    const subList =
      rawData.subjects || rawData.subjectlist || rawData.gradelist || [];
    const subjects: GradeSubject[] = Array.isArray(subList)
      ? subList.map(parseGradeSubject)
      : [];

    results.push({
      semester: text(rawData.semester || rawData.semesterdesc || rawData.stynumber || "Semester"),
      sgpa: num(rawData.sgpa),
      cgpa: num(rawData.cgpa),
      subjects,
    });
  }

  return results;
}
