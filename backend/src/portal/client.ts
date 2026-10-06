/**
 * HTTP client for the CampusLynx portal API.
 *
 * Transport rules mirrored from the portal's own Angular bundle:
 *   - Request bodies are AES-encrypted (see ./crypto).
 *   - Every request carries `Content-Type: application/json` plus an encrypted
 *     `LocalName` nonce, including fully anonymous ones. See {@link
 *     ANONYMOUS_HEADERS} for the evidence -- this is easy to get wrong.
 *   - Authenticated calls additionally carry `Authorization: Bearer <token>`.
 *   - Failures are frequently HTTP 200 with an *empty* body, so every response
 *     is length-checked rather than trusted by status code.
 */

import axios, { AxiosInstance } from "axios";
import https from "https";
import { encryptBody, createLocalName, deriveKey, isTokenExpired } from "./crypto";
import {
  PortalCaptcha,
  PortalCaptchaResponse,
  PortalError,
  PortalIdentity,
  PortalPreToken,
  PortalPreTokenResponse,
  PortalTokenResponse,
  PreTokenCheckPayload,
  GenerateWebTokenPayload,
} from "./types";

const DEFAULT_BASE_URL =
  process.env.PORTAL_BASE_URL ||
  "https://studentportal.juet.ac.in/StudentPortalAPI";

const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "60000", 10);

/**
 * A single persistent socket is used for the whole client. `getcaptcha` and
 * `pretoken-check` are answered by the same request the browser makes over one
 * connection, so keeping affinity avoids being load-balanced to a portal node
 * that has never seen the captcha.
 */
function createAgent(): https.Agent {
  return new https.Agent({
    keepAlive: true,
    maxSockets: 1,
    keepAliveMsecs: 30000,
    rejectUnauthorized: false,
  });
}

/**
 * Headers the portal's HTTP interceptor attaches to EVERY request, including
 * fully anonymous ones.
 *
 * The login page sets `localStorage.Token = ""` and the interceptor's guard is
 * `null !== Token` -- true for an empty string -- so the browser takes the
 * "authenticated" branch and sends a `LocalName` nonce before it has a token.
 *
 * Both parts are load-bearing, established by replaying variants against the
 * live portal:
 *   application/json + LocalName -> success (no captcha error)
 *   application/json, no LocalName -> HTTP 200 with an EMPTY body
 *   text/plain + LocalName        -> HTTP 200 with an EMPTY body
 *
 * An empty body is the portal's failure signal and looks identical to a wrong
 * captcha, which makes this easy to misdiagnose. `Authorization` is optional.
 * Do not drop `LocalName` -- it is not decoration.
 */
/**
 * @param date Pass the same instant used to derive the request body's key.
 * Body and nonce must agree: both are encrypted under a key derived from the
 * portal's current date, so a pair built a millisecond either side of local
 * midnight in the portal's timezone would be encrypted under two different keys
 * and the portal would answer 200 with an empty body.
 */
function ANONYMOUS_HEADERS(date?: Date): Record<string, string> {
  return {
    "Content-Type": "application/json",
    LocalName: createLocalName(date),
  };
}

function parseJson(text: string): unknown {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export interface PortalClientOptions {
  baseUrl?: string;
  timeout?: number;
}

export class PortalClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(options: PortalClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeout || REQUEST_TIMEOUT,
      responseType: "text",
      // We inspect bodies ourselves; 200-with-empty-body is a failure signal.
      validateStatus: () => true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      httpAgent: createAgent(),
      httpsAgent: createAgent(),
    });
  }

  /** Release the pooled socket (used by tests and on logout). */
  destroy(): void {
    this.http.defaults.httpAgent?.destroy();
    this.http.defaults.httpsAgent?.destroy();
  }

  /**
   * POST an AES-encrypted body.
   *
   * The ciphertext must reach the server **unquoted**. axios normally
   * JSON-serialises any value sent under `Content-Type: application/json`, so a
   * bare string body becomes `"<ciphertext>"`. The portal decrypts that and
   * gets a JSON *string* rather than a JSON object, which surfaces two ways:
   *   - HTTP 400 HttpMessageNotReadableException ("Can not instantiate value of
   *     type LinkedHashMap from String value")
   *   - HTTP 200 with `Inavlid Input Supplied (@BODY)` [sic]
   * `transformRequest` below suppresses the serialisation so the body stays raw.
   * Do not remove it: the header may say application/json, but the payload is
   * ciphertext, not JSON.
   */
  private async send(
    path: string,
    body: string | undefined,
    headers: Record<string, string>
  ): Promise<string> {
    try {
      const response = await this.http.post<string>(path, body ?? "", {
        headers,
        transformRequest: [(data: unknown) => data],
      });
      return typeof response.data === "string" ? response.data : "";
    } catch (error: any) {
      throw new PortalError(
        `CampusLynx request to ${path} failed: ${error?.message || "network error"}`,
        error?.response?.status,
        error?.response?.data
      );
    }
  }

  // -------------------------------------------------------------------------
  // Anonymous endpoints
  // -------------------------------------------------------------------------

  /**
   * Fetch a fresh captcha. `captcha.captcha` comes back empty: the portal
   * expects the user to type what they see in `captcha.image`, and the answer
   * must be paired with this response's `captcha.hidden`.
   */
  async getCaptcha(): Promise<PortalCaptcha> {
    let text: string;
    try {
      const response = await this.http.get<string>("/token/getcaptcha", {
        headers: { ...ANONYMOUS_HEADERS(new Date()), Accept: "application/json" },
      });
      text = typeof response.data === "string" ? response.data : "";
    } catch (error: any) {
      throw new PortalError(
        `Could not reach the CampusLynx captcha service: ${error?.message || "network error"}`,
        error?.response?.status
      );
    }

    // The envelope is { status, response: { captcha } } -- `captcha` is nested
    // one level deeper than the status block suggests.
    const parsed = parseJson(text) as PortalCaptchaResponse | undefined;
    const captcha = parsed?.response?.captcha;
    if (!captcha?.hidden || !captcha?.image) {
      throw new PortalError("The CampusLynx captcha service returned no image", 502);
    }
    return captcha;
  }

  /**
   * Submit the captcha answer (step 1 of login, served at `#/`).
   *
   * Sends `application/json` AND the `LocalName` nonce -- see
   * {@link ANONYMOUS_HEADERS} for why both are required and what happens if
   * either is dropped. `Authorization` is omitted: the portal does not need it
   * here, and there is no token yet.
   *
   * @returns the pre-token on success
   */
  async preTokenCheck(payload: PreTokenCheckPayload): Promise<PortalPreToken> {
    const now = new Date();
    const text = await this.send(
      "/token/pretoken-check",
      encryptBody(payload, deriveKey(now)),
      ANONYMOUS_HEADERS(now)
    );

    if (!text || !text.trim()) {
      throw new PortalError(
        "The portal rejected the captcha. It refreshes often, so request a new one and try again.",
        401
      );
    }

    const parsed = parseJson(text) as PortalPreTokenResponse | undefined;
    const response = parsed?.response;
    if (parsed?.status?.responseStatus !== "Success" || !response?.random) {
      throw new PortalError(
        parsed?.status?.errors ? String(parsed.status.errors) : "The portal rejected the captcha.",
        401
      );
    }
    return response;
  }

  /**
   * Exchange the pre-token for a session token (step 2, served at `#/pwdlogin`).
   *
   * `otppwd` is the literal login *mode* taken from the pre-token response -- it
   * is `"PWD"` for a password step and `"otp"` when the portal wants an emailed
   * one-time password. It is NOT the pre-token itself.
   */
  async generateWebToken(payload: GenerateWebTokenPayload): Promise<PortalTokenResponse> {
    const now = new Date();
    const text = await this.send(
      "/token/generatewebtoken",
      encryptBody(payload, deriveKey(now)),
      ANONYMOUS_HEADERS(now)
    );

    if (!text || !text.trim()) {
      // The portal signals failure with 200 + a zero-byte body, which is
      // indistinguishable from a rejected password. Do not claim the password
      // was wrong: a malformed request lands here too (see ANONYMOUS_HEADERS).
      throw new PortalError(
        "The CampusLynx portal rejected the login without a response body. This is the " +
          "portal's generic failure signal -- it covers both a wrong password and a " +
          "rejected request, so the password may well be correct.",
        401
      );
    }

    const parsed = parseJson(text) as PortalTokenResponse | undefined;
    if (!parsed || typeof parsed !== "object") {
      throw new PortalError("The portal returned an unreadable login response.", 502);
    }
    if (parsed.status?.responseStatus !== "Success" || !parsed.response?.regdata?.token) {
      throw new PortalError(
        parsed.status?.errors ? String(parsed.status.errors) : "The portal refused to issue a token.",
        401
      );
    }
    return parsed;
  }

  // -------------------------------------------------------------------------
  // Authenticated endpoints
  // -------------------------------------------------------------------------

  /**
   * POST an encrypted payload with the browser's authenticated headers.
   * `LocalName` is regenerated per request, exactly as the interceptor does.
   */
  async postEncrypted(
    path: string,
    payload: Record<string, unknown>,
    identity: PortalIdentity
  ): Promise<unknown> {
    const token = identity.token;
    if (!token) {
      throw new PortalError("Missing CampusLynx session token.", 401);
    }

    const now = new Date();
    const text = await this.send(path, encryptBody(payload, deriveKey(now)), {
      ...ANONYMOUS_HEADERS(now),
      Authorization: `Bearer ${token}`,
    });

    if (!text || !text.trim()) {
      // On an AUTHENTICATED call the portal answers an expired/invalid JWT with
      // HTTP 200 and an EMPTY body -- the same shape it returns for a wrong
      // captcha, which is why the two are indistinguishable by inspection.
      // Because this path already carries a Bearer token, an empty body means
      // the session is dead: report 401 so callers surface "log in again"
      // rather than a generic fetch failure. Token refresh is not implemented.
      throw new PortalError(`The portal session expired for ${path}.`, 401);
    }
    return parseJson(text);
  }

  /**
   * GET with the authenticated headers. A few endpoints (notices/marquee) are
   * GETs rather than POSTs; the interceptor still rewrites them, so the same
   * `LocalName` + `Authorization` headers apply.
   */
  async getEncrypted(path: string, identity: PortalIdentity): Promise<unknown> {
    const token = identity.token;
    if (!token) {
      throw new PortalError("Missing CampusLynx session token.", 401);
    }

    let text: string;
    try {
      const response = await this.http.get<string>(path, {
        headers: {
          ...ANONYMOUS_HEADERS(new Date()),
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      text = typeof response.data === "string" ? response.data : "";
    } catch (error: any) {
      throw new PortalError(
        `CampusLynx request to ${path} failed: ${error?.message || "network error"}`,
        error?.response?.status,
        error?.response?.data
      );
    }

    if (!text || !text.trim()) {
      // Same signal as `postEncrypted`: this request carried a Bearer token, so
      // 200-with-empty-body means the JWT is dead. Report 401 so callers tell
      // the user to log in again instead of showing a generic fetch failure.
      throw new PortalError(`The portal session expired for ${path}.`, 401);
    }
    return parseJson(text);
  }

  /**
   * Lightweight session refresh — does NOT need a captcha.
   *
   * Confirmed by lazyportal reference implementation:
   *   POST /token/refreshTokenRequest
   *   Body: plain JSON { username, tokendate }   ← NOT AES-encrypted
   *   Headers: Content-Type + LocalName nonce    ← no Authorization header
   *   Response: { response: { msg: "Success", token?: "..." } }
   *
   * The portal may rotate the token in the response (check all known key names).
   * Returns { ok: true, token? } on success; { ok: false } when the portal
   * refuses (msg !== "Success" or empty body).
   */
  async refreshToken(params: {
    username: string;
    tokendate?: string;
  }): Promise<{ ok: boolean; token?: string }> {
    const now = new Date();
    const payload = JSON.stringify({
      username: params.username,
      tokendate: params.tokendate ?? now.toString(),
    });

    let text: string;
    try {
      text = await this.send(
        "/token/refreshTokenRequest",
        payload,
        // Plain JSON — portal spec says NO AES encryption, NO Authorization here
        { ...ANONYMOUS_HEADERS(now), "Content-Type": "application/json" }
      );
    } catch {
      return { ok: false };
    }

    if (!text?.trim()) return { ok: false };

    const parsed = parseJson(text) as Record<string, any> | undefined;
    if (!parsed || typeof parsed !== "object") return { ok: false };

    const res = parsed.response ?? {};
    if (res.msg !== "Success") return { ok: false };

    // Token field name varies — try the known variants
    const token =
      ["token", "Token", "newToken", "accessToken", "jwt", "jwttoken"]
        .map((k) => res[k])
        .find((v) => typeof v === "string" && v.length > 0) ?? undefined;

    return { ok: true, ...(token ? { token } : {}) };
  }

}

/** Convenience factory so callers can inject a base URL in tests. */
export function createPortalClient(options?: PortalClientOptions): PortalClient {
  return new PortalClient(options);
}

export { isTokenExpired };
