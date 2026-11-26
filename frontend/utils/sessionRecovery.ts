/**
 * Automatic session recovery ("always logged in") — One-Hop Architecture.
 *
 * Delegates to portalClient.recoverPortalSession():
 *   Tier 1 — POST /api/proxy/token/refreshTokenRequest (fast, no captcha).
 *   Tier 2 — Browser fetches captcha, solves it with captchaSolver, and calls
 *            pretoken-check + generatewebtoken using encrypted localStorage credentials.
 */

import { recoverPortalSession } from "@/lib/portalClient";

export function recoverSession(force = false): Promise<boolean> {
  return recoverPortalSession(force);
}
