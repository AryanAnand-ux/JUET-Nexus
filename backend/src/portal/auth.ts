/**
 * CampusLynx login orchestration.
 *
 * The portal splits login across two screens and therefore two endpoints:
 *
 *   step 1  `#/`          enrollment + captcha  -> /token/pretoken-check
 *   step 2  `#/pwdlogin`  password              -> /token/generatewebtoken
 *
 * This module keeps that sequence in one place so the route handlers stay thin
 * and the payload shapes stay pinned by tests. Two bundle facts are load-bearing
 * and easy to get wrong (both produce HTTP 200 + an empty body, which is also
 * what a wrong password looks like):
 *   - `otppwd` in step 2 is the login *mode* from step 1 (e.g. `"PWD"`), not the
 *     pre-token; the pre-token travels in `random`.
 *   - `passwordotpvalue` is the raw password. There is no client-side hash.
 */

import { PortalError, STUDENT_MODULE } from "./types";
import type {
  PortalCaptcha,
  PortalPreToken,
  PortalRegData,
  PortalSessionIdentity,
  PortalTokenResponse,
} from "./types";

/**
 * The subset of {@link PortalClient} the login flow needs. Declared structurally
 * so tests can pass a plain mock.
 */
export interface PortalAuthTransport {
  preTokenCheck(payload: {
    username: string;
    usertype: string;
    captcha: PortalCaptcha;
  }): Promise<PortalPreToken>;
  generateWebToken(payload: {
    otppwd: string;
    username: string;
    passwordotpvalue: string;
    Modulename: string;
    random: string;
  }): Promise<PortalTokenResponse>;
}

export interface IssueSessionParams {
  enrollment: string;
  password: string;
  preToken: PortalPreToken;
}

/**
 * Step 1: submit the enrollment and the captcha answer.
 *
 * The portal echoes the whole `captcha` object it issued (including `hidden`),
 * so the caller must pass it through unchanged -- only the `captcha` text is the
 * user's answer.
 *
 * @returns the pre-token, whose `random` is carried into step 2
 */
export async function verifyUser(
  transport: PortalAuthTransport,
  enrollment: string,
  captcha: PortalCaptcha,
  usertype: "S" | "P" = "S"
): Promise<PortalPreToken> {
  const preToken = await transport.preTokenCheck({
    username: enrollment,
    usertype,
    captcha,
  });

  if (!preToken || !preToken.random) {
    throw new PortalError(
      "The portal accepted the request but returned no login pre-token.",
      502
    );
  }
  return preToken;
}

/**
 * Step 2: exchange the pre-token plus password for an authenticated session.
 *
 * @returns the password-free session identity to be stored in the `auth` cookie
 */
export async function issueSession(
  transport: PortalAuthTransport,
  { enrollment, password, preToken }: IssueSessionParams
): Promise<PortalSessionIdentity> {
  const response = await transport.generateWebToken({
    otppwd: preToken.otppwd,
    username: enrollment,
    passwordotpvalue: password,
    Modulename: STUDENT_MODULE,
    random: preToken.random,
  });

  const regdata = response?.response?.regdata;
  if (!regdata || !regdata.token) {
    throw new PortalError("The portal did not return a session token.", 401);
  }

  return buildIdentity(regdata, { username: enrollment, otppwd: preToken.otppwd });
}

/**
 * Map `regdata` onto the server-side session identity.
 *
 * Deliberately does NOT guess at missing identifiers: an absent `memberid`
 * stays empty rather than falling back to `membertype`, which the portal happens
 * to populate differently. A wrong member id silently scopes data calls to the
 * wrong student.
 */
export function buildIdentity(
  regdata: PortalRegData,
  context: { username: string; otppwd: string }
): PortalSessionIdentity {
  const token = String(regdata.token || "");
  if (!token) {
    throw new PortalError("The portal login response carried no session token.", 502);
  }

  const instituteList = Array.isArray(regdata.institutelist) ? regdata.institutelist : [];
  const firstInstitute = (instituteList[0] || {}) as Record<string, unknown>;
  const instituteid = String(firstInstitute.value || regdata.instituteid || "");

  return {
    clientid: String(regdata.clientid || ""),
    instituteid,
    companyid: String(regdata.companyid || ""),
    memberid: String(regdata.memberid || ""),
    enrollmentno: String(regdata.enrollmentno || context.username),
    membertype: String(regdata.membertype || "S"),
    userid: regdata.userid ? String(regdata.userid) : undefined,
    role: "Student",
    token,
    username: context.username,
    otppwd: context.otppwd,
    name: regdata.name ? String(regdata.name) : undefined,
    bypass: regdata.bypass ? String(regdata.bypass) : undefined,
    institutename: regdata.institutename ? String(regdata.institutename) : undefined,
    // Capture token issue timestamp for refresh calls — try all known field name variants.
    // The portal uses this in /token/refreshTokenRequest. Without it, refresh sends
    // the current time which the portal may reject, causing silent refresh failures.
    tokendate: String(
      regdata.tokendate || regdata.TokenDate || regdata.tokenDate ||
      regdata.token_date || regdata.issuedate || regdata.issuedAt || ""
    ) || undefined,
  } as PortalSessionIdentity;
}
