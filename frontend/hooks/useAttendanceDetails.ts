"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { apiClient } from "@/utils/api";
import axios from "axios";
import type { AttendanceDetailsResponse } from "@/types";

export interface AttendanceDetailsState {
  data: AttendanceDetailsResponse | null;
  isLoading: boolean;
  isRetrying: boolean;
  error: { message: string; code?: string } | null;
}

// In-memory module-level cache: key is `${subject}:${link}`
interface CacheItem {
  data: AttendanceDetailsResponse;
  timestamp: number;
}
const detailsMemoryCache = new Map<string, CacheItem>();
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useAttendanceDetails(
  subject: string,
  link: string | null
) {
  const [state, setState] = useState<AttendanceDetailsState>(() => {
    const cacheKey = subject && link ? `${subject}:${link}` : null;
    const cached = cacheKey ? detailsMemoryCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
      return {
        data: cached.data,
        isLoading: false,
        isRetrying: false,
        error: null,
      };
    }
    return {
      data: null,
      isLoading: true,
      isRetrying: false,
      error: null,
    };
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const fetchDetails = useCallback(
    async (isRetry = false) => {
      if (!subject || !link) {
        setState((prev) => ({
          ...prev,
          error: { message: "Missing subject details link" },
          isLoading: false,
          isRetrying: false,
        }));
        return;
      }

      const cacheKey = `${subject}:${link}`;

      // If not retrying, check client memory cache
      if (!isRetry) {
        const cached = detailsMemoryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
          setState({
            data: cached.data,
            isLoading: false,
            isRetrying: false,
            error: null,
          });
          return;
        }
      }

      // Avoid overlapping duplicate requests
      if (inFlightRef.current && !isRetry) {
        return;
      }

      // Cancel any existing in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      inFlightRef.current = true;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        isRetrying: isRetry,
        error: null,
      }));

      try {
        const queryParams = new URLSearchParams({
          subject,
          link,
        });
        if (isRetry) {
          queryParams.set("refresh", "true");
        }

        const response = await apiClient.get(
          `/api/attendance/details?${queryParams.toString()}`,
          {
            signal: controller.signal,
            timeout: 60000,
          }
        );

        const responseData: AttendanceDetailsResponse = response.data.data;

        // Cache the successful result
        detailsMemoryCache.set(cacheKey, {
          data: responseData,
          timestamp: Date.now(),
        });

        setState({
          data: responseData,
          isLoading: false,
          isRetrying: false,
          error: null,
        });
      } catch (error: any) {
        // If aborted by a new request or unmount, ignore
        if (axios.isCancel(error) || error?.name === "CanceledError" || controller.signal.aborted) {
          return;
        }

        if (error.response?.status === 401 || error.response?.data?.code === "SESSION_EXPIRED") {
          setState((prev) => ({
            ...prev,
            error: {
              message: "Your session has expired. Please log in again to view attendance logs.",
              code: "SESSION_EXPIRED",
            },
            isLoading: false,
            isRetrying: false,
          }));
          return;
        }

        const isTimeout =
          error.code === "ECONNABORTED" ||
          error.response?.status === 504 ||
          error.response?.data?.code === "ATTENDANCE_TIMEOUT" ||
          /timeout/i.test(error.message || "");

        if (isTimeout) {
          setState((prev) => ({
            ...prev,
            error: {
              message:
                "The attendance service timed out. The university portal may be under heavy load. Tap retry to try again.",
              code: "ATTENDANCE_TIMEOUT",
            },
            isLoading: false,
            isRetrying: false,
          }));
          return;
        }

        const isNetworkError =
          !error.response &&
          (error.code === "ERR_NETWORK" || /network/i.test(error.message || ""));

        const userMessage = isNetworkError
          ? "Unable to reach the server. Please check your internet connection."
          : error.response?.data?.error ||
            "Unable to load attendance logs at this time. Please try again.";

        setState((prev) => ({
          ...prev,
          error: {
            message: userMessage,
            code: error.response?.data?.code || "ATTENDANCE_FETCH_FAILED",
          },
          isLoading: false,
          isRetrying: false,
        }));
      } finally {
        inFlightRef.current = false;
      }
    },
    [subject, link]
  );

  useEffect(() => {
    return () => {
      // Abort in-flight requests on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    fetchDetails,
  };
}
