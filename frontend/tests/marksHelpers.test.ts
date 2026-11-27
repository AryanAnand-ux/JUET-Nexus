import test from "node:test";
import assert from "node:assert/strict";
import { formatMarkValue, summarizeMarks } from "../lib/marksHelpers.ts";

test("marks summary: uses only marks with an available maximum", () => {
  const summary = summarizeMarks([
    { subject: "A", obtained: 18, max: 25 },
    { subject: "B", obtained: 40, max: 50 },
    { subject: "C", obtained: 12, max: 0 }, // unpublished maximum
    { subject: "D", obtained: 7, max: 10 },
  ]);

  assert.equal(summary.scored, 65);
  assert.equal(summary.maximum, 85);
  assert.equal(summary.counted, 3);
  assert.ok(Math.abs((summary.percentage ?? 0) - (65 / 85) * 100) < 1e-9);
});

test("marks summary: missing marks are not treated as zero", () => {
  const summary = summarizeMarks([
    { subject: "A", obtained: 10, max: 0 },
    { subject: "B", obtained: 5 },
  ]);

  assert.equal(summary.scored, null);
  assert.equal(summary.maximum, null);
  assert.equal(summary.percentage, null);
  assert.equal(summary.counted, 0);
});

test("marks summary: a genuine zero score is still counted", () => {
  const summary = summarizeMarks([{ subject: "A", obtained: 0, max: 20 }]);

  assert.equal(summary.scored, 0);
  assert.equal(summary.percentage, 0);
  assert.equal(summary.counted, 1);
});

test("formatMarkValue: formats compactly and shows unavailable as dash", () => {
  assert.equal(formatMarkValue(undefined), "—");
  assert.equal(formatMarkValue(12), "12");
  assert.equal(formatMarkValue(12.34), "12.3");
});
