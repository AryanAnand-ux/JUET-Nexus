"use client";

/**
 * Standalone Settings route. Uses the authenticated session and the existing
 * dashboard cache/api hook for profile data; no student details are hardcoded.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useDashboard } from "@/hooks/useDashboard";
import { useHydrated } from "@/hooks/useHydrated";
import { loadSession } from "@/lib/session";
import { performLogout } from "@/utils/logout";

export default function SettingsPage() {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [enrollment, setEnrollment] = useState<string | null>(null);

  const session = useMemo(() => (isHydrated ? loadSession() : null), [isHydrated]);
  const activeEnrollment = isHydrated
    ? enrollment || session?.enrollment || null
    : null;

  useEffect(() => {
    if (!isHydrated) return;
    const stored = loadSession();
    if (!stored?.token || !stored.enrollment) {
      router.replace("/login");
      return;
    }
    setEnrollment(stored.enrollment);
  }, [router, isHydrated]);

  const { data, cachedAt } = useDashboard(activeEnrollment);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!activeEnrollment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-page)] font-nunito">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
          <p className="text-sm font-bold text-[var(--ink-muted)]">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      studentName={data?.student.name || session?.name || "Student"}
      enrollment={data?.student.enrollment || activeEnrollment}
      onLogout={handleLogout}
    >
      <div className="mx-auto w-full max-w-lg">
        <h2 className="mb-6 text-2xl font-editorial-italic text-[var(--ink-strong)] sm:text-3xl">
          Settings
        </h2>
        <SettingsPanel
          studentName={data?.student.name || session?.name}
          enrollment={data?.student.enrollment || activeEnrollment}
          branch={data?.student.branch || session?.branch}
          lastSyncedAt={cachedAt}
          onLogout={handleLogout}
        />
      </div>
    </DashboardLayout>
  );
}
