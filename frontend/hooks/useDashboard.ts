/**
 * useDashboard Hook
 * Fetch and manage dashboard data via CampusLynx One-Hop transport.
 *
 * Uses localStorage + in-memory snapshot (`sharedData`) for instant rendering,
 * refreshing only on login, app reopen (`visibilitychange`), or explicit user refresh.
 * If an auth failure occurs while cached data is shown, silently retries
 * (up to MAX_SILENT_RETRIES) while session recovery completes before surfacing an error.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { postEncrypted, getEncrypted, getBuffer } from "@/lib/portalClient";
import {
  clearPortalDashboardSessionState,
  fetchAttendanceOverview,
  fetchPerformanceExtras,
} from "@/lib/portalDashboard";
import { loadSession } from "@/lib/session";
import { PortalError, SessionExpiredError } from "@/lib/errors";
import type { DashboardResponse } from "@/types";

export interface DashboardState {
  data: DashboardResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: { message: string; code?: string } | null;
  cached: boolean;
  ttl: number;
  cachedAt: Date | null;
}

export interface UseDashboardReturn extends DashboardState {
  refresh: () => Promise<void>;
  invalidateCache: () => Promise<boolean>;
}

const STORAGE_KEY_PREFIX = "juet_dashboard_cache_v3_";

/** Minimum interval between auto-refreshes triggered by app reopen (ms). */
const AUTO_REFRESH_THROTTLE_MS = 5 * 60 * 1000;
let lastAutoRefreshAt = 0;

/** Silent retries before we surface a 401 error banner when cached data is shown. */
const MAX_SILENT_RETRIES = 2;

/** Back-off between silent retries (ms). */
const SILENT_RETRY_DELAY_MS = 4_000;

let sharedData: {
  enrollment: string;
  data: DashboardResponse;
  fetchedAt: Date;
} | null = null;

let inFlightDashboardPromise: Promise<{ data: any; cacheHeader: any; fetchedAt: Date; ttl: number }> | null = null;
let inFlightEnrollment: string | null = null;
let inFlightExtrasEnrollment: string | null = null;

/** Clears the cross-page snapshot (used on manual cache invalidation and logout). */
export function clearSharedDashboard(enrollment?: string | null) {
  if (sharedData && (!enrollment || sharedData.enrollment === enrollment.toUpperCase())) {
    sharedData = null;
  }
}

function loadCachedDashboard(enrollment: string | null): { data: DashboardResponse; fetchedAt: Date } | null {
  if (typeof window === "undefined" || !enrollment) return null;

  const key = enrollment.toUpperCase();

  // Fast path: if sharedData already holds data for this enrollment, skip
  // localStorage.getItem + JSON.parse entirely (saves ~150KB parse).
  if (sharedData && sharedData.enrollment === key) {
    return { data: sharedData.data, fetchedAt: sharedData.fetchedAt };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.data) {
        const fetchedAt = parsed.fetchedAt ? new Date(parsed.fetchedAt) : new Date();
        const result = {
          data: parsed.data,
          fetchedAt,
        };
        // Populate sharedData on first parse so subsequent calls skip localStorage
        sharedData = {
          enrollment: key,
          data: parsed.data,
          fetchedAt,
        };
        return result;
      }
    }
  } catch {}
  return null;
}

export function useDashboard(enrollment: string | null): UseDashboardReturn {
  /** Tracks silent 401 retries so we don't immediately show the error banner. */
  const silentRetryCount = useRef(0);

  /**
   * Tracks data availability via ref so it can be read safely in callbacks
   * without stale closures or side-effects inside setState updaters.
   */
  const hasDataRef = useRef(false);

  const [state, setState] = useState<DashboardState>(() => {
    const cached = loadCachedDashboard(enrollment);
    if (cached) {
      hasDataRef.current = true;
      return {
        data: cached.data,
        isLoading: false,
        isRefreshing: false,
        error: null,
        cached: true,
        ttl: 0,
        cachedAt: cached.fetchedAt,
      };
    }
    return {
      data: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
      cached: false,
      ttl: 0,
      cachedAt: null,
    };
  });

  // Keep hasDataRef in sync with state across renders
  useEffect(() => {
    hasDataRef.current = state.data !== null;
  }, [state.data]);

  // Hydrate immediately when enrollment becomes available after initial render
  useEffect(() => {
    if (enrollment && !state.data) {
      const cached = loadCachedDashboard(enrollment);
      if (cached) {
        setState((prev) => ({
          ...prev,
          data: cached.data,
          cached: true,
          cachedAt: cached.fetchedAt,
          isLoading: false,
          error: null, // Clear any transient error from the enrollment=null phase
        }));
      }
    }
  }, [enrollment, state.data]);

  /**
   * Fetch dashboard data.
   *
   * @param isRetry  Suppresses duplicate auto-retry for 503 RELOGIN_FAILED.
   * @param isSilent When true, a 401 with cached data triggers a silent retry
   *                 instead of showing the error banner.
   */
  const fetchDashboard = useCallback(async (_isRetry = false, isSilent = false, forceFresh = false) => {
    // No-op when enrollment isn't loaded yet — the parent component sets it
    // asynchronously from localStorage, so null is the expected initial value.
    if (!enrollment) return;

    try {
      // Show loading skeleton if no data yet; otherwise mark as background refreshing
      if (!isSilent) {
        setState((prev) => ({ ...prev, isLoading: !prev.data, isRefreshing: true, error: null }));
      } else {
        setState((prev) => ({ ...prev, isRefreshing: true }));
      }

      const key = enrollment.toUpperCase();
      let responsePayload: { data: any; cacheHeader: any; fetchedAt: Date; ttl: number };

      // In-flight promise deduplication: avoid duplicate network requests if a fetch is already running
      // unless forceFresh is requested (e.g. after manual cache invalidation).
      if (!forceFresh && inFlightDashboardPromise && inFlightEnrollment === key) {
        responsePayload = await inFlightDashboardPromise;
      } else {
        if (forceFresh) {
          clearPortalDashboardSessionState(key);
        }
        inFlightEnrollment = key;
        const currentPromise = (async () => {
          const session = loadSession();
          if (!session?.token || !session?.instituteid) {
            throw new SessionExpiredError();
          }
          const transport = { postEncrypted, getEncrypted, getBuffer };
          const args = {
            instituteid: session.instituteid,
            companyid: session.companyid,
            username: session.username || session.enrollment,
          };

          // Phase 1 (Fast Path): fetch profile + attendance overview immediately (~700ms)
          const overview = await fetchAttendanceOverview(transport, args);
          const fetchedAt = new Date();

          // Preserve previously cached performance/marks while background extras load
          const existing = loadCachedDashboard(key);
          const initialData: DashboardResponse = {
            ...overview.dashboard,
            performance:
              existing?.data?.performance?.semesters?.length ||
              existing?.data?.performance?.recentMarks?.length
                ? existing.data.performance
                : overview.dashboard.performance,
            detailedMarks: existing?.data?.detailedMarks?.length
              ? existing.data.detailedMarks
              : overview.dashboard.detailedMarks,
          };

          // Phase 2 (Deferred): fetch marks & semester SGPA in background without blocking Attendance
          if (inFlightExtrasEnrollment !== key) {
            inFlightExtrasEnrollment = key;
            void fetchPerformanceExtras(
              transport,
              args,
              overview.profile,
              overview.registrations
            )
              .then((extras) => {
                if (loadSession()?.enrollment?.trim().toUpperCase() !== key) {
                  return;
                }
                const merged: DashboardResponse = {
                  ...overview.dashboard,
                  performance: extras.performance,
                  detailedMarks: extras.detailedMarks,
                };
                const updatedAt = new Date();
                if (typeof window !== "undefined") {
                  try {
                    localStorage.setItem(
                      `${STORAGE_KEY_PREFIX}${key}`,
                      JSON.stringify({ data: merged, fetchedAt: updatedAt.toISOString() })
                    );
                  } catch {}
                  sharedData = { enrollment: key, data: merged, fetchedAt: updatedAt };
                }
                setState((prev) => ({
                  ...prev,
                  data: merged,
                  cachedAt: updatedAt,
                }));
              })
              .catch(() => {
                // Non-fatal: attendance is already rendered
              })
              .finally(() => {
                if (inFlightExtrasEnrollment === key) {
                  inFlightExtrasEnrollment = null;
                }
              });
          }

          return { data: initialData, cacheHeader: "miss", fetchedAt, ttl: 300 };
        })();
        inFlightDashboardPromise = currentPromise;

        try {
          responsePayload = await currentPromise;
        } finally {
          if (inFlightDashboardPromise === currentPromise) {
            inFlightDashboardPromise = null;
            inFlightEnrollment = null;
          }
        }
      }

      const { data, cacheHeader, fetchedAt, ttl } = responsePayload;

      if (typeof window !== "undefined" && enrollment && data) {
        try {
          localStorage.setItem(
            `${STORAGE_KEY_PREFIX}${enrollment.toUpperCase()}`,
            JSON.stringify({ data, fetchedAt: fetchedAt.toISOString() })
          );
        } catch {}
        sharedData = {
          enrollment: enrollment.toUpperCase(),
          data,
          fetchedAt,
        };
        try {
          window.dispatchEvent(new CustomEvent("juet:dashboard-updated", { detail: data }));
        } catch {}
      }

      // Successful fetch — reset silent retry counter
      silentRetryCount.current = 0;

      setState((prev) => ({
        ...prev,
        data,
        cached: cacheHeader === "hit",
        ttl: ttl || 0,
        cachedAt: fetchedAt,
        isLoading: false,
        isRefreshing: false,
        error: null,
      }));

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Dashboard] Fetched (${cacheHeader === "hit" ? "cached" : "fresh"})`
        );
      }
    } catch (error: unknown) {
      const isAuthErr =
        error instanceof SessionExpiredError ||
        (error instanceof PortalError && error.httpStatus === 401);

      if (isAuthErr) {
        if (hasDataRef.current && silentRetryCount.current < MAX_SILENT_RETRIES) {
          silentRetryCount.current += 1;
          setState((prev) => ({ ...prev, isLoading: false, isRefreshing: false }));
          setTimeout(() => fetchDashboard(false, true), SILENT_RETRY_DELAY_MS);
          return;
        }

        silentRetryCount.current = 0;
        setState((prev) => ({
          ...prev,
          error: {
            message: prev.data
              ? "We could not reconnect to the portal. Your last synced records are still shown."
              : "We could not reconnect to the portal. Please try again.",
            code: "SESSION_RENEWING",
          },
          isLoading: false,
          isRefreshing: false,
        }));
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch dashboard";
      const errorCode = error instanceof PortalError ? error.code : undefined;

      setState((prev) => ({
        ...prev,
        error: { message: errorMessage, code: errorCode },
        isLoading: false,
        isRefreshing: false,
      }));
    }
  }, [enrollment]);

  /**
   * Manually invalidate cache & re-fetch fresh data directly from CampusLynx
   */
  const invalidateCache = useCallback(async (): Promise<boolean> => {
    if (!enrollment) return false;

    try {
      setState((prev) => ({ ...prev, isLoading: !prev.data, isRefreshing: true, error: null }));
      await fetchDashboard(false, false, true);
      return true;
    } catch (error: unknown) {
      console.error("[Dashboard] Cache invalidation error:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to sync portal data",
          code: error instanceof PortalError ? error.code : undefined,
        },
      }));
      return false;
    }
  }, [enrollment, fetchDashboard]);

  /**
   * Fetch on mount and enrollment change.
   *
   * Serves in-memory/localStorage cached data immediately and refreshes once on
   * fresh app open / login; navigating between routes reuses `sharedData`.
   */
  useEffect(() => {
    // Wait for enrollment to be loaded from localStorage by the parent component.
    // Without this guard, the first render (enrollment = null) would trigger a
    // pointless fetchDashboard() that returns immediately.
    if (!enrollment) return;

    const key = enrollment.toUpperCase();

    // If in-memory snapshot already exists, the user is navigating between pages
    // within the already-open app — serve it immediately without re-fetching.
    if (
      sharedData &&
      sharedData.enrollment === key &&
      Boolean(sharedData.data)
    ) {
      const fresh = sharedData;
      setState((prev) => ({
        ...prev,
        data: fresh.data,
        cached: true,
        cachedAt: fresh.fetchedAt,
        isLoading: false,
        error: null,
      }));
      return;
    }

    // Fresh app open / reload with localStorage cache: show cached data
    // immediately and refresh once in the background.
    const cached = loadCachedDashboard(enrollment);
    if (cached) {
      setState((prev) => ({
        ...prev,
        data: cached.data,
        cached: true,
        cachedAt: cached.fetchedAt,
        isLoading: false,
        error: null,
      }));

      lastAutoRefreshAt = Date.now();
      fetchDashboard(false, true);
      return;
    }

    // No cached data (new login or cleared storage) — fetch immediately
    lastAutoRefreshAt = Date.now();
    fetchDashboard();
  }, [fetchDashboard, enrollment]);

  /**
   * Auto-refresh when the app/tab becomes visible again after being hidden/closed
   */
  useEffect(() => {
    if (!enrollment) return;

    const handleVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastAutoRefreshAt > AUTO_REFRESH_THROTTLE_MS) {
          lastAutoRefreshAt = now;
          fetchDashboard(false, true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [enrollment, fetchDashboard]);

  return {
    ...state,
    refresh: fetchDashboard,
    invalidateCache,
  };
}

