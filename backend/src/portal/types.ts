/**
 * Types for the CampusLynx portal API.
 *
 * IMPORTANT: only the captcha shape is confirmed against a real response. The
 * token and data payloads were recovered from the portal's JavaScript bundle,
 * so their field names are best-effort and are typed permissively until each one
 * is verified against a live response (see `UNVERIFIED` notes).
 */

// ---------------------------------------------------------------------------
// Confirmed: captured from a live /token/getcaptcha response
// ---------------------------------------------------------------------------

/** `captcha.image` is a bare base64 PNG (no `data:` prefix). */
export interface PortalCaptcha {
  captcha: string;
  hidden: string;
  image: string;
}

/** Envelope the portal wraps most responses in. */
export interface PortalStatus {
  responseStatus?: string;
  /** The portal reports failures as a list of messages here. */
  errors?: unknown;
  errorMessage?: string;
  message?: string;
  identifier?: string | null;
}

/**
 * Confirmed envelope from a live `/token/getcaptcha` response:
 * `{ status: {...}, response: { captcha: {...} } }`.
 */
export interface PortalCaptchaResponse {
  status?: PortalStatus;
  response?: {
    captcha?: PortalCaptcha;
  };
}

// ---------------------------------------------------------------------------
// Confirmed: exact plaintext the portal encrypts for pretoken-check
// ---------------------------------------------------------------------------

export interface PreTokenCheckPayload {
  username: string;
  usertype: string;
  captcha: PortalCaptcha;
}

// ---------------------------------------------------------------------------
// Bundle-derived: exact property names used by the portal's login service
// ---------------------------------------------------------------------------

/**
 * Step 1 of login (`POST /token/pretoken-check`, served at `#/`) asks only for a
 * user id and the captcha, and answers with a pre-token.
 */
export interface PortalPreToken {
  /** Opaque pre-token; carried into step 2 as `random`. */
  random: string;
  /** Login *mode*: `"PWD"` means the next page wants a password, `"otp"` an OTP. */
  otppwd: string;
  rejectedData?: string;
  username?: string;
}

export interface PortalPreTokenResponse {
  status?: PortalStatus;
  response?: PortalPreToken;
}

/**
 * Step 2 of login (`POST /token/generatewebtoken`, served at `#/pwdlogin`) asks
 * for the password. Note `otppwd` here is the *mode* string from step 1 -- it is
 * not the pre-token; the pre-token travels in `random`.
 */
export interface GenerateWebTokenPayload {
  /** Login mode from the pre-token response, e.g. `"PWD"`. */
  otppwd: string;
  username: string;
  /** The password typed on the `#/pwdlogin` page. */
  passwordotpvalue: string;
  Modulename: string;
  /** The pre-token returned by `pretoken-check`. */
  random: string;
}

export const STUDENT_MODULE = "STUDENTMODULE";

/**
 * `regdata` from a successful `generatewebtoken`.
 *
 * Field assignment in the bundle's success handler reads `regdata.token`,
 * `regdata.clientid`, `regdata.companyid`, `regdata.enrollmentno`,
 * `regdata.membertype`, `regdata.name` and `regdata.institutename`. A live
 * login additionally confirms `regdata.memberid` is a REAL member id
 * (`"JUET2400386"` for the captured account) -- it is not `membertype`, and
 * code must not substitute one for the other. The portal picks `instituteid`
 * out of `institutelist[0].value`, not the top level.
 */
export interface PortalRegData {
  token?: string;
  clientid?: string;
  companyid?: string;
  enrollmentno?: string;
  membertype?: string;
  /** Real member id from a live login (e.g. `"JUET2400386"`). */
  memberid?: string;
  /** Live-verified (e.g. `"USID2609A0001184"`). */
  userid?: string;
  /** Live-verified (e.g. `"N"`); stored encrypted as `bypassValue`. */
  bypass?: string;
  name?: string;
  institutename?: string;
  instituteid?: string;
  /** The portal reads instituteid from the first entry here, not the top level. */
  institutelist?: Array<{ value?: string; label?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface PortalTokenResponse {
  status?: PortalStatus;
  response?: {
    regdata?: PortalRegData;
    clientidforlink?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * The authenticated context required by every data call, reconstructed from the
 * bundle. Serialised verbatim into request bodies.
 */
export interface PortalIdentity {
  clientid: string;
  instituteid: string;
  companyid: string;
  memberid: string;
  enrollmentno: string;
  membertype: string;
  userid?: string;
  role?: string;
  /** Session token, carried in the body as well as the Authorization header. */
  token?: string;
  [key: string]: unknown;
}

/**
 * The authenticated CampusLynx identity kept server-side in the `auth` cookie.
 * Carries the session token plus the identifiers data calls need -- never the
 * password. Populated by the CampusLynx login flow; absent until then.
 */
export interface PortalSessionIdentity extends PortalIdentity {
  /** Portal user id, e.g. the enrollment number. Used for token refresh. */
  username: string;
  /** Login mode from the pre-token response (`"PWD"` / `"otp"`). */
  otppwd: string;
}

/** How a request failure should be surfaced to the caller. */
export class PortalError extends Error {
  readonly status?: number;
  readonly body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "PortalError";
    this.status = status;
    this.body = body;
  }
}
