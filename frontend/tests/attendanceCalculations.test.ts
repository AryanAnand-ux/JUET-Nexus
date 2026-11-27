import test from "node:test";
import assert from "node:assert/strict";
import { getDisplayableAttendanceComponents } from "../lib/attendanceComponents.ts";
import { buildDetailLink } from "../lib/portalAttendance.ts";
import { calculateBunkStatus } from "../utils/bunkHelpers.ts";

const detailContext = {
  instituteid: "inst",
  stynumber: "sty",
  registrationid: "reg",
  registrationcode: "regcode",
};

function linkFor(components: { L?: string; T?: string; P?: string }): string {
  return buildDetailLink(detailContext, { subjectid: "subject", ...components });
}

test("attendance components: a genuine 0% stays visible for an active component", () => {
  const components = getDisplayableAttendanceComponents({
    lecturePercent: 0,
    tutorialPercent: 82,
    practicalPercent: 0,
    detailLink: linkFor({ L: "l-id", T: "t-id" }),
  });

  assert.deepEqual(components, [
    { key: "L", value: 0 },
    { key: "T", value: 82 },
  ]);
});

test("attendance components: missing/null values are hidden without fabricating zeros", () => {
  const withMetadata = getDisplayableAttendanceComponents({
    lecturePercent: 90,
    tutorialPercent: null as unknown as number,
    practicalPercent: undefined as unknown as number,
    detailLink: linkFor({ L: "l-id" }),
  });
  assert.deepEqual(withMetadata, [{ key: "L", value: 90 }]);

  const withoutMetadata = getDisplayableAttendanceComponents({
    lecturePercent: 90,
    tutorialPercent: 0,
    practicalPercent: 0,
  });
  assert.deepEqual(withoutMetadata, [{ key: "L", value: 90 }]);
});

test("bunk status: zero held classes and 100% targets stay finite and guarded", () => {
  assert.deepEqual(calculateBunkStatus(0, 0, 75), { status: "critical", count: 0 });
  assert.deepEqual(calculateBunkStatus(100, 100, 75), { status: "safe", count: 33 });
  assert.deepEqual(calculateBunkStatus(100, 100, 100), { status: "safe", count: 0 });
  assert.deepEqual(calculateBunkStatus(99, 100, 100), {
    status: "critical",
    count: Infinity,
  });
});

test("bunk status: safe skips and required classes follow the requested target", () => {
  assert.deepEqual(calculateBunkStatus(74, 100, 75), { status: "critical", count: 4 });
  assert.deepEqual(calculateBunkStatus(80, 100, 75), { status: "caution", count: 6 });
  assert.deepEqual(calculateBunkStatus(85, 100, 75), { status: "safe", count: 13 });
});
