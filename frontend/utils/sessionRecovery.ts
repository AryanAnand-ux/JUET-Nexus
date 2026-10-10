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

let inFlight: Promise<boolean> | null = null;

/**
 * @returns `true` when a usable session is (re)established, `false` when the
 *          user must sign in again (e.g. no stored credentials, changed
 *          password, or OTP required).
 */
export function recoverSession(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = runRecovery().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRecovery(): Promise<boolean> {
  // Tier 1 — lightweight refresh.
  try {
    await axios.post(
      `${API_URL}/api/auth/refresh`,
      {},
      { withCredentials: true, timeout: 15000 }
    );
    return true;
  } catch (err) {
    // Only an explicit 401 means "the session is gone". A network blip or a
    // backend 5xx must not cost the user their session.
    if (!axios.isAxiosError(err) || err.response?.status !== 401) {
      return true;
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
      await axios.post(
        `${API_URL}/api/auth/silent-login`,
        { captcha: captchaText, sessionToken },
        { withCredentials: true, timeout: 30000 }
      );
      return true;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code;
        // Terminal states — retrying cannot help; ask the user to sign in.
        if (
          code === "NO_STORED_CREDENTIALS" ||
          code === "CREDENTIALS_INVALID" ||
          code === "OTP_REQUIRED" ||
          code === "NO_SESSION" ||
          code === "INVALID_SESSION"
        ) {
          return false;
        }
        // CAPTCHA_INVALID / CAPTCHA_EXPIRED / 502 / timeout: try a fresh captcha.
      }
    }
  }

  return false;
}
