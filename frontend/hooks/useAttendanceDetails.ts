"use client";

import { useState, useCallback } from "react";
import { apiClient } from "@/utils/api";
import type { AttendanceDetailsResponse } from "@/types";

export interface AttendanceDetailsState {
  data: AttendanceDetailsResponse | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

export function useAttendanceDetails(
  subject: string,
  link: string | null
) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const [state, setState] = useState<AttendanceDetailsState>({
    data: null,
    isLoading: true,
    error: null,
  });

  const fetchDetails = useCallback(async (isRetry = false) => {
    if (!subject || !link) {
      setState((prev) => ({
        ...prev,
        error: { message: "Missing subject details link" },
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
        `/api/attendance/details?subject=${encodeURIComponent(
          subject
        )}&link=${encodeURIComponent(link)}`,
        {
          headers,
          timeout: 60000,
        }
      );

      setState({
        data: response.data.data,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        setState((prev) => ({
          ...prev,
          error: {
            message: "Session expired. Please log in again to view attendance logs.",
            code: "SESSION_EXPIRED",
          },
          isLoading: false,
        }));
        return;
      }

      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Failed to fetch attendance details";

      setState((prev) => ({
        ...prev,
        error: { message: errorMessage, code: error.response?.data?.code },
        isLoading: false,
      }));
    }
  }, [subject, link, API_URL]);

  return {
    ...state,
    fetchDetails,
  };
}
