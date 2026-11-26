"use client";

import { useState, useEffect, useCallback } from "react";
import { postEncrypted } from "@/lib/portalClient";
import { fetchGradeCard } from "@/lib/portalGrades";
import { loadSession } from "@/lib/session";
import { PortalError, SessionExpiredError } from "@/lib/errors";
import { getCached, setCached, sessionCacheKey } from "@/lib/featureCache";
import type { GradeCardResponse } from "@/types";

export interface GradesState {
  data: GradeCardResponse[] | null;
  isLoading: boolean;
  error: { message: string; code?: string } | null;
}

const GRADES_CACHE_TTL_MS = 10 * 60 * 1000;
let inFlightGradesPromise: Promise<GradeCardResponse[]> | null = null;

export function useGrades() {
  const [state, setState] = useState<GradesState>(() => {
    const session = loadSession();
    if (session?.enrollment) {
      const entry = getCached<GradeCardResponse[]>(
        sessionCacheKey("grades", session.enrollment)
      );
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

  const fetchGrades = useCallback(async (force = false) => {
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

    const key = sessionCacheKey("grades", session.enrollment);
    const entry = getCached<GradeCardResponse[]>(key);
    if (!force && entry && Date.now() - entry.ts < GRADES_CACHE_TTL_MS) {
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

      let responseData: GradeCardResponse[];
      if (inFlightGradesPromise) {
        responseData = await inFlightGradesPromise;
      } else {
        inFlightGradesPromise = fetchGradeCard(
          { postEncrypted: (path, payload) => postEncrypted(path, payload) },
          session
        ).finally(() => {
          inFlightGradesPromise = null;
        });
        responseData = await inFlightGradesPromise;
      }

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
            message: "Grade card temporarily unavailable from portal.",
            code: "SESSION_RENEWING",
          },
          isLoading: false,
        }));
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch grade card";
      const errorCode = error instanceof PortalError ? error.code : undefined;

      setState((prev) => ({
        ...prev,
        error: { message: errorMessage, code: errorCode },
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
