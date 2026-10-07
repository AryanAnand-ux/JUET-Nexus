"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/utils/api";
import type { ExamScheduleResponse } from "@/types";

export interface ExamScheduleState {
  data: ExamScheduleResponse | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

export function useExamSchedule() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [state, setState] = useState<ExamScheduleState>({
    data: null,
    isLoading: true,
    error: null,
  });

  const fetchSchedule = useCallback(async (eventId?: string | null) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const sessionToken = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : null;
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers["x-session-token"] = sessionToken;
      }

      const activeEventId = eventId !== undefined ? eventId : selectedEventId;
      const params: Record<string, string> = {};
      if (activeEventId) {
        params.eventId = activeEventId;
      }

      const response = await apiClient.get(`/api/exam`, {
        params: Object.keys(params).length > 0 ? params : undefined,
        headers,
        timeout: 60000,
      });

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
            message: "Exam schedule temporarily unavailable from portal.",
            code: "SESSION_RENEWING",
          },
          isLoading: false,
        }));
        return;
      }

      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Failed to fetch exam schedule";

      setState((prev) => ({
        ...prev,
        error: { message: errorMessage, code: error.response?.data?.code },
        isLoading: false,
      }));
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchSchedule(selectedEventId);
  }, [fetchSchedule, selectedEventId]);

  const selectEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
  }, []);

  return {
    ...state,
    selectedEventId,
    selectEvent,
    refresh: () => fetchSchedule(selectedEventId),
  };
}
