/**
 * Attendance Cache Utility
 * Pure in-memory and localStorage cache with in-flight deduplication.
 * Kept separate from React hooks to prevent circular dependencies
 * and Next.js / Webpack client/server module evaluation errors.
 */

import { postEncrypted } from "@/lib/portalClient";
import { parseDetailLink, fetchAttendanceDetail } from "@/lib/portalAttendance";
import type { AttendanceDetailsResponse, AttendanceRecord } from "@/types";

export interface CacheItem {
  data: AttendanceDetailsResponse;
  timestamp: number;
  checksum?: string;
}

/**
 * Compute a lightweight checksum from a subject's summary percentages.
 * If the portal's summary percentages haven't changed, the underlying day-by-day
 * logs haven't changed either — allowing prefetch to skip redundant network calls.
 */
export function computeAttendanceChecksum(record: Pick<
  AttendanceRecord,
  "percentage" | "lecturePercent" | "tutorialPercent" | "practicalPercent"
>): string {
  return `${record.percentage}|${record.lecturePercent}|${record.tutorialPercent}|${record.practicalPercent}`;
}

// In-memory module-level cache: key is `${user}:${subject}:${link}`
export const detailsMemoryCache = new Map<string, CacheItem>();

// Global in-flight requests map to prevent duplicate network calls across hooks/prefetchers
export const inFlightDetailsRequests = new Map<string, Promise<AttendanceDetailsResponse>>();

export const CLIENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (persist historical logs across sessions)
export const CLIENT_STALE_THRESHOLD_MS = 15 * 60 * 1000; // Fallback threshold (used only when portal-day check can't apply)

/**
 * Returns the Unix timestamp (ms) of the most recent 2:00 AM IST boundary.
 * JUET commits attendance data at 2:00 AM IST each day. Any cached entry
 * fetched *after* this boundary is fully fresh for the rest of the portal day.
 */
export function getPortalDayStart(): number {
  const now = new Date();
  // IST is UTC+5:30
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  // Shift now into IST
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  // Build today's 2 AM IST as a UTC timestamp:
  //   midnight UTC of the IST date  →  subtract IST offset  →  add 2h
  const boundary = new Date(
    Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate()
    ) -
      IST_OFFSET_MS +
      2 * 60 * 60 * 1000
  );

  // If we haven't reached today's 2 AM IST yet, roll back one day
  if (now.getTime() < boundary.getTime()) {
    boundary.setUTCDate(boundary.getUTCDate() - 1);
  }

  return boundary.getTime();
}

/**
 * Returns true if `timestamp` falls within the current JUET portal day,
 * i.e. it was recorded after today's 2:00 AM IST boundary.
 * Data fetched during the current portal day is always considered fresh —
 * attendance records don't change until the next 2 AM commit.
 */
export function isCachedOnCurrentPortalDay(timestamp: number): boolean {
  return timestamp >= getPortalDayStart();
}

function resolveUserScope(enrollment?: string | null): string {
  return (
    enrollment ||
    (typeof window !== "undefined" ? localStorage.getItem("enrollment") : null) ||
    "default"
  )
    .trim()
    .toUpperCase();
}

function getMemoryCacheKey(
  subject: string,
  link: string,
  enrollment?: string | null
): string {
  return `${resolveUserScope(enrollment)}:${subject}:${link}`;
}

/**
 * Generate a safe localStorage cache key scoped to the user enrollment
 */
export function getAttendanceStorageKey(
  subject: string,
  link: string,
  enrollment?: string | null
): string {
  const user = resolveUserScope(enrollment);
  return `juet_att_detail_${user}_${encodeURIComponent(subject)}_${encodeURIComponent(link)}`;
}

/**
 * Synchronously retrieve cached attendance details from memory or localStorage.
 */
export function getStoredAttendanceDetail(
  subject: string,
  link: string,
  enrollment?: string | null
): { data: AttendanceDetailsResponse; isStale: boolean; checksum?: string } | null {
  const cacheKey = getMemoryCacheKey(subject, link, enrollment);
  const now = Date.now();

  // 1. Check in-memory cache first (fastest)
  const mem = detailsMemoryCache.get(cacheKey);
  if (mem) {
    return {
      data: mem.data,
      // Fresh if fetched today after 2AM IST (attendance doesn't change until next 2AM commit)
      // Fallback: consider stale after CLIENT_STALE_THRESHOLD_MS for pre-2AM edge cases
      isStale:
        !isCachedOnCurrentPortalDay(mem.timestamp) &&
        now - mem.timestamp > CLIENT_STALE_THRESHOLD_MS,
      checksum: mem.checksum,
    };
  }

  // 2. Fall back to localStorage
  if (typeof window === "undefined") return null;
  try {
    const key = getAttendanceStorageKey(subject, link, enrollment);
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item) as {
      data: AttendanceDetailsResponse;
      timestamp: number;
      checksum?: string;
    };
    if (!parsed || !parsed.data || typeof parsed.timestamp !== "number") return null;

    // Populate memory cache for subsequent instant reads
    detailsMemoryCache.set(cacheKey, {
      data: parsed.data,
      timestamp: parsed.timestamp,
      checksum: parsed.checksum,
    });
    return {
      data: parsed.data,
      isStale:
        !isCachedOnCurrentPortalDay(parsed.timestamp) &&
        now - parsed.timestamp > CLIENT_STALE_THRESHOLD_MS,
      checksum: parsed.checksum,
    };
  } catch {
    return null;
  }
}

/**
 * Store attendance details in both memory and localStorage
 */
export function setStoredAttendanceDetail(
  subject: string,
  link: string,
  data: AttendanceDetailsResponse,
  enrollment?: string | null,
  checksum?: string
): void {
  const cacheKey = getMemoryCacheKey(subject, link, enrollment);
  const now = Date.now();
  detailsMemoryCache.set(cacheKey, { data, timestamp: now, checksum });

  if (typeof window === "undefined") return;
  try {
    const key = getAttendanceStorageKey(subject, link, enrollment);
    localStorage.setItem(key, JSON.stringify({ data, timestamp: now, checksum }));
  } catch {
    // Gracefully handle storage quota or privacy mode issues
  }
}

/**
 * Clear cached attendance details (called on logout)
 */
export function clearAttendanceDetailCache(enrollment?: string | null): void {
  detailsMemoryCache.clear();
  inFlightDetailsRequests.clear();

  if (typeof window === "undefined") return;
  try {
    const prefix = enrollment ? `juet_att_detail_${enrollment.trim().toUpperCase()}_` : "juet_att_detail_";
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener("abort", onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

/**
 * Direct fetch helper with caching and in-flight deduplication.
 * Can be invoked by background prefetchers or directly.
 */
export async function fetchAttendanceDetailDirect(
  subject: string,
  link: string,
  enrollment?: string | null,
  isRefresh = false,
  signal?: AbortSignal,
  checksum?: string,
  timeoutMs?: number
): Promise<AttendanceDetailsResponse> {
  const cacheKey = getMemoryCacheKey(subject, link, enrollment);

  // If not explicitly refreshing, return cached data when checksum matches or entry is fresh
  if (!isRefresh) {
    const cached = getStoredAttendanceDetail(subject, link, enrollment);
    if (cached && ((checksum && cached.checksum === checksum) || !cached.isStale)) {
      return cached.data;
    }
  }

  // Deduplicate against an already running in-flight request
  const existingPromise = inFlightDetailsRequests.get(cacheKey);
  if (existingPromise && !isRefresh) {
    return raceWithAbort(existingPromise, signal);
  }

  const fetchPromise = (async () => {
    try {
      const ref = parseDetailLink(link);
      if (!ref) {
        throw new Error("Invalid attendance detail link");
      }
      const responseData = await fetchAttendanceDetail(
        {
          postEncrypted: (path, payload, options) =>
            postEncrypted(path, payload, { timeout: timeoutMs ?? options?.timeout }),
        },
        ref,
        {
          subject,
          subjectid: ref.subjectid,
          individualsubjectcode: ref.individualsubjectcode,
          components: ref.components,
          officialPercentage: ref.officialPercentage,
        }
      );
      setStoredAttendanceDetail(subject, link, responseData, enrollment, checksum);
      return responseData;
    } finally {
      inFlightDetailsRequests.delete(cacheKey);
    }
  })();

  inFlightDetailsRequests.set(cacheKey, fetchPromise);
  return raceWithAbort(fetchPromise, signal);
}
