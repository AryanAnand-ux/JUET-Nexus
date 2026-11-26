/**
 * useSessionKeepAlive Hook
 *
 * Proactively calls `recoverSession()` (Tier 1 JWT slide, falling back to
 * Tier 2 silent auto-login) to keep the CampusLynx portal session alive
 * across the ~15-minute token window.
 *
 * Strategy:
 *   - Refresh every REFRESH_INTERVAL_MS while the page is visible.
 *   - Also refresh when the page becomes visible again or the window regains
 *     focus (handles kill + reopen, tab switch, phone unlock), throttled to
 *     REFRESH_THROTTLE_MS so rapid focus switches don't spam the portal.
 *   - Silently ignores network errors so offline / flaky connections don't
 *     kick the user out.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { recoverSession } from "@/utils/sessionRecovery";

// Refresh every 5 minutes — well within the 15-minute portal token window
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Minimum spacing between any two foreground refresh attempts.
const REFRESH_THROTTLE_MS = 3 * 60 * 1000;

// Shared across every hook instance so two mounts cannot bypass the throttle.
let lastRefreshAttemptAt = 0;

/**
 * Mark the session as recently established/verified (e.g. right after login)
 * so DashboardSessionKeeper does not fire a redundant refresh right after login.
 */
export function markSessionFresh(): void {
  lastRefreshAttemptAt = Date.now();
}

export function useSessionKeepAlive(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

    const now = Date.now();
    if (now - lastRefreshAttemptAt < REFRESH_THROTTLE_MS) return;
    lastRefreshAttemptAt = now;

    try {
      await recoverSession();
    } catch (err) {
      // Zero spontaneous logouts: keep quiet on background refresh failures
      if (process.env.NODE_ENV === "development") {
        console.debug("[KeepAlive] Background refresh check:", err);
      }
    }
  }, [enabled]);

  // Periodic refresh while visible
  useEffect(() => {
    if (!enabled) return;

    // Fire once immediately on mount to catch stale tokens right away
    refresh();

    timerRef.current = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, refresh]);

  // Refresh on tab / app foreground and window focus
  useEffect(() => {
    if (!enabled) return;

    const handleForeground = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refresh();
      }
    };

    const handleFocus = () => {
      refresh();
    };

    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, refresh]);

  // Track unmount to avoid state updates after cleanup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
}
