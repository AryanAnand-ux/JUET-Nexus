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

export async function fetchExamSchedule(
  transport: ExamTransport,
  identity: PortalIdentity
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

  const latestSemester = semesters[0];
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

  const latestEvent = events[0];
  const exameventid = latestEvent?.exameventid;
  const eventDesc = String(latestEvent?.exameventdesc ?? "").trim();

  if (!exameventid) {
    return { semester: semesterDesc, event: eventDesc, items: [] };
  }

  // Step 3: get student exam schedule
  const scheduleRes = (await transport.postEncrypted(GET_SCHEDULE_PATH, {
    instituteid: identity.instituteid,
    registrationid,
    exameventid,
  })) as any;

  const rawItems = scheduleRes?.response?.subjectinfo;
  const items: ExamScheduleItem[] = [];

  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      if (!raw) continue;
      items.push({
        subject: String(raw.subjectdesc ?? "").trim(),
        datetime: String(raw.datetime ?? "").trim(),
        datetimeupto: String(raw.datetimeupto ?? "").trim(),
        roomcode: String(raw.roomcode ?? "").trim(),
        seatno: String(raw.seatno ?? "").trim(),
      });
    }
  }

  items.sort((a, b) => {
    const timeA = a.datetime ? new Date(a.datetime).getTime() : 0;
    const timeB = b.datetime ? new Date(b.datetime).getTime() : 0;
    return timeA - timeB;
  });

  return {
    semester: semesterDesc,
    event: eventDesc,
    items,
  };
}
