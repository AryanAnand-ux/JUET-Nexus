"use client";

import React, { useState, useMemo, useEffect } from "react";
import { formatEnrollment, isValidEnrollment } from "@/utils/formatters";
import type { AuthError } from "@/hooks/useAuthFlow";

interface CampusLynxLoginFormProps {
  step: 1 | 2;
  pendingEnrollment: string;
  captchaImage: string | null;
  onVerifyUser: (credentials: {
    enrollment: string;
    captchaInput: string;
  }) => Promise<boolean>;
  onSubmitPassword: (credentials: { password: string }) => Promise<void>;
  onBack: () => void;
  onRefreshCaptcha: () => void;
  isLoading: boolean;
  error: AuthError | null;
  onErrorDismiss: () => void;
}

/**
 * Two-step CampusLynx login: identify (enrollment + captcha), then password.
 * The portal never auto-solves its captcha, so unlike the WebKiosk form the
 * captcha input is always required.
 */
export function CampusLynxLoginForm({
  step,
  pendingEnrollment,
  captchaImage,
  onVerifyUser,
  onSubmitPassword,
  onBack,
  onRefreshCaptcha,
  isLoading,
  error,
  onErrorDismiss,
}: CampusLynxLoginFormProps) {
  const [enrollment, setEnrollment] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ enrollment: false });

  // The portal consumes a captcha on every attempt, so a failed verify swaps in
  // a new image. The answer typed against the old one is dead and must go, or
  // "Continue" stays enabled and resubmits a guaranteed-wrong answer. The
  // enrollment is kept -- it is still correct and retyping it is pure friction.
  useEffect(() => {
    setCaptchaInput("");
  }, [captchaImage]);

  const handleEnrollmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEnrollment(formatEnrollment(e.target.value));
    if (error?.field === "enrollment") onErrorDismiss();
  };

  const isIdentifyValid = useMemo(
    () => isValidEnrollment(enrollment) && captchaInput.length > 0,
    [enrollment, captchaInput]
  );

  const handleIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ enrollment: true });
    if (isIdentifyValid) {
      onVerifyUser({ enrollment, captchaInput });
    }
  };

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length > 0) {
      onSubmitPassword({ password });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-sm transition-colors duration-200">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 flex flex-col justify-between items-center relative">
            <div className="w-full h-1.5 bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
            <div className="w-full h-1.5 bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
            <div className="w-full h-1.5 bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-[120%] bg-indigo-600 dark:bg-indigo-500 rounded-full"></div>
          </div>
        </div>
        <h1 className="text-2xl sm:text-[32px] font-bold text-gray-900 dark:text-slate-100 font-nunito tracking-tight mb-2 leading-tight">
          {step === 1 ? "Login to your Account" : "Enter your Password"}
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-nunito">
          {step === 1
            ? "Seamless connection to your academic profile"
            : "One last step to reach your dashboard"}
        </p>
      </div>

      {error && !error.field && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-sm text-red-600 dark:text-red-400 text-center font-medium"
        >
          {error.message}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleIdentify} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Enrollment Number
            </label>
            <input
              type="text"
              placeholder="e.g. 24BCS100"
              value={enrollment}
              onChange={handleEnrollmentChange}
              onBlur={() => setTouched((p) => ({ ...p, enrollment: true }))}
              className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent transition-all font-nunito uppercase"
              required
              autoFocus
            />
            {touched.enrollment && !isValidEnrollment(enrollment) && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                Must be at least 6 alphanumeric characters
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Security Captcha
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Enter text..."
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent transition-all font-nunito"
                required
              />
              <div className="shrink-0 flex items-center gap-2 bg-gray-50 dark:bg-slate-800 p-2 rounded-xl border border-gray-100 dark:border-slate-700">
                {captchaImage ? (
                  <div className="w-[120px] h-[40px] bg-white rounded-lg overflow-hidden flex items-center justify-center border border-gray-200 dark:border-slate-600">
                    <img src={captchaImage} alt="Captcha" className="max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-[120px] h-[40px] bg-gray-200 dark:bg-slate-700 animate-pulse rounded-lg" />
                )}
                <button
                  type="button"
                  onClick={onRefreshCaptcha}
                  disabled={isLoading}
                  className="p-2 text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  title="Refresh Captcha"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || (!isIdentifyValid && touched.enrollment)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-60 flex justify-center items-center gap-2 mt-6 font-nunito text-base shadow-md shadow-indigo-600/20"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Verifying...
              </>
            ) : (
              "Continue"
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handlePassword} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Enrollment Number
            </label>
            <input
              type="text"
              value={pendingEnrollment}
              readOnly
              className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-slate-300 font-nunito cursor-not-allowed uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 focus:border-transparent transition-all font-nunito"
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || password.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-60 flex justify-center items-center gap-2 mt-6 font-nunito text-base shadow-md shadow-indigo-600/20"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Signing in...
              </>
            ) : (
              "Login"
            )}
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="w-full text-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors font-nunito disabled:opacity-50 py-1"
          >
            ← Back
          </button>
        </form>
      )}
    </div>
  );
}
