"use client";

import { useEffect, useRef, useState } from "react";
import type { AttendanceRecord } from "@/types";
import { PortalError, SessionExpiredError } from "@/lib/errors";
import {
  computeAttendanceChecksum,
  fetchAttendanceDetailDirect,
  getStoredAttendanceDetail,
} from "@/utils/attendanceCache";

export interface AttendancePrefetchStatus {
  isPrefetching: boolean;
  total: number;
  completed: number;
  failed: number;
}

const MAX_CONCURRENT_PREFETCH = 3; // Prefetch up to 3 subjects in parallel
const INITIAL_PREFETCH_DELAY_MS = 300; // Short settle delay after overview renders
const TASK_STAGGER_MS = 0;

// Module-level guard so navigating between routes does NOT re-trigger prefetch;
// only fresh app open, login, or an explicit dashboard refresh (`juet:dashboard-updated`)
// resets this.
let completedPrefetchEnrollment: string | null = null;

// Live set of subjects currently queued/fetching in background prefetch
let currentPendingSubjects = new Set<string>();
const pendingListeners = new Set<(subjects: Set<string>) => void>();

function publishPendingSubjects(next: Set<string>): void {
  currentPendingSubjects = next;
  pendingListeners.forEach((listener) => listener(next));
}

export function subscribePrefetchSubjects(
  listener: (subjects: Set<string>) => void
): () => void {
  pendingListeners.add(listener);
  listener(currentPendingSubjects);
  return () => {
    pendingListeners.delete(listener);
  };
}

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

  // Only re-scan subjects when dashboard data is refreshed (login, app reopen, or Refresh button)
  useEffect(() => {
    if (!enabled) return;

    const handleDashboardUpdated = () => {
      completedPrefetchEnrollment = null;
      setRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener("juet:dashboard-updated", handleDashboardUpdated);

    return () => {
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
        } catch { }
      }
    }

    if (!records || records.length === 0) return;

    // Filter to subjects that have an ERP detail link
    const eligibleRecords = records.filter(
      (r) => typeof r.detailLink === "string" && r.detailLink.trim().length > 0
    );

    if (eligibleRecords.length === 0) return;

    // If prefetch already completed in this app session (e.g. user is just navigating
    // between routes), do not re-trigger it.
    if (completedPrefetchEnrollment === normalizedEnrollment && refreshTrigger === 0) {
      return;
    }

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
        const currentChecksum = computeAttendanceChecksum(record);
        if (!cached) {
          missingCache.push(record);
        } else if (cached.checksum !== currentChecksum) {
          // Re-fetch whenever summary percentages changed (or legacy entry lacks checksum)
          staleCache.push(record);
        }
      });

      // Priority queue: courses with NO cache first, then courses with stale cache
      const queue = [...missingCache, ...staleCache];

      if (queue.length === 0) {
        completedPrefetchEnrollment = normalizedEnrollment;
        publishPendingSubjects(new Set());
        setStatus({
          isPrefetching: false,
          total: eligibleRecords.length,
          completed: eligibleRecords.length,
          failed: 0,
        });
        isRunningRef.current = false;
        return;
      }

      const pendingSet = new Set(queue.map((r) => r.subject));
      publishPendingSubjects(pendingSet);

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
              true,
              controller.signal,
              computeAttendanceChecksum(item)
            );
            completedCount++;
          } catch (err: unknown) {
            failedCount++;
            if (
              err instanceof SessionExpiredError ||
              (err instanceof PortalError && err.httpStatus === 401)
            ) {
              sessionExpired = true;
            }
          } finally {
            pendingSet.delete(item.subject);
            publishPendingSubjects(new Set(pendingSet));
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
        completedPrefetchEnrollment = normalizedEnrollment;
        publishPendingSubjects(new Set());
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
      publishPendingSubjects(new Set());
      isRunningRef.current = false;
    };
  }, [attendanceRecords, enrollment, refreshTrigger, enabled]);

  return status;
}
