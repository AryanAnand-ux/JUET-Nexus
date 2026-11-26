/**
 * portalClient.ts
 *
 * Browser-side CampusLynx fetch client communicating through /api/proxy/*.
 * Handles:
 *  - AES-128-CBC body encryption & LocalName nonce header
 *  - Anonymous login endpoints (getCaptcha, preTokenCheck, generateWebToken)
 *  - Authenticated endpoints (postEncrypted, getEncrypted, getBuffer)
 *  - Transparent 401/expired recovery safeguards:
 *      * cancelRefresh() aborts in-flight recovery on logout / explicit login
 *      * cross-tab token-changed detection reuses tokens refreshed by sibling tabs
 *      * session status emitter ("recovering" | "authenticated" | "expired")
 */

"use client";

import {
  encryptBody,
  makeLocalName,
  jwtExpiry,
} from "./portalCrypto";
import {
  loadSession,
  saveSession,
  clearSession,
  loadCredentials,
  clearCredentials,
  type JuetSession,
} from "./session";
import { solveCampusLynxCaptcha } from "@/utils/captchaSolver";
import {
  PortalError,
  SessionExpiredError,
  NetworkError,
  RequestTimeoutError,
  toPortalError,
} from "./errors";

const PROXY_BASE = "/api/proxy";
const DEFAULT_TIMEOUT_MS = 45_000;
const STUDENT_MODULE = "STUDENTMODULE";

export type SessionStatus = "recovering" | "authenticated" | "expired";
const statusListeners = new Set<(status: SessionStatus) => void>();
let currentStatus: SessionStatus | null = null;

function setSessionStatus(status: SessionStatus) {
  if (currentStatus === status) return;
  currentStatus = status;
  for (const cb of statusListeners) {
    try {
      cb(status);
    } catch {
      /* observers must not break transport */
    }
  }
}

export function subscribeSessionStatus(
  cb: (status: SessionStatus) => void
): () => void {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

export interface PortalCaptcha {
  captcha: string;
  hidden: string;
  image: string;
}

export interface PortalPreToken {
  random: string;
  otppwd: string;
  rejectedData?: string;
  username?: string;
}

function normalizeEndpoint(endpoint: string): string {
  const clean = endpoint.replace(/^\/+/, "");
  return `${PROXY_BASE}/${clean}`;
}

function parseJsonText(text: string): unknown {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

async function anonymousHeaders(now = new Date()): Promise<Record<string, string>> {
  const { encrypted } = await makeLocalName({ now });
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    LocalName: encrypted,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;

  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else if (externalSignal) {
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    controller.abort(new RequestTimeoutError());
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (controller.signal.aborted) {
      if (controller.signal.reason instanceof PortalError) {
        throw controller.signal.reason;
      }
      throw err;
    }
    if (err instanceof PortalError) throw err;
    throw new NetworkError(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You are offline."
        : "JUET's portal is unreachable."
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

// ── Auth endpoints ───────────────────────────────────────────────────────────

export async function getCaptcha(signal?: AbortSignal): Promise<PortalCaptcha> {
  const res = await fetchWithTimeout(normalizeEndpoint("token/getcaptcha"), {
    method: "GET",
    headers: await anonymousHeaders(new Date()),
    signal,
  });

  const text = await res.text();
  const parsed = parseJsonText(text) as {
    response?: { captcha?: PortalCaptcha };
  };
  const captcha = parsed?.response?.captcha;
  if (!captcha?.hidden || !captcha?.image) {
    throw new PortalError("CampusLynx captcha service returned no image.", {
      httpStatus: 502,
    });
  }
  return captcha;
}

export async function preTokenCheck(
  payload: {
    username: string;
    usertype?: "S" | "P";
    captcha: PortalCaptcha;
  },
  signal?: AbortSignal
): Promise<PortalPreToken> {
  const now = new Date();
  const body = await encryptBody(
    {
      username: payload.username,
      usertype: payload.usertype ?? "S",
      captcha: payload.captcha,
    },
    { now }
  );

  const res = await fetchWithTimeout(normalizeEndpoint("token/pretoken-check"), {
    method: "POST",
    headers: await anonymousHeaders(now),
    body,
    signal,
  });

  const text = await res.text();
  if (!text.trim()) {
    throw new PortalError(
      "The portal rejected the captcha. Please refresh and try again.",
      { code: "INVALID_CAPTCHA", httpStatus: 401 }
    );
  }

  const parsed = parseJsonText(text) as {
    status?: { responseStatus?: string; errors?: unknown };
    response?: PortalPreToken;
  };
  if (parsed?.status?.responseStatus !== "Success" || !parsed.response?.random) {
    throw new PortalError(
      parsed?.status?.errors
        ? String(parsed.status.errors)
        : "Invalid enrollment number or captcha.",
      { code: "INVALID_CAPTCHA", httpStatus: 401 }
    );
  }
  return parsed.response;
}

async function authenticateWebToken(
  payload: {
    otppwd: string;
    username: string;
    passwordotpvalue: string;
    random: string;
  },
  signal?: AbortSignal,
  opts?: { skipCancelRefresh?: boolean }
): Promise<JuetSession> {
  const now = new Date();
  const body = await encryptBody(
    {
      otppwd: payload.otppwd,
      username: payload.username,
      passwordotpvalue: payload.passwordotpvalue,
      Modulename: STUDENT_MODULE,
      random: payload.random,
    },
    { now }
  );

  const res = await fetchWithTimeout(
    normalizeEndpoint("token/generatewebtoken"),
    {
      method: "POST",
      headers: await anonymousHeaders(now),
      body,
      signal,
    }
  );

  const text = await res.text();
  if (!text.trim()) {
    throw new PortalError(
      "Invalid password or login rejected by portal.",
      { code: "INVALID_PASSWORD", httpStatus: 401 }
    );
  }

  const parsed = parseJsonText(text) as {
    status?: { responseStatus?: string; errors?: unknown };
    response?: { regdata?: Record<string, unknown> };
  };

  const regdata = parsed?.response?.regdata;
  if (
    parsed?.status?.responseStatus !== "Success" ||
    !regdata ||
    typeof regdata.token !== "string" ||
    !regdata.token
  ) {
    throw new PortalError(
      parsed?.status?.errors
        ? String(parsed.status.errors)
        : "Authentication failed.",
      { code: "INVALID_PASSWORD", httpStatus: 401 }
    );
  }

  const instituteList = Array.isArray(regdata.institutelist)
    ? (regdata.institutelist as Array<Record<string, unknown>>)
    : [];
  const firstInstitute = instituteList[0] ?? {};
  const instituteid = String(firstInstitute.value || regdata.instituteid || "");
  const token = regdata.token;
  const tokendate =
    String(
      regdata.tokendate ||
        regdata.TokenDate ||
        regdata.tokenDate ||
        regdata.token_date ||
        regdata.issuedate ||
        regdata.issuedAt ||
        ""
    ) || undefined;

  const session: JuetSession = {
    enrollment: String(regdata.enrollmentno || payload.username).toUpperCase(),
    token,
    tokenExpiry: jwtExpiry(token),
    name: String(regdata.name || ""),
    branch: "",
    semester: "",
    clientid: String(regdata.clientid || ""),
    instituteid,
    companyid: String(regdata.companyid || ""),
    memberid: String(regdata.memberid || ""),
    membertype: String(regdata.membertype || "S"),
    userid: regdata.userid ? String(regdata.userid) : undefined,
    username: payload.username,
    otppwd: payload.otppwd,
    institutename: regdata.institutename
      ? String(regdata.institutename)
      : undefined,
    bypass: regdata.bypass ? String(regdata.bypass) : undefined,
    tokendate,
    issuedAt: Date.now(),
  };

  if (!opts?.skipCancelRefresh) {
    // Explicit login supersedes any background recovery or failed-token state.
    cancelRefresh();
  }
  saveSession(session);
  setSessionStatus("authenticated");
  return session;
}

export async function generateWebToken(
  payload: {
    otppwd: string;
    username: string;
    passwordotpvalue: string;
    random: string;
  },
  signal?: AbortSignal
): Promise<JuetSession> {
  return authenticateWebToken(payload, signal);
}

// ── Session refresh & silent recovery ────────────────────────────────────────

const MAX_CAPTCHA_ATTEMPTS = 8;
const FAILURE_COOLDOWN_MS = 15_000;

let inFlightRecovery: Promise<boolean> | null = null;
let recoveryController: AbortController | null = null;
let refreshGeneration = 0;
let lastRefreshAt = 0;
let failedAuthorization: { token: string; failedAt: number } | null = null;

// Sync cross-tab session renewals so sibling tabs immediately benefit from a fresh token
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "juet.session" && event.newValue) {
      failedAuthorization = null;
      lastRefreshAt = Date.now();
      setSessionStatus("authenticated");
    }
  });
}

/** Cancel any in-flight background recovery (called on logout or explicit login). */
export function cancelRefresh(): void {
  refreshGeneration++;
  if (recoveryController) {
    recoveryController.abort();
    recoveryController = null;
  }
  inFlightRecovery = null;
  failedAuthorization = null;
  currentStatus = null;
}

/**
 * Tier 1: Lightweight token refresh (plain JSON, no captcha).
 */
export async function refreshPortalToken(signal?: AbortSignal): Promise<{
  ok: boolean;
  networkError?: boolean;
}> {
  const session = loadSession();
  if (!session) return { ok: false };

  const now = new Date();
  try {
    const res = await fetchWithTimeout(
      normalizeEndpoint("token/refreshTokenRequest"),
      {
        method: "POST",
        headers: await anonymousHeaders(now),
        body: JSON.stringify({
          username: session.username || session.enrollment,
          tokendate: session.tokendate ?? now.toString(),
        }),
        signal,
      },
      25_000
    );

    const text = await res.text();
    if (!text.trim()) return { ok: false };

    const parsed = parseJsonText(text) as {
      response?: Record<string, unknown>;
    };
    const r = parsed?.response;
    if (!r || r.msg !== "Success") return { ok: false };

    const rotatedToken = ["token", "Token", "newToken", "accessToken", "jwt", "jwttoken"]
      .map((k) => r[k])
      .find((v): v is string => typeof v === "string" && v.length > 0);

    if (rotatedToken) {
      saveSession({
        ...session,
        token: rotatedToken,
        tokenExpiry: jwtExpiry(rotatedToken),
        issuedAt: Date.now(),
      });
    }
    lastRefreshAt = Date.now();
    return { ok: true };
  } catch (err) {
    if (err instanceof NetworkError || err instanceof RequestTimeoutError) {
      return { ok: false, networkError: true };
    }
    return { ok: false };
  }
}

/**
 * Tier 2: Silent full re-login using locally encrypted password + in-browser captcha solver.
 * Used automatically when Tier 1 (refreshTokenRequest) is rejected after >15m expiry.
 */
async function silentReLogin(signal?: AbortSignal): Promise<{
  ok: boolean;
  networkError?: boolean;
  invalidPassword?: boolean;
}> {
  const liveSession = loadSession();
  if (!liveSession?.enrollment) return { ok: false };

  const creds = await loadCredentials(liveSession.enrollment);
  if (!creds?.password) return { ok: false };

  for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
    if (signal?.aborted) return { ok: false };

    try {
      const captcha = await getCaptcha(signal);
      if (signal?.aborted) return { ok: false };

      const solved = await solveCampusLynxCaptcha(captcha.image);
      if (!solved || solved.length !== 5) {
        continue;
      }

      const pre = await preTokenCheck(
        {
          username: creds.enrollment,
          usertype: "S",
          captcha: { ...captcha, captcha: solved },
        },
        signal
      );

      if (pre.otppwd !== "PWD") {
        // OTP-only accounts cannot be auto-authenticated silently
        return { ok: false };
      }

      await authenticateWebToken(
        {
          otppwd: pre.otppwd,
          username: creds.enrollment,
          passwordotpvalue: creds.password,
          random: pre.random,
        },
        signal,
        { skipCancelRefresh: true }
      );

      lastRefreshAt = Date.now();
      return { ok: true };
    } catch (err) {
      if (signal?.aborted) return { ok: false };

      if (err instanceof NetworkError || err instanceof RequestTimeoutError) {
        return { ok: false, networkError: true };
      }

      if (err instanceof PortalError && err.code === "INVALID_PASSWORD") {
        // Password changed on official portal — wipe stale password immediately
        // so we never lock the student's account with repeated bad logins.
        clearCredentials();
        return { ok: false, invalidPassword: true };
      }

      // Wrong captcha guess (`INVALID_CAPTCHA`) or transient upstream glitch — retry with fresh captcha
      if (!(err instanceof PortalError && err.code === "INVALID_CAPTCHA") && attempt < MAX_CAPTCHA_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  return { ok: false };
}

/**
 * Unified Two-Tier session recovery (Tier 1 refresh + Tier 2 silent auto-login).
 * Deduplicated across concurrent callers and cross-tab aware.
 */
export function recoverPortalSession(
  force = false,
  usedToken?: string
): Promise<boolean> {
  const liveSession = loadSession();
  if (!liveSession?.token) return Promise.resolve(false);

  // Another tab or concurrent request already installed a newer token
  if (usedToken && liveSession.token !== usedToken) {
    failedAuthorization = null;
    setSessionStatus("authenticated");
    return Promise.resolve(true);
  }

  if (failedAuthorization && failedAuthorization.token !== liveSession.token) {
    failedAuthorization = null;
  }
  if (
    !force &&
    failedAuthorization?.token === liveSession.token &&
    Date.now() - failedAuthorization.failedAt < FAILURE_COOLDOWN_MS
  ) {
    return Promise.resolve(false);
  }

  const isExpiringSoon =
    liveSession.tokenExpiry > 0 &&
    liveSession.tokenExpiry * 1000 - Date.now() < 120_000;

  if (!force && !isExpiringSoon && Date.now() - lastRefreshAt < 120_000) {
    return Promise.resolve(true);
  }
  if (
    !force &&
    !isExpiringSoon &&
    liveSession.issuedAt &&
    Date.now() - liveSession.issuedAt < 180_000
  ) {
    return Promise.resolve(true);
  }
  if (inFlightRecovery) return inFlightRecovery;

  const gen = ++refreshGeneration;
  const controller = new AbortController();
  recoveryController = controller;
  const tokenAtStart = liveSession.token;
  setSessionStatus("recovering");

  inFlightRecovery = (async () => {
    // Tier 1: Fast JWT slide (no captcha)
    const tier1 = await refreshPortalToken(controller.signal);
    if (controller.signal.aborted || gen !== refreshGeneration) return false;
    if (tier1.ok) {
      failedAuthorization = null;
      setSessionStatus("authenticated");
      return true;
    }
    if (tier1.networkError) {
      setSessionStatus("authenticated");
      return true;
    }

    // Check if a sibling tab/login installed a fresh token meanwhile
    const mid = loadSession();
    if (mid?.token && mid.token !== tokenAtStart) {
      failedAuthorization = null;
      setSessionStatus("authenticated");
      return true;
    }

    // Tier 2: Token is past CampusLynx refresh window — silently re-login with auto-captcha
    const tier2 = await silentReLogin(controller.signal);
    if (controller.signal.aborted || gen !== refreshGeneration) return false;
    if (tier2.ok) {
      failedAuthorization = null;
      setSessionStatus("authenticated");
      return true;
    }
    if (tier2.networkError) {
      setSessionStatus("authenticated");
      return true;
    }

    const after = loadSession();
    if (after?.token && after.token !== tokenAtStart) {
      failedAuthorization = null;
      setSessionStatus("authenticated");
      return true;
    }

    failedAuthorization = { token: tokenAtStart, failedAt: Date.now() };
    setSessionStatus("expired");
    return false;
  })().finally(() => {
    if (recoveryController === controller) {
      recoveryController = null;
      inFlightRecovery = null;
    }
  });

  return inFlightRecovery;
}

// ── Authenticated transport ──────────────────────────────────────────────────

async function authenticatedHeaders(
  token: string,
  now = new Date()
): Promise<Record<string, string>> {
  const { encrypted } = await makeLocalName({ now });
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${token}`,
    LocalName: encrypted,
  };
}

async function executeAuthenticated<T>(
  run: (token: string) => Promise<Response>,
  opts: { isBuffer?: boolean; skipRefresh?: boolean } = {}
): Promise<T> {
  const session = loadSession();
  if (!session?.token) {
    throw new SessionExpiredError();
  }

  let activeToken = session.token;
  let didRecover = Boolean(opts.skipRefresh);

  const tryRecover = async (force = true): Promise<string | null> => {
    if (didRecover) return null;
    didRecover = true;
    const ok = await recoverPortalSession(force, activeToken);
    if (!ok) return null;
    const updated = loadSession()?.token ?? null;
    if (updated) activeToken = updated;
    return updated;
  };

  // Pre-emptively recover if the local JWT is already expired (avoids a doomed 401 round-trip)
  if (
    !didRecover &&
    session.tokenExpiry > 0 &&
    Date.now() >= (session.tokenExpiry - 15) * 1000
  ) {
    await tryRecover(false);
  }

  let res = await run(activeToken);

  if (res.status === 401) {
    const recoveredToken = await tryRecover(true);
    if (recoveredToken) {
      res = await run(recoveredToken);
    }
  }

  if (opts.isBuffer && res.ok) {
    let buf = await res.arrayBuffer();
    if (buf.byteLength === 0) {
      const recoveredToken = await tryRecover(true);
      if (recoveredToken) {
        res = await run(recoveredToken);
        buf = await res.arrayBuffer();
      }
    }
    return new Uint8Array(buf) as unknown as T;
  }

  let text = await res.text();

  // CampusLynx returns 200 with empty body when token expired
  if (!text || !text.trim()) {
    const recoveredToken = await tryRecover(true);
    if (recoveredToken) {
      res = await run(recoveredToken);
      text = await res.text();
    }
  }

  if (res.status === 401 || !text?.trim()) {
    throw new SessionExpiredError();
  }

  const parsed = parseJsonText(text);
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const status = obj.status as Record<string, unknown> | undefined;
    if (status?.responseStatus === "Failure") {
      const err = toPortalError(obj, res.status);
      if (err instanceof SessionExpiredError) {
        const recoveredToken = await tryRecover(true);
        if (recoveredToken) {
          return executeAuthenticated<T>(run, { ...opts, skipRefresh: true });
        }
      }
    }
  }

  if (!res.ok) {
    throw toPortalError(
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null,
      res.status
    );
  }

  return parsed as T;
}

export async function postEncrypted<T = unknown>(
  endpoint: string,
  payload: Record<string, unknown>,
  opts?: { timeout?: number; signal?: AbortSignal }
): Promise<T> {
  return executeAuthenticated<T>(async (token) => {
    const now = new Date();
    const [headers, body] = await Promise.all([
      authenticatedHeaders(token, now),
      encryptBody(payload, { now }),
    ]);
    return fetchWithTimeout(
      normalizeEndpoint(endpoint),
      {
        method: "POST",
        headers,
        body,
        signal: opts?.signal,
      },
      opts?.timeout ?? DEFAULT_TIMEOUT_MS
    );
  });
}

export async function getEncrypted<T = unknown>(
  endpoint: string,
  opts?: { timeout?: number; signal?: AbortSignal }
): Promise<T> {
  return executeAuthenticated<T>(async (token) => {
    const headers = await authenticatedHeaders(token, new Date());
    return fetchWithTimeout(
      normalizeEndpoint(endpoint),
      {
        method: "GET",
        headers,
        signal: opts?.signal,
      },
      opts?.timeout ?? DEFAULT_TIMEOUT_MS
    );
  });
}

export async function getBuffer(
  endpoint: string,
  opts?: { timeout?: number; signal?: AbortSignal }
): Promise<Uint8Array> {
  return executeAuthenticated<Uint8Array>(
    async (token) => {
      const headers = await authenticatedHeaders(token, new Date());
      headers.Accept = "application/pdf, application/json, text/plain, */*";
      return fetchWithTimeout(
        normalizeEndpoint(endpoint),
        {
          method: "GET",
          headers,
          signal: opts?.signal,
        },
        opts?.timeout ?? DEFAULT_TIMEOUT_MS
      );
    },
    { isBuffer: true }
  );
}

/** Helper to sign out cleanly and abort any in-flight recovery. */
export function logoutClient(): void {
  cancelRefresh();
  clearSession();
}
