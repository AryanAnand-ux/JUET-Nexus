/**
 * Login Page
 * Entry point for user authentication
 */

"use client";

import React from "react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { FigmaLoginForm } from "@/components/FigmaLoginForm";
import { FigmaLoginGraphic } from "@/components/FigmaLoginGraphic";
import { useAuthFlow } from "@/hooks/useAuthFlow";

export default function LoginPage() {
  const {
    isLoading,
    isFetchingCaptcha,
    captcha,
    error,
    fetchCaptcha,
    submitLogin,
    clearError,
  } = useAuthFlow();

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
