"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/utils/api";
import type { ExamScheduleResponse } from "@/types";

export interface ExamScheduleState {
  data: ExamScheduleResponse | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

interface ExamCache {
  data: ExamScheduleResponse;
  timestamp: number;
  eventId: string | null;
}

let cachedExamSchedule: ExamCache | null = null;
let inFlightExamPromise: Promise<ExamScheduleResponse> | null = null;
let inFlightEventId: string | null | undefined = undefined;
const EXAM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function useExamSchedule() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [state, setState] = useState<ExamScheduleState>(() => {
    if (
      cachedExamSchedule &&
      cachedExamSchedule.eventId === null &&
      Date.now() - cachedExamSchedule.timestamp < EXAM_CACHE_TTL_MS
    ) {
      return {
        data: cachedExamSchedule.data,
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

  const fetchSchedule = useCallback(async (eventId?: string | null, force = false) => {
    const activeEventId = eventId !== undefined ? eventId : selectedEventId;

    if (
      !force &&
      cachedExamSchedule &&
      cachedExamSchedule.eventId === (activeEventId || null) &&
      Date.now() - cachedExamSchedule.timestamp < EXAM_CACHE_TTL_MS
    ) {
      setState({
        data: cachedExamSchedule.data,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: !prev.data, error: null }));

      let responseData: ExamScheduleResponse;

      if (inFlightExamPromise && inFlightEventId === activeEventId) {
        responseData = await inFlightExamPromise;
      } else {
        inFlightEventId = activeEventId;
        inFlightExamPromise = (async () => {
          const params: Record<string, string> = {};
          if (activeEventId) {
            params.eventId = activeEventId;
          }

          const response = await apiClient.get(`/api/exam`, {
            params: Object.keys(params).length > 0 ? params : undefined,
            timeout: 60000,
          });

          return response.data.data;
        })();

        try {
          responseData = await inFlightExamPromise;
        } finally {
          inFlightExamPromise = null;
          inFlightEventId = undefined;
        }
      }

      cachedExamSchedule = {
        data: responseData,
        timestamp: Date.now(),
        eventId: activeEventId || null,
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
    refresh: () => fetchSchedule(selectedEventId, true),
  };
}
