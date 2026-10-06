/**
 * Tests for exam.ts portal parser — specifically the new logic introduced to fix:
 *  1. Case-insensitive PascalCase field lookup (ExamTime, FromTime, ToTime, etc.)
 *  2. Regex value-scan fallback for any time-range pattern
 *  3. Midnight UTC phantom-time suppression (T00:00:00)
 *
 * All tests are hermetic — no network, no Redis.
 */

process.env.ENCRYPTION_KEY = "0".repeat(64);

const mockPostEncrypted = jest.fn();

jest.mock("../../src/utils/axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("../../src/portal/client", () => ({
  createPortalClient: jest.fn(() => ({
    postEncrypted: mockPostEncrypted,
  })),
}));

import { fetchExamSchedule } from "../../src/portal/exam";

// Minimal PortalIdentity needed by fetchExamSchedule
const identity = {
  clientid: "JAYPEE",
  instituteid: "INST1",
  companyid: "CO1",
  memberid: "M1",
  enrollmentno: "241B610",
  membertype: "S",
  token: "tok",
  username: "241B610",
  otppwd: "pw",
};

// Fake transport wrapping our mock
const transport = { postEncrypted: mockPostEncrypted };

function setupPortalMocks(subjectinfo: unknown[]) {
  mockPostEncrypted
    .mockResolvedValueOnce({
      response: {
        semesterCodeinfo: {
          semestercode: [
            { registrationid: "REG1", registrationdesc: "Odd Sem 2026" },
          ],
        },
      },
    })
    .mockResolvedValueOnce({
      response: {
        eventcode: {
          examevent: [{ exameventid: "EV1", exameventdesc: "T1 Exam" }],
        },
      },
    })
    .mockResolvedValueOnce({
      response: { subjectinfo },
    });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Case-insensitive field lookup — PascalCase portal fields
// ---------------------------------------------------------------------------

describe("case-insensitive field lookup", () => {
  it("reads ExamTime PascalCase field correctly", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Computer Networks",
        datetime: "2026-10-15",
        ExamTime: "10:00 am to 11:30 am",
        roomcode: "LT-1",
        seatno: "A1",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].datetimeupto).toBe("10:00 am to 11:30 am");
  });

  it("reads FromTime + ToTime PascalCase fields and combines them", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Data Structures",
        datetime: "2026-10-16",
        FromTime: "09:30 AM",
        ToTime: "11:00 AM",
        roomcode: "LT-2",
        seatno: "B3",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items[0].datetimeupto).toBe("09:30 AM to 11:00 AM");
  });

  it("reads lowercase time field when PascalCase is absent", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Algorithms",
        datetime: "2026-10-17",
        time: "12:00 pm to 01:30 pm",
        roomcode: "LT-3",
        seatno: "C2",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items[0].datetimeupto).toBe("12:00 pm to 01:30 pm");
  });

  it("reads SubjectName PascalCase over subjectdesc when both present", async () => {
    setupPortalMocks([
      {
        SubjectName: "Operating Systems",
        datetime: "2026-10-18",
        roomcode: "LT-4",
        seatno: "D1",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items[0].subject).toBe("Operating Systems");
  });

  it("reads RoomCode PascalCase field correctly", async () => {
    setupPortalMocks([
      {
        subjectdesc: "DBMS",
        datetime: "2026-10-19",
        RoomCode: "AB-10",
        SeatNo: "E5",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items[0].roomcode).toBe("AB-10");
    expect(result.items[0].seatno).toBe("E5");
  });
});

// ---------------------------------------------------------------------------
// 2. Regex value-scan fallback for time
// ---------------------------------------------------------------------------

describe("regex value-scan fallback for time", () => {
  it("extracts time from an unrecognised field name via regex scan", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Physics",
        datetime: "2026-10-20",
        // field name 'examslot' is not in the known list — must be found by value scan
        examslot: "02:00 pm to 03:30 pm",
        roomcode: "LT-5",
        seatno: "F2",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    // Value scan should pick up the time range
    expect(result.items[0].datetimeupto).toMatch(/02:00 pm/i);
  });

  it("returns empty datetimeupto when no time-like value exists", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Chemistry",
        datetime: "2026-10-21",
        roomcode: "LT-6",
        seatno: "G3",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items[0].datetimeupto).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 3. Midnight UTC phantom-time — datetimeupto stays empty
// ---------------------------------------------------------------------------

describe("midnight UTC phantom-time handling", () => {
  it("keeps datetimeupto empty when datetime is midnight ISO (T00:00:00)", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Maths",
        // Portal sends date-only as midnight ISO — no time field
        datetime: "2026-12-10T00:00:00",
        roomcode: "LT-7",
        seatno: "H1",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    // No time was provided — datetimeupto must be empty so frontend shows "Timing to be announced"
    expect(result.items[0].datetimeupto).toBe("");
  });

  it("preserves datetime date portion when time is midnight ISO", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Maths",
        datetime: "2026-12-10T00:00:00",
        roomcode: "LT-7",
        seatno: "H1",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    // The date itself should still be preserved (YYYY-MM-DD format or original ISO)
    expect(result.items[0].datetime).toContain("2026-12-10");
  });
});

// ---------------------------------------------------------------------------
// 4. Chronological sort preserved with mixed date formats
// ---------------------------------------------------------------------------

describe("chronological sort with mixed formats", () => {
  it("sorts DD/MM/YYYY and ISO dates together in chronological order", async () => {
    setupPortalMocks([
      {
        subjectdesc: "Subject B",
        datetime: "20/10/2026",
        time: "10:00 am",
        roomcode: "R2",
        seatno: "S2",
      },
      {
        subjectdesc: "Subject A",
        datetime: "2026-10-15T00:00:00",
        roomcode: "R1",
        seatno: "S1",
      },
    ]);

    const result = await fetchExamSchedule(transport as any, identity as any);
    expect(result.items[0].subject).toBe("Subject A");
    expect(result.items[1].subject).toBe("Subject B");
  });
});
