"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/utils/api";
import type { GradeCardResponse } from "@/types";

export interface GradesState {
  data: GradeCardResponse[] | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

interface GradesCache {
  data: GradeCardResponse[];
  timestamp: number;
}

let cachedGrades: GradesCache | null = null;
let inFlightGradesPromise: Promise<GradeCardResponse[]> | null = null;
const GRADES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function useGrades() {
  const [state, setState] = useState<GradesState>(() => {
    if (cachedGrades && Date.now() - cachedGrades.timestamp < GRADES_CACHE_TTL_MS) {
      return {
        data: cachedGrades.data,
        isLoading: false,
        error: null,
      };
    }
    return {
      data: null,
      isLoading: true,
      error: null,
    };
  });

  const fetchGrades = useCallback(async (force = false) => {
    if (!force && cachedGrades && Date.now() - cachedGrades.timestamp < GRADES_CACHE_TTL_MS) {
      setState({
        data: cachedGrades.data,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: !prev.data, error: null }));

      let responseData: GradeCardResponse[];

      if (inFlightGradesPromise) {
        responseData = await inFlightGradesPromise;
      } else {
        inFlightGradesPromise = (async () => {
          const response = await apiClient.get("/api/grades");
          return response.data.data;
        })();

        try {
          responseData = await inFlightGradesPromise;
        } finally {
          inFlightGradesPromise = null;
        }
      }

      cachedGrades = {
        data: responseData,
        timestamp: Date.now(),
      };

      setState({
        data: responseData,
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
    refresh: () => fetchGrades(true),
  };
}
