/**
 * useSessionKeepAlive Hook
 *
 * Proactively calls POST /api/auth/refresh to slide the 30-day auth cookie and
 * renew the CampusLynx portal token (which expires every ~15 minutes).
 *
 * Strategy:
 *   - Refresh every REFRESH_INTERVAL_MS while the page is visible.
 *   - Also refresh immediately when the page becomes visible again
 *     (handles kill + reopen, tab switch, phone unlock).
 *   - When the refresh is refused, fall back to `recoverSession()`, which does a
 *     transparent silent re-login with the server-stored password.
 *   - Silently ignores network errors so offline / flaky connections don't
 *     kick the user out.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { recoverSession } from "@/utils/sessionRecovery";

// Refresh every 5 minutes — well within the 15-minute portal token window
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function useSessionKeepAlive(enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

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
