"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/utils/api";
import type { GradeCardResponse } from "@/types";

export interface GradesState {
  data: GradeCardResponse[] | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

export function useGrades() {
  const [state, setState] = useState<GradesState>({
    data: null,
    isLoading: true,
    error: null,
  });

  const fetchGrades = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await apiClient.get("/api/grades");

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
            message: "Grade card temporarily unavailable from portal.",
            code: "SESSION_RENEWING",
          },
          isLoading: false,
        }));
        return;
      }

      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Failed to fetch grade card";

      setState((prev) => ({
        ...prev,
        error: { message: errorMessage, code: error.response?.data?.code },
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  return {
    ...state,
    refresh: fetchGrades,
  };
}
