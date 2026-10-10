/**
 * Login Page
 * Entry point for user authentication
 */

"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { CampusLynxLoginForm } from "@/components/CampusLynxLoginForm";
import { LoginIllustration } from "@/components/LoginIllustration";
import { useAuthFlow } from "@/hooks/useAuthFlow";
import { apiClient } from "@/utils/api";

export default function LoginPage() {
  const router = useRouter();

  const {
    isLoading,
    isFetchingCaptcha,
    captcha,
    error,
    fetchCaptcha,
    submitLogin,
    clearError,
  } = useAuthFlow();

  // Redirect to dashboard if already logged in. This runs after hydration so
  // the initial render matches the server (no hydration mismatch).
  useEffect(() => {
    let cancelled = false;

    apiClient
      .get("/api/auth/session")
      .then(() => {
        if (!cancelled) router.replace("/dashboard");
      })
      .catch(() => {
        // A missing or expired cookie means the login form should remain available.
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div
      id="main-content"
      className="min-h-screen w-full bg-[#8ba5ec] flex items-center justify-center p-4 sm:p-6"
    >
      <LoadingOverlay isVisible={isFetchingCaptcha} />

      <main className="w-full max-w-[960px] bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(15,23,42,0.35)] overflow-hidden flex flex-col md:flex-row border border-[#e4e6e3]">
        {/* Left illustration pane (hidden on mobile) */}
        <LoginIllustration />

        {/* Right form pane */}
        <section className="md:w-1/2 p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-center">
          <CampusLynxLoginForm
            captchaImage={captcha?.image || null}
            onSubmitLogin={submitLogin}
            onRefreshCaptcha={fetchCaptcha}
            isLoading={isLoading}
            error={error}
            onErrorDismiss={clearError}
          />
        </section>
      </main>
    </div>
  );
}
