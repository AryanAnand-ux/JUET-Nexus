/**
 * useDashboard Hook
 * Fetch and manage dashboard data from backend
 */

"use client";

import { useState, useEffect, useCallback } from "react";
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

export function useDashboard(enrollment: string | null): UseDashboardReturn {
  const [state, setState] = useState<DashboardState>({
    data: null,
    isLoading: true,
    error: null,
    cached: false,
    ttl: 0,
    cachedAt: null,
  });

  /**
   * Fetch dashboard data
   */
  const fetchDashboard = useCallback(async (isRetry = false) => {
    if (!enrollment) {
      setState((prev) => ({
        ...prev,
        error: { message: "Enrollment not available" },
        isLoading: false,
      }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await apiClient.get(
        `/api/dashboard?enrollment=${encodeURIComponent(enrollment)}`,
        {
          timeout: 60000,
        }
      );

      const { data, cached, ttl } = response.data;
      const cacheHeader = response.headers["x-cache"];
      setState((prev) => ({
        ...prev,
        data,
        cached: cacheHeader === "hit",
        ttl: ttl || 0,
        cachedAt: response.data?.fetchedAt ? new Date(response.data.fetchedAt) : new Date(),
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
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: {
          message: error.response?.data?.error || error.message || "Failed to sync portal data",
          code: error.response?.data?.code
        }
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
   * Fetch on mount and enrollment change
   */
  useEffect(() => {
    fetchDashboard();

    // Set up periodic cache status check (every 60s)
    const cacheStatusInterval = setInterval(() => {
      checkCacheStatus();
    }, 60000);

    return () => clearInterval(cacheStatusInterval);
  }, [fetchDashboard, checkCacheStatus]);

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
