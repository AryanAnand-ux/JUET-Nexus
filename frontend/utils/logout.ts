/**
 * Shared logout utility (One-Hop Architecture)
 * Clears local session, encrypted credentials, and all feature caches.
 */

import { clearSession, clearCredentials } from "@/lib/session";
import { cancelRefresh } from "@/lib/portalClient";
import { invalidateCacheGeneration } from "@/lib/featureCache";
import { clearAttendanceDetailCache } from "@/utils/attendanceCache";
import { clearSharedDashboard } from "@/hooks/useDashboard";
import { clearExamCache } from "@/hooks/useExamSchedule";
import { clearPortalDashboardSessionState } from "@/lib/portalDashboard";

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  const currentEnrollment = localStorage.getItem("enrollment");
  cancelRefresh();
  clearSession();
  clearCredentials();
  invalidateCacheGeneration();
  clearExamCache();
  clearPortalDashboardSessionState();
  localStorage.removeItem("dob");
  localStorage.removeItem("studentName");
  if (currentEnrollment) {
    const key = currentEnrollment.trim().toUpperCase();
    localStorage.removeItem(`juet_dashboard_cache_${key}`);
    localStorage.removeItem(`juet_dashboard_cache_v3_${key}`);
    clearSharedDashboard(key);
  } else {
    clearSharedDashboard();
  }
  clearAttendanceDetailCache(currentEnrollment);
}

export async function performLogout(): Promise<void> {
  clearStoredSession();
}
