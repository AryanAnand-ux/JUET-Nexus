/**
 * Root Route Page (One-Hop Architecture)
 * Checks localStorage session synchronously and routes to /dashboard or /login.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/session";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const session = loadSession();
    if (session?.token && session?.enrollment) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
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
