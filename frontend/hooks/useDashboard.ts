/**
 * useDashboard Hook
 * Fetch and manage dashboard data from backend
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
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

      const response = await axios.get(
        `${API_URL}/api/dashboard?enrollment=${encodeURIComponent(enrollment)}`,
        {
          withCredentials: true,
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
        const code = error.response?.data?.code;

        // Cookie is genuinely absent or corrupted — must re-authenticate
        if (code === "NO_SESSION" || code === "INVALID_SESSION" || code === "NO_CAMPUSLYNX_SESSION") {
          if (typeof window !== "undefined") {
            localStorage.removeItem("enrollment");
            localStorage.removeItem("role");
          }
          router.push("/login");
          return;
        }

        // Token expired but cookie exists — session keepalive will handle renewal
        // Show a non-destructive error so user can retry manually
        setState((prev) => ({
          ...prev,
          error: {
            message: "Portal session is renewing. Please wait a moment and tap sync.",
            code: "SESSION_RENEWING",
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
      await axios.get(
        `${API_URL}/api/dashboard/invalidate?enrollment=${encodeURIComponent(
          enrollment
        )}`,
        { withCredentials: true }
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
  }, [enrollment, API_URL, fetchDashboard]);

  /**
   * Check cache status
   */
  const checkCacheStatus = useCallback(async () => {
    if (!enrollment) return;

    try {
      const response = await axios.get(
        `${API_URL}/api/dashboard/cache-status?enrollment=${encodeURIComponent(
          enrollment
        )}`,
        { withCredentials: true }
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
