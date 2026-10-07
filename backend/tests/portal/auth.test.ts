/**
 * Hermetic tests for the CampusLynx login orchestration.
 *
 * No network: the transport is a jest mock. These pin the two-step payload
 * shapes the portal's bundle dictates -- `otppwd` is the login *mode*, not the
 * pre-token, and `passwordotpvalue` is the raw password. Getting either wrong
 * yields HTTP 200 + an empty body, indistinguishable from a bad password.
 */

import {
  buildIdentity,
  verifyUser,
  issueSession,
  type PortalAuthTransport,
} from "../../src/portal/auth";
import { PortalError, STUDENT_MODULE } from "../../src/portal/types";
import type { PortalCaptcha, PortalPreToken } from "../../src/portal/types";

const CAPTCHA: PortalCaptcha = {
  captcha: "abc12",
  hidden: "HID==",
  image: "iVBORw0KGgoAAA",
};

const PRE_TOKEN: PortalPreToken = {
  random: "PRE-TOKEN-123",
  otppwd: "PWD",
  rejectedData: "",
  username: "24BCS001",
};

function transport(overrides: Partial<PortalAuthTransport> = {}): PortalAuthTransport {
  return {
    preTokenCheck: jest.fn().mockResolvedValue(PRE_TOKEN),
    generateWebToken: jest.fn().mockResolvedValue({
      status: { responseStatus: "Success" },
      response: {
        regdata: {
          token: "jwt.payload.sig",
          clientid: "JAYPEE",
          enrollmentno: "24BCS001",
          membertype: "S",
          memberid: "JUET0000001",
          userid: "USID0000A0000001",
          bypass: "N",
          name: "TEST STUDENT",
          institutelist: [
            { label: "JUET", value: "INID2603J000001" },
            { label: "Other", value: "OTHER" },
          ],
        },
      },
    }),
    ...overrides,
  };
}

describe("verifyUser", () => {
  test("sends the whole captcha object and the enrollment as username", async () => {
    const t = transport();
    const result = await verifyUser(t, "24BCS001", CAPTCHA);

    expect(t.preTokenCheck).toHaveBeenCalledTimes(1);
    expect(t.preTokenCheck).toHaveBeenCalledWith({
      username: "24BCS001",
      usertype: "S",
      captcha: CAPTCHA,
    });
    expect(result).toBe(PRE_TOKEN);
  });

  test("honours an explicit parent usertype", async () => {
    const t = transport();
    await verifyUser(t, "24BCS001", CAPTCHA, "P");
    expect(t.preTokenCheck).toHaveBeenCalledWith(
      expect.objectContaining({ usertype: "P" })
    );
  });

  test("rejects a pre-token response without a random", async () => {
    const t = transport({
      preTokenCheck: jest.fn().mockResolvedValue({ otppwd: "PWD" } as any),
    });
    await expect(verifyUser(t, "24BCS001", CAPTCHA)).rejects.toThrow(PortalError);
  });

  test("propagates a captcha rejection", async () => {
    const t = transport({
      preTokenCheck: jest.fn().mockRejectedValue(new PortalError("bad captcha", 401)),
    });
    await expect(verifyUser(t, "24BCS001", CAPTCHA)).rejects.toMatchObject({ status: 401 });
  });
});

describe("issueSession", () => {
  test("sends the exact step-2 payload with the raw password", async () => {
    const t = transport();
    await issueSession(t, {
      enrollment: "24BCS001",
      password: "s3cret",
      preToken: PRE_TOKEN,
    });

    expect(t.generateWebToken).toHaveBeenCalledWith({
      otppwd: "PWD",
      username: "24BCS001",
      passwordotpvalue: "s3cret",
      Modulename: STUDENT_MODULE,
      random: "PRE-TOKEN-123",
    });
  });

  test("builds a password-free identity", async () => {
    const identity = await issueSession(transport(), {
      enrollment: "24BCS001",
      password: "s3cret",
      preToken: PRE_TOKEN,
    });

    expect(identity).toMatchObject({
      token: "jwt.payload.sig",
      clientid: "JAYPEE",
      instituteid: "INID2603J000001",
      memberid: "JUET0000001",
      enrollmentno: "24BCS001",
      membertype: "S",
      username: "24BCS001",
      otppwd: "PWD",
    });
    // The password must never be carried on the identity.
    expect(JSON.stringify(identity)).not.toContain("s3cret");
  });

  test("rejects a response with no regdata", async () => {
    const t = transport({
      generateWebToken: jest.fn().mockResolvedValue({ status: { responseStatus: "Failure" } }),
    });
    await expect(
      issueSession(t, { enrollment: "24BCS001", password: "x", preToken: PRE_TOKEN })
    ).rejects.toThrow(PortalError);
  });
});

describe("buildIdentity", () => {
  test("prefers institutelist[0].value over a top-level instituteid", () => {
    const identity = buildIdentity(
      {
        token: "t",
        instituteid: "TOP-LEVEL",
        institutelist: [{ value: "FROM-LIST" }],
        memberid: "JUET0000001",
        membertype: "S",
      },
      { username: "24BCS001", otppwd: "PWD" }
    );
    expect(identity.instituteid).toBe("FROM-LIST");
  });

  test("keeps memberid as-is and never substitutes membertype", () => {
    const identity = buildIdentity(
      { token: "t", membertype: "S", memberid: "JUET0000001" },
      { username: "24BCS001", otppwd: "PWD" }
    );
    expect(identity.memberid).toBe("JUET0000001");
    expect(identity.membertype).toBe("S");
  });

  test("does not fabricate a memberid when the portal omits one", () => {
    const identity = buildIdentity(
      { token: "t", membertype: "S" },
      { username: "24BCS001", otppwd: "PWD" }
    );
    expect(identity.memberid).toBe("");
    expect(identity.memberid).not.toBe("S");
  });

  test("throws when the token is missing", () => {
    expect(() => buildIdentity({ membertype: "S" }, { username: "x", otppwd: "PWD" })).toThrow(
      PortalError
    );
  });
});
