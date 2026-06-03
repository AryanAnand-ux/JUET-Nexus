"use client";

import { useState, useCallback } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

      const response = await axios.get(
        `${API_URL}/api/attendance/details?subject=${encodeURIComponent(
          subject
        )}&link=${encodeURIComponent(link)}`,
        {
          withCredentials: true,
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
            message: "Session expired. Please login again.",
            code: "UNAUTHORIZED",
          },
          isLoading: false,
        }));
        setTimeout(() => router.push("/login"), 2000);
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
  }, [subject, link, API_URL, router]);

  return {
    ...state,
    fetchDetails,
  };
}
