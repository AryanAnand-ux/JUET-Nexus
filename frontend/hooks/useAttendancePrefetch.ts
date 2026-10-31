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

const MAX_CONCURRENT_PREFETCH = 3; // Efficient concurrency to quickly load logs
const INITIAL_PREFETCH_DELAY_MS = 200; // Snappy kick-off right after first paint

/**
 * useAttendancePrefetch
 * Automatically preloads detailed day-by-day attendance logs for all current-semester
 * courses in the background with concurrency control and deduplication.
 */
export function useAttendancePrefetch(
  attendanceRecords: AttendanceRecord[] | undefined,
  enrollment: string | null
): AttendancePrefetchStatus {
  const [status, setStatus] = useState<AttendancePrefetchStatus>({
    isPrefetching: false,
    total: 0,
    completed: 0,
    failed: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeEnrollmentRef = useRef<string | null>(null);
  const isRunningRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enrollment) return;

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

    // If already running for this exact enrollment, let it continue without interrupting
    if (isRunningRef.current && activeEnrollmentRef.current === normalizedEnrollment) {
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

      // Filter out records that are already fresh in client cache (< 5 minutes old)
      const queue = eligibleRecords.filter((record) => {
        const cached = getStoredAttendanceDetail(
          record.subject,
          record.detailLink!,
          normalizedEnrollment
        );
        return !cached || cached.isStale;
      });

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
      if (activeEnrollmentRef.current !== normalizedEnrollment) {
        controller.abort();
        isRunningRef.current = false;
      }
    };
  }, [attendanceRecords, enrollment]);

  return status;
}
