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
 *   - If refresh gets a 401 (cookie truly gone), redirect to /login.
 *   - Silently ignores network errors so offline / flaky connections don't
 *     kick the user out.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Refresh every 10 minutes — well within the 15-minute portal token window
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function useSessionKeepAlive(enabled: boolean) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

    try {
      await axios.post(
        `${API_URL}/api/auth/refresh`,
        {},
        { withCredentials: true, timeout: 15000 }
      );
    } catch (err) {
      if (!axios.isAxiosError(err)) return;

      const status = err.response?.status;
      const code = err.response?.data?.code;

      // Only force logout if the cookie is genuinely absent/invalid
      if (
        status === 401 &&
        (code === "NO_SESSION" || code === "INVALID_SESSION")
      ) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("enrollment");
          localStorage.removeItem("role");
        }
        router.push("/login");
      }
      // SESSION_EXPIRED / network errors → stay silent, let useDashboard handle it
    }
  }, [enabled, router]);

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

  // Refresh on tab / app foreground
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, refresh]);

  // Track unmount to avoid state updates after cleanup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
}
