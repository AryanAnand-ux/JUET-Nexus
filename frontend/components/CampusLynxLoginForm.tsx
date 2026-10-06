"use client";

import React, { useState, useMemo, useEffect } from "react";
import { formatEnrollment, isValidEnrollment } from "@/utils/formatters";
import type { AuthError } from "@/hooks/useAuthFlow";
import { Eye, EyeOff, RotateCw, AlertCircle, ArrowRight } from "lucide-react";

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

/**
 * Unified Single-Screen CampusLynx Login Form
 * Renders Enrollment Number, Password, and Captcha concurrently on one page.
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
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl shadow-xl transition-colors duration-200">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 flex flex-col justify-between items-center relative">
            <div className="w-full h-1.5 bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
            <div className="w-full h-1.5 bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
            <div className="w-full h-1.5 bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-[120%] bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
          </div>
        </div>
        <h1 className="text-2xl sm:text-[30px] font-extrabold text-gray-900 dark:text-slate-100 font-nunito tracking-tight mb-2 leading-tight">
          Sign In to JUET Nexus
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-nunito">
          Enter your academic credentials to connect
        </p>
      </div>

      {/* Global Error Banner */}
      {error && !error.field && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300 font-nunito">
              {error.message}
            </p>
          </div>
        </div>
      )}

      {/* Unified Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Field 1: Enrollment Number */}
        <div>
          <label
            htmlFor="enrollment"
            className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 font-nunito mb-2"
          >
            Enrollment Number
          </label>
          <input
            id="enrollment"
            type="text"
            value={enrollment}
            onChange={handleEnrollmentChange}
            onBlur={() => setTouched((prev) => ({ ...prev, enrollment: true }))}
            placeholder="e.g. 24BCS100"
            disabled={isLoading}
            autoFocus
            autoComplete="username"
            className={`w-full px-4 py-3.5 rounded-2xl border text-sm font-bold font-mono tracking-wider transition-colors duration-200 outline-none ${
              touched.enrollment && !isValidEnrollment(enrollment)
                ? "border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/10 text-rose-900 dark:text-rose-200 focus:border-rose-500"
                : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-100 focus:border-indigo-600 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
            }`}
          />
          {touched.enrollment && !isValidEnrollment(enrollment) && (
            <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 font-nunito">
              Format: 2 numbers, 2-4 letters, 3-4 numbers (e.g., 24BCS100)
            </p>
          )}
        </div>

        {/* Field 2: Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 font-nunito mb-2"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              placeholder="Enter your portal password"
              disabled={isLoading}
              autoComplete="current-password"
              className={`w-full px-4 py-3.5 pr-12 rounded-2xl border text-sm font-bold transition-colors duration-200 outline-none ${
                error?.field === "password"
                  ? "border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/10 text-rose-900 dark:text-rose-200 focus:border-rose-500"
                  : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-100 focus:border-indigo-600 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          {error?.field === "password" && (
            <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 font-nunito">
              {error.message}
            </p>
          )}
        </div>

        {/* Field 3: Captcha */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label
              htmlFor="captchaInput"
              className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 font-nunito"
            >
              Security Captcha
            </label>
            <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
              Case-sensitive
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="captchaInput"
              type="text"
              value={captchaInput}
              onChange={handleCaptchaChange}
              onBlur={() => setTouched((prev) => ({ ...prev, captcha: true }))}
              placeholder="Captcha code"
              disabled={isLoading}
              maxLength={8}
              autoComplete="off"
              className={`w-32 sm:w-36 px-4 py-3.5 rounded-2xl border text-sm font-bold font-mono tracking-wider transition-colors duration-200 outline-none text-center ${
                error?.field === "captcha"
                  ? "border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/10 text-rose-900 dark:text-rose-200 focus:border-rose-500"
                  : "border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-100 focus:border-indigo-600 dark:focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
              }`}
            />

            {/* Captcha Image Display & Reload Button */}
            <div className="flex-1 flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-800 rounded-2xl min-h-[50px]">
              {captchaImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={captchaImage}
                  alt="Captcha"
                  className="h-9 max-w-[130px] object-contain rounded filter contrast-125 select-none"
                />
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500 font-medium animate-pulse">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Loading...</span>
                </div>
              )}

              <button
                type="button"
                onClick={onRefreshCaptcha}
                disabled={isLoading}
                title="Refresh Captcha"
                aria-label="Refresh Captcha"
                className="p-2 text-gray-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 hover:bg-gray-200/50 dark:hover:bg-slate-700/50 rounded-xl transition-all cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          {error?.field === "captcha" && (
            <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 font-nunito">
              {error.message}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isFormValid || isLoading}
          className="w-full mt-2 py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white font-bold text-sm tracking-wide font-nunito shadow-lg shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Authenticating...</span>
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
