/**
 * useDashboard Hook
 * Fetch and manage dashboard data from backend
 *
 * On tab reopen the CampusLynx token (≈15 min lifespan) is usually dead.
 * `useSessionKeepAlive` fires `recoverSession()` immediately on mount, but
 * `fetchDashboard` used to race it and hit a 401 before recovery finished.
 *
 * Fix: when localStorage holds cached data we defer the first network fetch
 * (SESSION_RECOVERY_GRACE_MS) so the keepalive can restore the token first.
 * If a 401 still lands *and* cached data is displayed, we silently retry
 * (up to MAX_SILENT_RETRIES) with back-off before surfacing an error banner.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/utils/api";
import type { DashboardResponse } from "@/types";

export interface DashboardState {
  data: DashboardResponse | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
  cached: boolean;
  ttl: number;
  cachedAt: Date | null;
}

export interface UseDashboardReturn extends DashboardState {
  refresh: () => Promise<void>;
  invalidateCache: () => Promise<void>;
  checkCacheStatus: () => Promise<void>;
}

const STORAGE_KEY_PREFIX = "juet_dashboard_cache_";

/** Grace period to let `useSessionKeepAlive` recover the token before we hit the API. */
const SESSION_RECOVERY_GRACE_MS = 3_500;

/** Silent retries before we surface a 401 error banner when cached data is shown. */
const MAX_SILENT_RETRIES = 2;

/** Back-off between silent retries (ms). */
const SILENT_RETRY_DELAY_MS = 4_000;

function loadCachedDashboard(enrollment: string | null): { data: DashboardResponse; fetchedAt: Date } | null {
  if (typeof window === "undefined" || !enrollment) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${enrollment.toUpperCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.data) {
        return {
          data: parsed.data,
          fetchedAt: parsed.fetchedAt ? new Date(parsed.fetchedAt) : new Date(),
        };
      }
    }
  } catch {}
  return null;
}

export function useDashboard(enrollment: string | null): UseDashboardReturn {
  /** Tracks silent 401 retries so we don't immediately show the error banner. */
  const silentRetryCount = useRef(0);

  /** Whether the very first fetch was deferred due to localStorage cache. */
  const deferredInitialFetch = useRef(false);

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
        error: null,
        cached: true,
        ttl: 0,
        cachedAt: cached.fetchedAt,
      };
    }
    return {
      data: null,
      isLoading: true,
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
  const fetchDashboard = useCallback(async (isRetry = false, isSilent = false) => {
    // No-op when enrollment isn't loaded yet — the parent component sets it
    // asynchronously from localStorage, so null is the expected initial value.
    if (!enrollment) return;

    try {
      // Only show loading skeleton when there is no data at all
      if (!isSilent) {
        setState((prev) => ({ ...prev, isLoading: !prev.data, error: null }));
      }

      const response = await apiClient.get(
        `/api/dashboard?enrollment=${encodeURIComponent(enrollment)}`,
        {
          timeout: 60000,
        }
      );

      const { data, cached, ttl } = response.data;
      const cacheHeader = response.headers["x-cache"];
      const fetchedAt = response.data?.fetchedAt ? new Date(response.data.fetchedAt) : new Date();

      if (typeof window !== "undefined" && enrollment && data) {
        try {
          localStorage.setItem(
            `${STORAGE_KEY_PREFIX}${enrollment.toUpperCase()}`,
            JSON.stringify({ data, fetchedAt: fetchedAt.toISOString() })
          );
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
        error: null,
      }));

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Dashboard] Fetched (${cacheHeader === "hit" ? "cached" : "fresh"})`
        );
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        // When we have cached data displayed, silently retry a few times before
        // showing the error banner. This absorbs the race where the keepalive
        // hasn't finished restoring the token yet.
        //
        // Uses hasDataRef (not setState updater) to avoid side-effects inside
        // state updaters — React StrictMode double-invokes updaters.
        if (hasDataRef.current && silentRetryCount.current < MAX_SILENT_RETRIES) {
          silentRetryCount.current += 1;
          if (process.env.NODE_ENV === "development") {
            console.debug(
              `[Dashboard] 401 with cached data — silent retry ${silentRetryCount.current}/${MAX_SILENT_RETRIES}`
            );
          }
          setState((prev) => ({ ...prev, isLoading: false }));
          setTimeout(() => fetchDashboard(false, true), SILENT_RETRY_DELAY_MS);
          return;
        }

        // Exhausted retries or no cached data — surface the error
        silentRetryCount.current = 0;
        setState((prev) => ({
          ...prev,
          error: {
            message: prev.data
              ? "We could not reconnect to the portal. Your last synced records are still shown."
              : "We could not reconnect to the portal. Please try again.",
            code: error.response?.data?.code || "SESSION_RENEWING",
          },
          isLoading: false,
        }));
        return;
      }

      // Transient re-login failure — credentials are still intact, auto-retry
      if (error.response?.status === 503 && error.response?.data?.code === "RELOGIN_FAILED" && !isRetry) {
        setState((prev) => ({
          ...prev,
          error: {
            message: "Refreshing your session… retrying automatically.",
            code: "RELOGIN_FAILED",
          },
          isLoading: true,
        }));
        setTimeout(() => fetchDashboard(true), 3000);
        return;
      }

      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Failed to fetch dashboard";

      setState((prev) => ({
        ...prev,
        error: { message: errorMessage, code: error.response?.data?.code },
        isLoading: false,
      }));
    }
  }, [enrollment]);

  /**
   * Manually invalidate cache
   */
  const invalidateCache = useCallback(async () => {
    if (!enrollment) return;

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      await apiClient.get(
        `/api/dashboard/invalidate?enrollment=${encodeURIComponent(
          enrollment
        )}`
      );
      // Fetch fresh data
      await fetchDashboard();
    } catch (error: any) {
      console.error("[Dashboard] Cache invalidation error:", error);
      if (error.response?.status === 401) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: {
            message: prev.data
              ? "We could not reconnect to the portal. Your last synced records are still shown."
              : "We could not reconnect to the portal. Please try again.",
            code: error.response?.data?.code || "SESSION_RENEWING",
          },
        }));
        return;
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: {
          message: error.response?.data?.error || error.message || "Failed to sync portal data",
          code: error.response?.data?.code,
        },
      }));
    }
  }, [enrollment, fetchDashboard]);

  /**
   * Check cache status
   */
  const checkCacheStatus = useCallback(async () => {
    if (!enrollment) return;

    try {
      const response = await apiClient.get(
        `/api/dashboard/cache-status?enrollment=${encodeURIComponent(
          enrollment
        )}`
      );

      const { cached, ttl } = response.data;
      setState((prev) => ({ ...prev, cached, ttl }));
    } catch {
      // Silently ignore cache status errors
    }
  }, [enrollment]);

  /**
   * Fetch on mount and enrollment change.
   *
   * When we already have localStorage-cached data, defer the first network
   * fetch by SESSION_RECOVERY_GRACE_MS so that `useSessionKeepAlive` (which
   * also fires on mount) has time to call `recoverSession()` and restore the
   * expired CampusLynx token. Without this grace period the dashboard fetch
   * races the keepalive and almost always hits a 401 on tab reopen.
   */
  useEffect(() => {
    // Wait for enrollment to be loaded from localStorage by the parent component.
    // Without this guard, the first render (enrollment = null) would trigger a
    // pointless fetchDashboard() that returns immediately.
    if (!enrollment) return;

    const hasCachedData = !!loadCachedDashboard(enrollment);

    if (hasCachedData && !deferredInitialFetch.current) {
      deferredInitialFetch.current = true;
      const timer = setTimeout(() => {
        fetchDashboard(false, true);
      }, SESSION_RECOVERY_GRACE_MS);

      // Set up periodic cache status check (every 60s)
      const cacheStatusInterval = setInterval(() => {
        checkCacheStatus();
      }, 60000);

      return () => {
        clearTimeout(timer);
        clearInterval(cacheStatusInterval);
        // Reset ref so React StrictMode re-mount correctly re-defers
        deferredInitialFetch.current = false;
      };
    }

    // No cached data — fetch immediately (first visit or cleared storage)
    fetchDashboard();

    // Set up periodic cache status check (every 60s)
    const cacheStatusInterval = setInterval(() => {
      checkCacheStatus();
    }, 60000);

    return () => clearInterval(cacheStatusInterval);
  }, [fetchDashboard, checkCacheStatus, enrollment]);

  /**
   * Auto-refresh when cache is about to expire
   */
  useEffect(() => {
    if (state.ttl > 10 && state.ttl < 60) {
      const refreshTimer = setTimeout(() => {
        fetchDashboard();
      }, (state.ttl - 10) * 1000);

      return () => clearTimeout(refreshTimer);
    }
  }, [state.ttl, fetchDashboard]);

  return {
    ...state,
    refresh: fetchDashboard,
    invalidateCache,
    checkCacheStatus,
  };
}

