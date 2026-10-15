"use client";

/**
 * DashboardSessionKeeper
 * Invisible client component mounted in dashboard layout to maintain active
 * portal session and slide auth cookie across ALL dashboard subpages and tabs.
 */

import { useSessionKeepAlive } from "@/hooks/useSessionKeepAlive";

export function DashboardSessionKeeper() {
  useSessionKeepAlive(true);
  return null;
}
