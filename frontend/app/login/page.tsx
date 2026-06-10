/**
 * Login Page
 * Entry point for user authentication
 */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { FigmaLoginForm } from "@/components/FigmaLoginForm";
import { FigmaLoginGraphic } from "@/components/FigmaLoginGraphic";
import { useAuthFlow } from "@/hooks/useAuthFlow";

export default function LoginPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  const {
    isLoading,
    isFetchingCaptcha,
    captcha,
    error,
    fetchCaptcha,
    submitLogin,
    clearError,
  } = useAuthFlow();

  useEffect(() => {
    const enrollment = localStorage.getItem("enrollment");
    if (enrollment) {
      router.replace("/dashboard");
    } else {
      setIsChecking(false);
    }
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center font-nunito">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-gray-550 dark:text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex">
      <LoadingOverlay isVisible={isFetchingCaptcha} />
      
      {/* Left side Graphic (Hidden on mobile) */}
      <FigmaLoginGraphic />

      {/* Right side Form Area */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 relative">
        <FigmaLoginForm
          onSubmit={submitLogin}
          captchaImage={captcha?.image || null}
          captchaValue={captcha?.captchaValue || null}
          onRefreshCaptcha={fetchCaptcha}
          isLoading={isLoading}
          error={error}
          onErrorDismiss={clearError}
        />
        
        <div className="mt-8 text-center text-xs font-medium text-gray-400 max-w-sm">
          <p>🔒 Secure. Encrypted. Persistent.</p>
          <p className="mt-2">JUET Nexus securely connects you to the WebKiosk network.</p>
        </div>
      </div>
    </div>
  );
}
