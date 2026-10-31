/**
 * Attendance Cache Utility
 * Pure in-memory and localStorage cache with in-flight deduplication.
 * Kept separate from React hooks to prevent circular dependencies
 * and Next.js / Webpack client/server module evaluation errors.
 */

import { apiClient } from "@/utils/api";
import type { AttendanceDetailsResponse } from "@/types";

export interface CacheItem {
  data: AttendanceDetailsResponse;
  timestamp: number;
}

// In-memory module-level cache: key is `${subject}:${link}`
export const detailsMemoryCache = new Map<string, CacheItem>();

// Global in-flight requests map to prevent duplicate network calls across hooks/prefetchers
export const inFlightDetailsRequests = new Map<string, Promise<AttendanceDetailsResponse>>();

export const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (matches backend ATTENDANCE_CACHE_TTL_SEC)
export const CLIENT_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes for background SWR revalidation

/**
 * Generate a safe localStorage cache key scoped to the user enrollment
 */
export function getAttendanceStorageKey(
  subject: string,
  link: string,
  enrollment?: string | null
): string {
  const user = (
    enrollment ||
    (typeof window !== "undefined" ? localStorage.getItem("enrollment") : null) ||
    "default"
  ).trim().toUpperCase();
  return `juet_att_detail_${user}_${encodeURIComponent(subject)}_${encodeURIComponent(link)}`;
}

/**
 * Synchronously retrieve cached attendance details from memory or localStorage.
 */
export function getStoredAttendanceDetail(
  subject: string,
  link: string,
  enrollment?: string | null
): { data: AttendanceDetailsResponse; isStale: boolean } | null {
  const cacheKey = `${subject}:${link}`;
  const now = Date.now();

  // 1. Check in-memory cache first (fastest)
  const mem = detailsMemoryCache.get(cacheKey);
  if (mem && now - mem.timestamp < CLIENT_CACHE_TTL_MS) {
    return {
      data: mem.data,
      isStale: now - mem.timestamp > CLIENT_STALE_THRESHOLD_MS,
    };
  }

  // 2. Fall back to localStorage
  if (typeof window === "undefined") return null;
  try {
    const key = getAttendanceStorageKey(subject, link, enrollment);
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item) as { data: AttendanceDetailsResponse; timestamp: number };
    if (!parsed || !parsed.data || typeof parsed.timestamp !== "number") return null;

    if (now - parsed.timestamp > CLIENT_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    // Populate memory cache for subsequent instant reads
    detailsMemoryCache.set(cacheKey, { data: parsed.data, timestamp: parsed.timestamp });
    return {
      data: parsed.data,
      isStale: now - parsed.timestamp > CLIENT_STALE_THRESHOLD_MS,
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
  enrollment?: string | null
): void {
  const cacheKey = `${subject}:${link}`;
  const now = Date.now();
  detailsMemoryCache.set(cacheKey, { data, timestamp: now });

  if (typeof window === "undefined") return;
  try {
    const key = getAttendanceStorageKey(subject, link, enrollment);
    localStorage.setItem(key, JSON.stringify({ data, timestamp: now }));
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

/**
 * Direct fetch helper with caching and in-flight deduplication.
 * Can be invoked by background prefetchers or directly.
 */
export async function fetchAttendanceDetailDirect(
  subject: string,
  link: string,
  enrollment?: string | null,
  isRefresh = false,
  signal?: AbortSignal
): Promise<AttendanceDetailsResponse> {
  const cacheKey = `${subject}:${link}`;

  // If not explicitly refreshing, return fresh cached data if present
  if (!isRefresh) {
    const cached = getStoredAttendanceDetail(subject, link, enrollment);
    if (cached && !cached.isStale) {
      return cached.data;
    }
  }

  // Deduplicate against an already running in-flight request
  const existingPromise = inFlightDetailsRequests.get(cacheKey);
  if (existingPromise && !isRefresh) {
    return existingPromise;
  }

  const queryParams = new URLSearchParams({ subject, link });
  if (isRefresh) {
    queryParams.set("refresh", "true");
  }

  const fetchPromise = (async () => {
    try {
      const response = await apiClient.get(
        `/api/attendance/details?${queryParams.toString()}`,
        {
          signal,
          timeout: 60000,
        }
      );
      const responseData: AttendanceDetailsResponse = response.data.data;
      setStoredAttendanceDetail(subject, link, responseData, enrollment);
      return responseData;
    } finally {
      inFlightDetailsRequests.delete(cacheKey);
    }
  })();

  inFlightDetailsRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}
