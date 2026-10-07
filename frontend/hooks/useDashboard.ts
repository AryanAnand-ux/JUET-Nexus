/**
 * useDashboard Hook
 * Fetch and manage dashboard data from backend
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const router = useRouter();

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

      const sessionToken = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : null;
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers["x-session-token"] = sessionToken;
      }

      const response = await apiClient.get(
        `/api/dashboard?enrollment=${encodeURIComponent(enrollment)}`,
        {
          headers,
          timeout: 60000,
        }
      );

      const { data, cached, ttl } = response.data;
      const cacheHeader = response.headers["x-cache"];
      const renewedToken = response.headers["x-session-token"];
      if (renewedToken && typeof window !== "undefined") {
        localStorage.setItem("sessionToken", renewedToken);
      }

      setState((prev) => ({
        ...prev,
        data,
        cached: cacheHeader === "hit",
        ttl: ttl || 0,
        cachedAt: new Date(),
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
        // Zero spontaneous logouts: never wipe localStorage or force redirect to login on background 401
        setState((prev) => ({
          ...prev,
          error: {
            message: "Portal session is syncing in background. Your records remain safe.",
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
  }, [enrollment, API_URL]);

  /**
   * Manually invalidate cache
   */
  const invalidateCache = useCallback(async () => {
    if (!enrollment) return;

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const sessionToken = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : null;
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers["x-session-token"] = sessionToken;
      }
      await apiClient.get(
        `/api/dashboard/invalidate?enrollment=${encodeURIComponent(
          enrollment
        )}`,
        { headers }
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
    } catch (error) {
      console.error("[Dashboard] Cache status check error:", error);
    }
  }, [enrollment, API_URL]);

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
