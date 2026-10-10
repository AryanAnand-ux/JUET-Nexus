"use client";

import React, { useState, useMemo, useEffect } from "react";
import { formatEnrollment, isValidEnrollment } from "@/utils/formatters";
import type { AuthError } from "@/hooks/useAuthFlow";
import { Eye, EyeOff, RotateCw, AlertCircle, ShieldCheck, User, Lock, ArrowRight } from "lucide-react";
import { Typing } from "@/components/loading-ui/typing";

interface CampusLynxLoginFormProps {
  captchaImage: string | null;
  onSubmitLogin: (credentials: {
    enrollment: string;
    password: string;
    captchaInput: string;
  }) => Promise<boolean | void>;
  onRefreshCaptcha: () => void;
  isLoading: boolean;
  error: AuthError | null;
  onErrorDismiss: () => void;
  // Optional legacy props
  step?: 1 | 2;
  pendingEnrollment?: string;
  onVerifyUser?: (credentials: { enrollment: string; captchaInput: string }) => Promise<boolean>;
  onSubmitPassword?: (credentials: { password: string }) => Promise<void>;
  onBack?: () => void;
}

const inputBase = [
  "w-full bg-transparent border-0 p-0 text-sm text-[#172033] placeholder:text-[#5e6878] focus:ring-0 focus:outline-none focus:shadow-none disabled:opacity-60",
].join(" ");

const fieldShell = [
  "flex items-center border border-[#e4e6e3] rounded-xl px-4 py-3 bg-white transition-colors duration-150",
  "focus-within:border-[#6246c7] focus-within:shadow-[0_0_0_3px_rgba(98,70,199,0.16)]",
].join(" ");

/**
 * Unified Single-Screen CampusLynx Login Form
 * Renders Enrollment Number, Password, and Captcha concurrently on one page.
 * Styled to match the "Student Login" Stitch design while preserving real auth.
 */
export function CampusLynxLoginForm({
  captchaImage,
  onSubmitLogin,
  onRefreshCaptcha,
  isLoading,
  error,
  onErrorDismiss,
}: CampusLynxLoginFormProps) {
  const [enrollment, setEnrollment] = useState("");
  const [password, setPassword] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({
    enrollment: false,
    password: false,
    captcha: false,
  });

  // When captchaImage changes (e.g. on invalid verification), clear the captcha input
  // while preserving the user's enrollment and password.
  useEffect(() => {
    setCaptchaInput("");
  }, [captchaImage]);

  const handleEnrollmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEnrollment(formatEnrollment(e.target.value));
    if (error?.field === "enrollment") onErrorDismiss();
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error?.field === "password") onErrorDismiss();
  };

  const handleCaptchaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCaptchaInput(e.target.value);
    if (error?.field === "captcha") onErrorDismiss();
  };

  const isFormValid = useMemo(
    () => isValidEnrollment(enrollment) && password.length > 0 && captchaInput.trim().length > 0,
    [enrollment, password, captchaInput]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ enrollment: true, password: true, captcha: true });

    if (isFormValid && !isLoading) {
      onSubmitLogin({
        enrollment,
        password,
        captchaInput: captchaInput.trim(),
      });
    }
  };

  return (
    <div className="w-full">
      {/* Heading Block */}
      <header className="text-center mb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apple-touch-icon.png" alt="JUET Nexus" className="mx-auto mb-4 rounded-2xl shadow-sm" width={72} height={72} />
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#6246c7] tracking-tight">
          Sign In to JUET Nexus
        </h1>
      </header>

      {/* Global Error Banner */}
      {error && !error.field && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-700">{error.message}</p>
          </div>
        </div>
      )}

      {/* Unified Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Field 1: Enrollment Number */}
        <div>
          <label
            htmlFor="enrollment"
            className="block text-xs font-semibold text-[#5e6878] mb-1.5"
          >
            Enrollment Number
          </label>
          <div className={fieldShell}>
            <span className="text-[#5e6878] mr-3 flex items-center">
              <User className="w-4 h-4" aria-hidden="true" />
            </span>
            <input
              id="enrollment"
              type="text"
              value={enrollment}
              onChange={handleEnrollmentChange}
              onBlur={() => setTouched((prev) => ({ ...prev, enrollment: true }))}
              placeholder="Enter your enrollment number"
              disabled={isLoading}
              aria-invalid={touched.enrollment && !isValidEnrollment(enrollment)}
              aria-describedby={touched.enrollment && !isValidEnrollment(enrollment) ? "enrollment-help" : undefined}
              autoFocus
              autoComplete="username"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className={`${inputBase} font-mono tracking-wider uppercase`}
            />
          </div>
          {touched.enrollment && !isValidEnrollment(enrollment) && (
            <p id="enrollment-help" className="mt-1.5 text-xs font-medium text-rose-600">
              Format: 2 numbers, 2-4 letters, 3-4 numbers (e.g., 24BCS100)
            </p>
          )}
        </div>

        {/* Field 2: Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-[#5e6878] mb-1.5"
          >
            Password
          </label>
          <div className={`${fieldShell} ${error?.field === "password" ? "border-rose-300 focus-within:border-rose-400 focus-within:shadow-[0_0_0_3px_rgba(244,63,94,0.12)]" : ""}`}>
            <span className="text-[#5e6878] mr-3 flex items-center">
              <Lock className="w-4 h-4" aria-hidden="true" />
            </span>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className={inputBase}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="p-1.5 min-w-[40px] min-h-[40px] -mr-1.5 flex items-center justify-center text-[#5e6878] hover:text-[#6246c7] transition-colors cursor-pointer touch-manipulation active:scale-95"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {error?.field === "password" && (
            <p className="mt-1.5 text-xs font-medium text-rose-600">{error.message}</p>
          )}
        </div>

        {/* Field 3: Captcha */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label
              htmlFor="captchaInput"
              className="block text-xs font-semibold text-[#5e6878]"
            >
              Security Captcha
            </label>
            <span className="text-[11px] text-[#5e6878] font-medium">Case-sensitive</span>
          </div>

          <div className={`${fieldShell} ${error?.field === "captcha" ? "border-rose-300 focus-within:border-rose-400 focus-within:shadow-[0_0_0_3px_rgba(244,63,94,0.12)]" : ""}`}>
            <span className="text-[#5e6878] mr-3 flex items-center">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            </span>
            <input
              id="captchaInput"
              type="text"
              value={captchaInput}
              onChange={handleCaptchaChange}
              onBlur={() => setTouched((prev) => ({ ...prev, captcha: true }))}
              placeholder="Enter code"
              disabled={isLoading}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className={`${inputBase} min-w-0 flex-1 font-mono tracking-wider`}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#e4e6e3] bg-[#f0f0ed] px-3 py-2">
            {captchaImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={captchaImage}
                alt="Captcha"
                className="h-16 max-w-[240px] w-auto object-contain rounded filter contrast-125 select-none"
              />
            ) : (
              <div className="flex items-center justify-center gap-2 w-full text-xs text-[#5e6878] font-medium animate-pulse h-16">
                <div className="w-4 h-4 border-2 border-[#6246c7] border-t-transparent rounded-full animate-spin" />
                <span>Loading captcha...</span>
              </div>
            )}

            <button
              type="button"
              onClick={onRefreshCaptcha}
              disabled={isLoading}
              title="Refresh Captcha"
              aria-label="Refresh Captcha"
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#5e6878] hover:text-[#6246c7] hover:bg-white rounded-lg border border-transparent hover:border-[#e4e6e3] transition-all cursor-pointer touch-manipulation active:scale-95"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
          {error?.field === "captcha" && (
            <p className="mt-1.5 text-xs font-medium text-rose-600">{error.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isFormValid || isLoading}
          className="w-full py-3.5 px-4 rounded-xl bg-[#6246c7] hover:bg-[#5138ad] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition duration-150 ease-in-out flex items-center justify-center gap-2 cursor-pointer touch-manipulation active:scale-[0.98]"
        >
          {isLoading ? (
            <>
              <span>Authenticating</span>
              <Typing size="xs" duration={0.7} className="text-white/90" />
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
