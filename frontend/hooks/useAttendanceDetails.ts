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

// Re-export cache utilities for consumers
export {
  detailsMemoryCache,
  inFlightDetailsRequests,
  CLIENT_CACHE_TTL_MS,
  CLIENT_STALE_THRESHOLD_MS,
  getAttendanceStorageKey,
  getStoredAttendanceDetail,
  setStoredAttendanceDetail,
  clearAttendanceDetailCache,
  fetchAttendanceDetailDirect,
} from "@/utils/attendanceCache";
import {
  getStoredAttendanceDetail,
  fetchAttendanceDetailDirect,
} from "@/utils/attendanceCache";

export function useAttendanceDetails(
  subject: string,
  link: string | null
) {
  const [state, setState] = useState<AttendanceDetailsState>(() => {
    if (!subject || !link) {
      return {
        data: null,
        isLoading: false,
        isRetrying: false,
        error: null,
      };
    }

    const cached = getStoredAttendanceDetail(subject, link);
    if (cached) {
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

      // Check client cache if not retrying
      if (!isRetry) {
        const cached = getStoredAttendanceDetail(subject, link);
        if (cached) {
          // Immediately display cached data
          setState((prev) => ({
            ...prev,
            data: cached.data,
            isLoading: false,
            isRetrying: false,
            error: null,
          }));

          // If cache is still within the fresh window, no background refresh needed
          if (!cached.isStale) {
            return;
          }
        }
      }

      // Avoid overlapping requests in the same component
      if (inFlightRef.current && !isRetry) {
        return;
      }

      // Cancel previous component controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      inFlightRef.current = true;

      // Only show full loading spinner if we have no existing cached data to display
      setState((prev) => ({
        ...prev,
        isLoading: !prev.data,
        isRetrying: isRetry,
        error: null,
      }));

      try {
        const enrollment = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
        const responseData = await fetchAttendanceDetailDirect(
          subject,
          link,
          enrollment,
          isRetry,
          controller.signal
        );

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
