import test from "node:test";
import assert from "node:assert/strict";
import { fetchExamSchedule } from "../lib/portalExam.ts";

const identity = { clientid: "client", instituteid: "institute" } as any;

test("exam schedule: parses room/seat/time and sorts papers by date", async () => {
  const requests: string[] = [];
  const transport = {
    async postEncrypted(path: string) {
      requests.push(path);
      if (path.includes("getsemestercode")) {
        return {
          response: {
            semesterCodeinfo: {
              semestercode: [
                { registrationid: "reg-1", registrationdesc: "Semester 8" },
              ],
            },
          },
        };
      }
      if (path.includes("getstudentexamevents")) {
        return {
          response: {
            eventcode: {
              examevent: [{ exameventid: "event-1", exameventdesc: "End Semester" }],
            },
          },
        };
      }
      return {
        response: {
          subjectinfo: [
            {
              subjectname: "Physics (PH101)",
              examdate: "20/11/2026",
              examtime: "09:00 AM to 12:00 PM",
              roomcode: "R102: Block A",
              seatno: "S20",
            },
            {
              subjectname: "Mathematics (MA101)",
              examdate: "10/11/2026",
              examtime: "02:00 PM",
              roomcode: "R101",
              seatno: "S12",
            },
          ],
        },
      };
    },
  };

  const schedule = await fetchExamSchedule(transport, identity);

  assert.equal(requests.length, 3);
  assert.deepEqual(
    schedule.items.map((item) => item.datetime),
    ["2026-11-10", "2026-11-20"]
  );
  assert.equal(schedule.items[0].subject, "Mathematics");
  assert.equal(schedule.items[0].datetimeupto, "02:00 PM");
  assert.equal(schedule.items[0].roomcode, "R101");
  assert.equal(schedule.items[0].seatno, "S12");
  assert.equal(schedule.items[1].roomcode, "R102: Block A");
  assert.equal(schedule.items[1].seatno, "S20");
});

test("exam schedule: exposes every ERP exam type and fetches the selected one", async () => {
  const schedulePayloads: Record<string, unknown>[] = [];
  const transport = {
    async postEncrypted(path: string, payload: Record<string, unknown>) {
      if (path.includes("getsemestercode")) {
        return {
          response: {
            semesterCodeinfo: {
              semestercode: [
                { registrationid: "reg-1", registrationdesc: "Semester 8" },
              ],
            },
          },
        };
      }
      if (path.includes("getstudentexamevents")) {
        return {
          response: {
            eventcode: {
              examevent: [
                { exameventid: "evt-test2", exameventdesc: "TEST-2" },
                { exameventid: "evt-test3", exameventdesc: "TEST-3" },
                { exameventid: "evt-makeup", exameventdesc: "Make-up Test" },
              ],
            },
          },
        };
      }

      schedulePayloads.push(payload);
      const eventId = String(payload.exameventid ?? "");
      return {
        response: {
          subjectinfo: [
            {
              subjectname: "Physics (PH101)",
              examdate: "12/12/2026",
              examtime: "10:00 AM",
              roomcode: "A101",
              seatno: "1",
            },
          ],
        },
      };
    },
  };

  const defaultSchedule = await fetchExamSchedule(transport, identity);
  assert.deepEqual(
    defaultSchedule.availableEvents?.map((event) => event.exameventdesc),
    ["TEST-2", "TEST-3", "Make-up Test"]
  );
  assert.equal(defaultSchedule.exameventid, "evt-makeup");
  assert.equal(defaultSchedule.event, "Make-up Test");

  const selected = await fetchExamSchedule(transport, identity, {
    exameventid: "evt-test2",
  });
  assert.equal(selected.exameventid, "evt-test2");
  assert.equal(selected.event, "TEST-2");
  assert.equal(selected.items[0].subject, "Physics");
  assert.equal(schedulePayloads.at(-1)?.exameventid, "evt-test2");
});

test("exam schedule: uses the selected semester's exam events", async () => {
  const eventRequests: Array<Record<string, unknown>> = [];
  const scheduleRequests: Array<Record<string, unknown>> = [];

  const transport = {
    async postEncrypted(path: string, payload: Record<string, unknown>) {
      if (path.includes("getsemestercode")) {
        return {
          response: {
            semesterCodeinfo: {
              semestercode: [
                {
                  registrationid: "reg-8",
                  registrationdesc: "Semester 8",
                  registrationdateto: "2026-12-31",
                },
                {
                  registrationid: "reg-7",
                  registrationdesc: "Semester 7",
                  registrationdateto: "2026-06-30",
                },
              ],
            },
          },
        };
      }
      if (path.includes("getstudentexamevents")) {
        eventRequests.push(payload);
        const events =
          String(payload.registationid) === "reg-7"
            ? [{ exameventid: "evt-s7", exameventdesc: "TEST-2" }]
            : [{ exameventid: "evt-s8", exameventdesc: "Make-up Test" }];
        return { response: { eventcode: { examevent: events } } };
      }

      scheduleRequests.push(payload);
      return {
        response: {
          subjectinfo: [
            {
              subjectname: "Mathematics (MA101)",
              examdate: "15/12/2026",
              examtime: "11:00 AM",
            },
          ],
        },
      };
    },
  };

  const latest = await fetchExamSchedule(transport, identity);
  assert.equal(latest.registrationid, "reg-8");
  assert.equal(latest.event, "Make-up Test");

  const older = await fetchExamSchedule(transport, identity, {
    registrationid: "reg-7",
  });
  assert.equal(older.registrationid, "reg-7");
  assert.equal(older.semester, "Semester 7");
  assert.deepEqual(
    older.availableEvents,
    [{ exameventid: "evt-s7", exameventdesc: "TEST-2" }]
  );
  assert.equal(older.exameventid, "evt-s7");
  assert.equal(older.items[0].subject, "Mathematics");
  assert.equal(String(eventRequests.at(-1)?.registationid), "reg-7");
  assert.equal(String(scheduleRequests.at(-1)?.exameventid), "evt-s7");
});

test("exam schedule: distinguishes no exam types from an empty timetable", async () => {
  const transport = {
    async postEncrypted(path: string) {
      if (path.includes("getsemestercode")) {
        return {
          response: {
            semesterCodeinfo: {
              semestercode: [
                { registrationid: "reg-1", registrationdesc: "Semester 8" },
              ],
            },
          },
        };
      }
      if (path.includes("getstudentexamevents")) {
        // CampusLynx 204 is normalised to an empty object by portalClient.
        return {};
      }
      return { response: { subjectinfo: [] } };
    },
  };

  const noTypes = await fetchExamSchedule(transport, identity);
  assert.equal(noTypes.registrationid, "reg-1");
  assert.deepEqual(noTypes.availableEvents, []);
  assert.deepEqual(noTypes.items, []);
  assert.equal(noTypes.exameventid, "");

  const withTypesButNoSchedule = await fetchExamSchedule(transport, identity, {
    cachedMetadata: {
      registrationid: "reg-1",
      semester: "Semester 8",
      availableEvents: [{ exameventid: "evt-1", exameventdesc: "TEST-2" }],
      ts: Date.now(),
    },
    exameventid: "evt-1",
  });
  assert.equal(withTypesButNoSchedule.exameventid, "evt-1");
  assert.equal(withTypesButNoSchedule.event, "TEST-2");
  assert.deepEqual(withTypesButNoSchedule.items, []);
  assert.equal(withTypesButNoSchedule.availableEvents?.length, 1);
});
