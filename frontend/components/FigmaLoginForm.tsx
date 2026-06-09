"use client";

import React, { useState, useMemo, useEffect } from "react";
import { formatDOB, formatEnrollment, isValidDOB, isValidEnrollment } from "@/utils/formatters";
import type { AuthError } from "@/hooks/useAuthFlow";


interface FigmaLoginFormProps {
  onSubmit: (credentials: {
    enrollment: string;
    dob: string;
    password: string;
    captchaInput: string;
    role: "Student" | "Employee" | "Guest";
  }) => Promise<void>;
  captchaImage: string | null;
  captchaValue: string | null;
  onRefreshCaptcha: () => void;
  isLoading: boolean;
  error: AuthError | null;
  onErrorDismiss: () => void;
}

const ROLES: { value: "Student" | "Employee" | "Guest"; label: string }[] = [
  { value: "Student", label: "Student Login" },
  { value: "Employee", label: "Employee Login" },
  { value: "Guest", label: "Guest Login" },
];

export function FigmaLoginForm({
  onSubmit,
  captchaImage,
  captchaValue,
  onRefreshCaptcha,
  isLoading,
  error,
  onErrorDismiss,
}: FigmaLoginFormProps) {
  const [role, setRole] = useState<"Student" | "Employee" | "Guest">("Student");
  const [enrollment, setEnrollment] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Auto-fill captcha when backend provides the solved value (text-based captcha)
  useEffect(() => {
    if (captchaValue) {
      setCaptchaInput(captchaValue);
    }
  }, [captchaValue]);

  // Whether the captcha was auto-solved by the backend
  const isCaptchaAutoSolved = Boolean(captchaValue);

  const [touched, setTouched] = useState({
    enrollment: false,
    dob: false,
    password: false,
    captcha: false,
  });

  const handleEnrollmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEnrollment(formatEnrollment(e.target.value));
    if (error?.field === "enrollment") onErrorDismiss();
  };

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDob(formatDOB(e.target.value));
    if (error?.field === "dob") onErrorDismiss();
  };

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isFormValid = useMemo(() => {
    return (
      isValidEnrollment(enrollment) &&
      isValidDOB(dob) &&
      password.length > 0 &&
      captchaInput.length > 0
    );
  }, [enrollment, dob, password, captchaInput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      enrollment: true,
      dob: true,
      password: true,
      captcha: true,
    });

    if (isFormValid) {
      onSubmit({ enrollment, dob, password, captchaInput, role });
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-xl">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          {/* Logo mock */}
          <div className="w-12 h-12 flex flex-col justify-between items-center relative">
            <div className="w-full h-1.5 bg-[#4F46E5] rounded-full"></div>
            <div className="w-full h-1.5 bg-[#4F46E5] rounded-full"></div>
            <div className="w-full h-1.5 bg-[#4F46E5] rounded-full"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-[120%] bg-[#4F46E5] rounded-full"></div>
          </div>
        </div>
        <h1 className="text-[36px] font-bold text-figma-dark-gray font-nunito tracking-tight mb-2 leading-tight">
          Login to your Account
        </h1>
        <p className="text-base text-gray-500 font-nunito">
          Seamless connection to your academic profile
        </p>
      </div>

      {error && !error.field && (
        <div className="mb-6 p-4 bg-[#FFF0F0] border border-[#FFD6D6] rounded-lg text-sm text-[#D32F2F] text-center font-medium">
          {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Role
          </label>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full bg-white border border-figma-input-border rounded-lg px-4 py-3 text-sm text-figma-dark focus:outline-none focus:ring-2 focus:ring-figma-burgundy focus:border-transparent transition-all appearance-none font-nunito"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Enrollment Number
          </label>
          <input
            type="text"
            placeholder="e.g. 24BCS100"
            value={enrollment}
            onChange={handleEnrollmentChange}
            onBlur={() => handleBlur("enrollment")}
            className="w-full bg-white border border-figma-input-border rounded-lg px-4 py-3 text-sm text-figma-dark placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-figma-burgundy focus:border-transparent transition-all font-nunito"
            required
          />
          {touched.enrollment && !isValidEnrollment(enrollment) && (
            <p className="mt-1 text-xs text-red-500">Must be at least 6 alphanumeric characters</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Date of Birth
            </label>
            <input
              type="text"
              placeholder="DD-MM-YYYY"
              value={dob}
              onChange={handleDobChange}
              onBlur={() => handleBlur("dob")}
              className="w-full bg-white border border-figma-input-border rounded-lg px-4 py-3 text-sm text-figma-dark placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-figma-burgundy focus:border-transparent transition-all font-nunito"
              required
            />
            {touched.dob && dob.length === 10 && !isValidDOB(dob) && (
              <p className="mt-1 text-xs text-red-500">Invalid date</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleBlur("password")}
              className="w-full bg-white border border-figma-input-border rounded-lg px-4 py-3 text-sm text-figma-dark placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-figma-burgundy focus:border-transparent transition-all font-nunito"
              required
            />
          </div>
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border border-figma-burgundy text-figma-burgundy focus:ring-figma-burgundy bg-transparent checked:bg-figma-burgundy checked:border-figma-burgundy checked:text-white transition-all"
            />
            <span className="text-xs font-semibold text-gray-400 font-nunito">Remember Me</span>
          </label>
          <button type="button" className="text-xs font-semibold text-figma-burgundy hover:text-figma-burgundy-dark transition-colors font-nunito">
            Forgot Password?
          </button>
        </div>

        {/* Captcha Section — only shown when backend can't auto-solve */}
        {!isCaptchaAutoSolved && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Security Captcha
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Enter text..."
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                className="flex-1 bg-white border border-figma-input-border rounded-lg px-4 py-3 text-sm text-figma-dark placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-figma-burgundy focus:border-transparent transition-all uppercase font-nunito"
                required
              />
              <div className="shrink-0 flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                {captchaImage ? (
                  <div className="w-[120px] h-[40px] bg-white rounded overflow-hidden flex items-center justify-center">
                    <img src={captchaImage} alt="Captcha" className="max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-[120px] h-[40px] bg-gray-200 animate-pulse rounded" />
                )}
                <button
                  type="button"
                  onClick={onRefreshCaptcha}
                  disabled={isLoading}
                  className="p-2 text-figma-gray hover:text-figma-maroon transition-colors rounded-md hover:bg-gray-100 disabled:opacity-50"
                  title="Refresh Captcha"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-solved captcha indicator */}
        {isCaptchaAutoSolved && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs font-semibold text-green-700 font-nunito">Captcha auto-verified</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || (!isFormValid && touched.enrollment)}
          className="w-full bg-figma-burgundy hover:bg-figma-burgundy-dark text-white font-bold py-3.5 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-figma-burgundy disabled:opacity-70 flex justify-center items-center gap-2 mt-6 font-nunito text-lg"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Authenticating...
            </>
          ) : (
            "Login"
          )}
        </button>
      </form>
    </div>
  );
}
