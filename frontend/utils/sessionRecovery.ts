/**
 * Automatic session recovery ("always logged in").
 *
 * Mirrors lazyportal's strategy so the user is never bounced back to a login
 * screen while their cookie is still valid:
 *
 *   Tier 1 — slide / renew the portal token via POST /api/auth/refresh
 *            (fast, no captcha). A non-401 failure (offline, 5xx) means the
 *            session is fine: report success so the caller keeps the user in.
 *
 *   Tier 2 — the portal refused the session. Fetch a captcha, solve it in the
 *            browser, and let the backend re-login with the password it holds
 *            (AES-encrypted) inside the httpOnly cookie. Retried a few times to
 *            absorb the portal's very short captcha lifetime.
 *
 * Concurrent callers (keepalive timer, axios interceptor, focus handler) share a
 * single in-flight run, so a burst of 401s triggers exactly one recovery.
 */

import axios from "axios";
import { solveCampusLynxCaptcha } from "@/utils/captchaSolver";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const MAX_CAPTCHA_ATTEMPTS = 5;

const RECOVERY_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
let lastRecoveryAt = 0;
let inFlight: Promise<boolean> | null = null;

/**
 * @param force When true, bypasses the 2-minute cooldown (used on explicit 401s).
 * @returns `true` when a usable session is (re)established, `false` when the
 *          user must sign in again (e.g. no stored credentials, changed
 *          password, or OTP required).
 */
export function recoverSession(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
    return Promise.resolve(true);
  }
  if (inFlight) return inFlight;
  inFlight = runRecovery().finally(() => {
    lastRecoveryAt = Date.now();
    inFlight = null;
  });
  return inFlight;
}

function getRecoveryHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("sessionToken");
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
    "X-Session-Token": token,
  };
}

function saveRecoveredToken(token?: string) {
  if (typeof window !== "undefined" && token && typeof token === "string") {
    localStorage.setItem("sessionToken", token);
  }
}

async function runRecovery(): Promise<boolean> {
  const headers = getRecoveryHeaders();

  // Tier 1 — lightweight refresh.
  try {
    const refreshRes = await axios.post(
      `${API_URL}/api/auth/refresh`,
      {},
      { withCredentials: true, timeout: 30000, headers }
    );
    saveRecoveredToken(refreshRes.data?.sessionToken);
    return true;
  } catch (err) {
    if (!axios.isAxiosError(err)) {
      // Network blip / 5xx — session may still be valid, keep the user in.
      return true;
    }
    if (err.response?.status !== 401) {
      // Non-401 non-network error (e.g. 502) — treat as transient, keep in.
      return true;
    }
    const code = err.response?.data?.code as string | undefined;
    // Terminal: server cannot decrypt this token (key rotated on restart, or
    // cookie/header was tampered with). Captcha retries will also fail — skip
    // Tier 2 and tell the caller to send the user back to the login screen.
    if (code === "INVALID_SESSION" || code === "NO_SESSION") {
      if (typeof window !== "undefined") {
        localStorage.removeItem("sessionToken");
      }
      return false;
    }
  }

  // Tier 2 — silent full re-login with the server-stored password.
  for (let attempt = 0; attempt < MAX_CAPTCHA_ATTEMPTS; attempt++) {
    // NOTE: no `document.visibilityState === "hidden"` bail-out here. The
    // captcha is solved on a detached canvas plus an `Image` element, neither of
    // which needs a visible document, so backgrounded tabs recover just fine.
    // Aborting on hidden is what used to force a manual re-login after the
    // tab was closed and reopened past the token's ~15-minute lifetime.

    let captchaImage = "";
    let sessionToken = "";
    try {
      const init = await axios.get(`${API_URL}/api/init`, {
        withCredentials: true,
        timeout: 30000,
        headers,
      });
      captchaImage = init.data?.captchaImage || "";
      sessionToken = init.data?.sessionToken || "";
    } catch {
      continue;
    }
    if (!captchaImage || !sessionToken) continue;

    let captchaText = "";
    try {
      captchaText = await solveCampusLynxCaptcha(captchaImage);
    } catch {
      captchaText = "";
    }
    if (!captchaText) continue;

    try {
      const silentRes = await axios.post(
        `${API_URL}/api/auth/silent-login`,
        { captcha: captchaText, sessionToken },
        { withCredentials: true, timeout: 30000, headers }
      );
      saveRecoveredToken(silentRes.data?.sessionToken);
      return true;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code;
        // Terminal states — if credentials repeatedly fail or session is missing, ask the user to sign in.
        if (
          code === "NO_STORED_CREDENTIALS" ||
          code === "OTP_REQUIRED" ||
          code === "NO_SESSION" ||
          code === "INVALID_SESSION"
        ) {
          return false;
        }
        // If credentials failed on attempt > 0, password really changed.
        // On attempt 0, could be portal 200-empty-body glitch, so retry once.
        if (code === "CREDENTIALS_INVALID" && attempt > 0) {
          return false;
        }
        // CAPTCHA_INVALID / CAPTCHA_EXPIRED / 502 / timeout: try a fresh captcha.
      }
    }
  }

  return false;
}
