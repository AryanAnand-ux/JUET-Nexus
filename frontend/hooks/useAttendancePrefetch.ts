"use client";

import { useEffect, useRef, useState } from "react";
import type { AttendanceRecord } from "@/types";
import {
  fetchAttendanceDetailDirect,
  getStoredAttendanceDetail,
} from "@/utils/attendanceCache";

export interface AttendancePrefetchStatus {
  isPrefetching: boolean;
  total: number;
  completed: number;
  failed: number;
}

const MAX_CONCURRENT_PREFETCH = 2; // Optimal concurrency for CampusLynx session stability
const INITIAL_PREFETCH_DELAY_MS = 1500; // Defer past initial hydration & active route paint
const TASK_STAGGER_MS = 150; // Stagger between requests to prevent upstream session locks
const REVALIDATE_THROTTLE_MS = 10 * 60 * 1000; // Throttle focus/visibility re-scans to 10 minutes

function isSlowOrSaveDataConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

/**
 * useAttendancePrefetch
 * Automatically preloads detailed day-by-day attendance logs for all current-semester
 * courses in the background with concurrency control, smart prioritization, and deduplication.
 */
export function useAttendancePrefetch(
  attendanceRecords: AttendanceRecord[] | undefined,
  enrollment: string | null,
  enabled = true
): AttendancePrefetchStatus {
  const [status, setStatus] = useState<AttendancePrefetchStatus>({
    isPrefetching: false,
    total: 0,
    completed: 0,
    failed: 0,
  });

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeEnrollmentRef = useRef<string | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const lastRevalidateAtRef = useRef<number>(0);

  // Listen to visibilitychange, focus, and custom dashboard updates
  useEffect(() => {
    if (!enabled) return;

    const handleRevalidate = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastRevalidateAtRef.current < REVALIDATE_THROTTLE_MS) return;
        lastRevalidateAtRef.current = now;
        setRefreshTrigger((prev) => prev + 1);
      }
    };

    const handleDashboardUpdated = () => {
      lastRevalidateAtRef.current = Date.now();
      setRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener("visibilitychange", handleRevalidate);
    window.addEventListener("focus", handleRevalidate);
    window.addEventListener("juet:dashboard-updated", handleDashboardUpdated);

    return () => {
      window.removeEventListener("visibilitychange", handleRevalidate);
      window.removeEventListener("focus", handleRevalidate);
      window.removeEventListener("juet:dashboard-updated", handleDashboardUpdated);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !enrollment || isSlowOrSaveDataConnection()) return;

    const normalizedEnrollment = enrollment.trim().toUpperCase();

    // 1. Resolve records: use passed records, or recover from local dashboard cache if available
    let records = attendanceRecords;
    if (!records || records.length === 0) {
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(`juet_dashboard_cache_v3_${normalizedEnrollment}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.data?.attendance) && parsed.data.attendance.length > 0) {
              records = parsed.data.attendance;
            }
          }
        } catch {}
      }
    }

    if (!records || records.length === 0) return;

    // Filter to subjects that have an ERP detail link
    const eligibleRecords = records.filter(
      (r) => typeof r.detailLink === "string" && r.detailLink.trim().length > 0
    );

    if (eligibleRecords.length === 0) return;

    // If already running for this exact enrollment without new refresh trigger, let it continue
    if (isRunningRef.current && activeEnrollmentRef.current === normalizedEnrollment && refreshTrigger === 0) {
      return;
    }

    // Abort prior run if enrollment changed
    if (abortControllerRef.current && activeEnrollmentRef.current !== normalizedEnrollment) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeEnrollmentRef.current = normalizedEnrollment;
    isRunningRef.current = true;

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;

      // Classify records by cache status
      const missingCache: AttendanceRecord[] = [];
      const staleCache: AttendanceRecord[] = [];

      eligibleRecords.forEach((record) => {
        const cached = getStoredAttendanceDetail(
          record.subject,
          record.detailLink!,
          normalizedEnrollment
        );
        if (!cached) {
          missingCache.push(record);
        } else if (cached.isStale) {
          staleCache.push(record);
        }
      });

      // Priority queue: courses with NO cache first, then courses with stale cache
      const queue = [...missingCache, ...staleCache];

      if (queue.length === 0) {
        setStatus({
          isPrefetching: false,
          total: eligibleRecords.length,
          completed: eligibleRecords.length,
          failed: 0,
        });
        isRunningRef.current = false;
        return;
      }

      setStatus({
        isPrefetching: true,
        total: queue.length,
        completed: 0,
        failed: 0,
      });

      let queueIndex = 0;
      let completedCount = 0;
      let failedCount = 0;
      let sessionExpired = false;

      // Worker consuming tasks from queue
      const worker = async () => {
        while (queueIndex < queue.length && !controller.signal.aborted && !sessionExpired) {
          const currentIndex = queueIndex++;
          const item = queue[currentIndex];
          if (!item || !item.detailLink) continue;

          try {
            await fetchAttendanceDetailDirect(
              item.subject,
              item.detailLink,
              normalizedEnrollment,
              false,
              controller.signal
            );
            completedCount++;
          } catch (err: any) {
            failedCount++;
            if (
              err?.response?.status === 401 ||
              err?.response?.data?.code === "SESSION_EXPIRED"
            ) {
              sessionExpired = true;
            }
          } finally {
            if (!controller.signal.aborted) {
              setStatus((prev) => ({
                ...prev,
                completed: completedCount,
                failed: failedCount,
              }));
            }
          }

          // Small stagger between tasks to keep network connection healthy
          if (TASK_STAGGER_MS > 0 && !controller.signal.aborted) {
            await new Promise((r) => setTimeout(r, TASK_STAGGER_MS));
          }
        }
      };

      const workerCount = Math.min(MAX_CONCURRENT_PREFETCH, queue.length);
      const workers = Array.from({ length: workerCount }, () => worker());

      await Promise.allSettled(workers);

      if (!controller.signal.aborted) {
        setStatus((prev) => ({
          ...prev,
          isPrefetching: false,
        }));
        isRunningRef.current = false;
      }
    }, INITIAL_PREFETCH_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      isRunningRef.current = false;
    };
  }, [attendanceRecords, enrollment, refreshTrigger, enabled]);

  return status;
}
