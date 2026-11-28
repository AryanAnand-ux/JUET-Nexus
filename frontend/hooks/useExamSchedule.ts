"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { postEncrypted } from "@/lib/portalClient";
import {
  fetchExamSchedule,
  type ExamMetadataCache,
} from "@/lib/portalExam";
import { loadSession } from "@/lib/session";
import { PortalError, SessionExpiredError } from "@/lib/errors";
import { getCached, setCached, sessionCacheKey } from "@/lib/featureCache";
import type { ExamScheduleResponse, ExamSemester } from "@/types";

export interface ExamScheduleState {
  data: ExamScheduleResponse | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

export interface ExamSelectionInput {
  semesterId: string;
  /** Omitted when a new semester is applied; the ERP default event is used. */
  eventId?: string;
}

interface Selection {
  registrationId: string | null;
  eventId: string | null;
}

const EXAM_CACHE_TTL_MS = 10 * 60 * 1000;
const EXAM_METADATA_TTL_MS = 10 * 60 * 1000;

let cachedSemesters: ExamSemester[] | null = null;
let cachedSemestersAt = 0;
const metadataByRegistration = new Map<string, ExamMetadataCache>();
const inFlightExamPromises = new Map<string, Promise<ExamScheduleResponse>>();

export function clearExamCache(): void {
  cachedSemesters = null;
  cachedSemestersAt = 0;
  metadataByRegistration.clear();
  inFlightExamPromises.clear();
}

function examCacheKey(
  enrollment: string,
  registrationId?: string | null,
  eventId?: string | null
): string {
  return sessionCacheKey(
    "exam",
    enrollment,
    registrationId || "default",
    eventId || "default"
  );
}

/** Pre-change key, kept only so existing cached schedules are not lost. */
function legacyExamCacheKey(enrollment: string, eventId?: string | null): string {
  return sessionCacheKey("exam", enrollment, eventId || "default");
}

function readInitialExamData(): ExamScheduleResponse | null {
  const session = loadSession();
  if (!session?.enrollment) return null;
  const current = getCached<ExamScheduleResponse>(examCacheKey(session.enrollment));
  if (current) return current.data;
  const legacy = getCached<ExamScheduleResponse>(
    legacyExamCacheKey(session.enrollment)
  );
  return legacy?.data ?? null;
}

function isFresh(timestamp: number, ttl = EXAM_METADATA_TTL_MS): boolean {
  return timestamp > 0 && Date.now() - timestamp < ttl;
}

export function useExamSchedule() {
  const [state, setState] = useState<ExamScheduleState>(() => {
    const data = readInitialExamData();
    return data
      ? { data, isLoading: false, error: null }
      : { data: null, isLoading: true, error: null };
  });

  // Explicit selections made by the user. Null means "use the ERP default".
  const [selection, setSelection] = useState<Selection>(() => {
    const data = readInitialExamData();
    return {
      registrationId: data?.registrationid ?? null,
      eventId: data?.exameventid ?? null,
    };
  });

  // Resolved values from the last successful ERP response. Used as fallbacks
  // so the first load does not need a second fetch just to learn the default.
  const resolvedRef = useRef<Selection>({
    registrationId: selection.registrationId,
    eventId: selection.eventId,
  });

  const fetchSchedule = useCallback(
    async (force = false) => {
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

      const registrationId =
        selection.registrationId ?? resolvedRef.current.registrationId ?? undefined;
      const eventId = selection.eventId ?? resolvedRef.current.eventId ?? undefined;

      const key = examCacheKey(session.enrollment, registrationId, eventId);
      const flightKey = force ? `${key}:force` : key;
      const entry = force
        ? null
        : getCached<ExamScheduleResponse>(key) ??
          getCached<ExamScheduleResponse>(
            legacyExamCacheKey(session.enrollment, eventId)
          );

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

        let promise = inFlightExamPromises.get(flightKey);
        if (!promise) {
          const metadata = registrationId
            ? metadataByRegistration.get(registrationId)
            : undefined;
          const freshMetadata =
            metadata && isFresh(metadata.ts ?? 0) ? metadata : undefined;
          const freshSemesters =
            cachedSemesters && isFresh(cachedSemestersAt)
              ? cachedSemesters
              : undefined;

          promise = fetchExamSchedule(
            { postEncrypted: (path, payload) => postEncrypted(path, payload) },
            session,
            {
              registrationid: registrationId,
              exameventid: eventId,
              cachedSemesters: freshSemesters,
              cachedMetadata: freshMetadata,
              force,
              onSemestersResolved: (semesters) => {
                cachedSemesters = semesters;
                cachedSemestersAt = Date.now();
              },
              onMetadataResolved: (meta) => {
                metadataByRegistration.set(meta.registrationid, {
                  ...meta,
                  ts: Date.now(),
                });
              },
            }
          )
            .then((data) => {
              resolvedRef.current = {
                registrationId: data.registrationid ?? null,
                eventId: data.exameventid ?? null,
              };
              return data;
            })
            .finally(() => {
              inFlightExamPromises.delete(flightKey);
            });

          inFlightExamPromises.set(flightKey, promise);
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
    [selection]
  );

  useEffect(() => {
    void fetchSchedule(false);
  }, [fetchSchedule]);

  /**
   * Apply a semester/exam-type selection. Changing semester invalidates the
   * previous exam-type choice because exam event IDs are semester-scoped.
   */
  const applySelection = useCallback((next: ExamSelectionInput) => {
    const semesterChanged = next.semesterId !== resolvedRef.current.registrationId;
    const nextEventId = semesterChanged
      ? null
      : next.eventId || resolvedRef.current.eventId;

    if (!semesterChanged && nextEventId === resolvedRef.current.eventId) return;

    resolvedRef.current = {
      registrationId: next.semesterId,
      eventId: nextEventId,
    };
    setSelection({
      registrationId: next.semesterId,
      eventId: nextEventId,
    });
  }, []);

  const selectSemester = useCallback(
    (semesterId: string) => applySelection({ semesterId }),
    [applySelection]
  );

  const selectEvent = useCallback(
    (eventId: string) => {
      const semesterId = resolvedRef.current.registrationId;
      if (!semesterId) return;
      applySelection({ semesterId, eventId });
    },
    [applySelection]
  );

  const refresh = useCallback(() => fetchSchedule(true), [fetchSchedule]);

  return {
    ...state,
    selectedSemesterId:
      selection.registrationId ?? state.data?.registrationid ?? "",
    selectedEventId: selection.eventId ?? state.data?.exameventid ?? "",
    applySelection,
    selectSemester,
    selectEvent,
    refresh,
  };
}
