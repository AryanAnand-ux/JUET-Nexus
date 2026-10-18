/**
 * Root Route Page
 * Seamlessly directs authenticated users to /dashboard and unauthenticated users to /login
 * without unwanted login form flashes or redundant captcha fetching.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/utils/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // Fast client-side check
    if (typeof window !== "undefined") {
      const storedEnrollment = localStorage.getItem("enrollment");
      if (storedEnrollment) {
        router.replace("/dashboard");
        return;
      }
    }

    // Verify session with backend cookie
    apiClient
      .get("/api/auth/session")
      .then((res) => {
        if (!cancelled && res.data?.success && res.data?.enrollment) {
          if (typeof window !== "undefined") {
            localStorage.setItem("enrollment", res.data.enrollment.toUpperCase());
            localStorage.setItem("role", "Student");
            if (res.data.sessionToken) {
              localStorage.setItem("sessionToken", res.data.sessionToken);
            }
          }
          router.replace("/dashboard");
        } else if (!cancelled) {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center">
      <div className="text-center text-white space-y-3">
        <div className="w-9 h-9 border-[3px] border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold tracking-wide">Loading JUET Nexus…</p>
      </div>
    </div>
  );
}
