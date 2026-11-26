"use client";

import { useState, useEffect, useCallback } from "react";
import { postEncrypted } from "@/lib/portalClient";
import {
  fetchExamSchedule,
  type ExamMetadataCache,
} from "@/lib/portalExam";
import { loadSession } from "@/lib/session";
import { PortalError, SessionExpiredError } from "@/lib/errors";
import { getCached, setCached, sessionCacheKey } from "@/lib/featureCache";
import type { ExamScheduleResponse } from "@/types";

export interface ExamScheduleState {
  data: ExamScheduleResponse | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

const EXAM_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedMetadata: ExamMetadataCache | null = null;
const inFlightExamPromises = new Map<string, Promise<ExamScheduleResponse>>();

export function clearExamCache(): void {
  cachedMetadata = null;
  inFlightExamPromises.clear();
}

function examCacheKey(enrollment: string, eventId?: string | null): string {
  return sessionCacheKey("exam", enrollment, eventId || "default");
}

export function useExamSchedule() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [state, setState] = useState<ExamScheduleState>(() => {
    const session = loadSession();
    if (session?.enrollment) {
      const entry = getCached<ExamScheduleResponse>(examCacheKey(session.enrollment, null));
      if (entry) {
        return {
          data: entry.data,
          isLoading: false,
          error: null,
        };
      }
    }
    return {
      data: null,
      isLoading: true,
      error: null,
    };
  });

  const fetchSchedule = useCallback(
    async (eventId?: string | null, force = false) => {
      const activeEventId = eventId !== undefined ? eventId : selectedEventId;
      const session = loadSession();
      if (!session?.token || !session?.instituteid) {
        setState((prev) => ({
          ...prev,
          error: {
            message: "Session expired. Please log in again.",
            code: "SESSION_EXPIRED",
          },
          isLoading: false,
        }));
        return;
      }

      const key = examCacheKey(session.enrollment, activeEventId);
      const entry = getCached<ExamScheduleResponse>(key);
      if (!force && entry && Date.now() - entry.ts < EXAM_CACHE_TTL_MS) {
        setState({
          data: entry.data,
          isLoading: false,
          error: null,
        });
        return;
      }

      try {
        setState((prev) => ({
          ...prev,
          data: prev.data ?? entry?.data ?? null,
          isLoading: !prev.data && !entry?.data,
          error: null,
        }));

        let promise = inFlightExamPromises.get(key);
        if (!promise) {
          promise = fetchExamSchedule(
            { postEncrypted: (path, payload) => postEncrypted(path, payload) },
            session,
            {
              exameventid: activeEventId || undefined,
              cachedMetadata,
              onMetadataResolved: (meta) => {
                cachedMetadata = meta;
              },
            }
          ).finally(() => {
            inFlightExamPromises.delete(key);
          });
          inFlightExamPromises.set(key, promise);
        }

        const responseData = await promise;
        setCached(key, responseData);

        setState({
          data: responseData,
          isLoading: false,
          error: null,
        });
      } catch (error: unknown) {
        if (
          error instanceof SessionExpiredError ||
          (error instanceof PortalError && error.httpStatus === 401)
        ) {
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
          error instanceof Error ? error.message : "Failed to fetch exam schedule";
        const errorCode = error instanceof PortalError ? error.code : undefined;

        setState((prev) => ({
          ...prev,
          error: { message: errorMessage, code: errorCode },
          isLoading: false,
        }));
      }
    },
    [selectedEventId]
  );

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
