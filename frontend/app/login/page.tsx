/**
 * Login Page
 * Entry point for user authentication
 */

"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { CampusLynxLoginForm } from "@/components/CampusLynxLoginForm";
import { FigmaLoginGraphic } from "@/components/FigmaLoginGraphic";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuthFlow } from "@/hooks/useAuthFlow";

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
    const enrollment = localStorage.getItem("enrollment");
    if (enrollment) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] dark:bg-slate-950 flex transition-colors duration-200">
      <LoadingOverlay isVisible={isFetchingCaptcha} />
      
      {/* Left side Graphic (Hidden on mobile) */}
      <FigmaLoginGraphic />

      {/* Right side Form Area */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ThemeToggle />
        </div>
        <CampusLynxLoginForm
          captchaImage={captcha?.image || null}
          onSubmitLogin={submitLogin}
          onRefreshCaptcha={fetchCaptcha}
          isLoading={isLoading}
          error={error}
          onErrorDismiss={clearError}
        />
        
        <div className="mt-8 text-center text-xs font-medium text-gray-400 dark:text-slate-500 max-w-sm">
          <p>🔒 Secure. Encrypted. Persistent.</p>
          <p className="mt-2">JUET Nexus connects directly to your CampusLynx portal session.</p>
        </div>
      </div>
    </div>
  );
}
