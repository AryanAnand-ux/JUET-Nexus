import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ATTENDANCE_TARGET,
  normalizeAttendanceTarget,
} from "../lib/attendanceTarget.ts";

test("attendance target: default is 75%", () => {
  assert.equal(DEFAULT_ATTENDANCE_TARGET, 75);
});

test("attendance target: normalises and clamps user input", () => {
  assert.equal(normalizeAttendanceTarget("82"), 82);
  assert.equal(normalizeAttendanceTarget("82.6"), 83);
  assert.equal(normalizeAttendanceTarget(0), 1);
  assert.equal(normalizeAttendanceTarget(150), 100);
  assert.equal(normalizeAttendanceTarget(""), null);
  assert.equal(normalizeAttendanceTarget("abc"), null);
  assert.equal(normalizeAttendanceTarget(undefined), null);
});
