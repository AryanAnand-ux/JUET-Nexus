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
