/**
 * useAuthFlow Hook
 * Manages authentication flow: fetch captcha → validate credentials → create session
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface CaptchaState {
  image: string;
  sessionToken: string;
  /** Raw text from WebKiosk .noselect — present when captcha is text-based */
  captchaValue: string | null;
}

export interface AuthError {
  field?: string;
  message: string;
}

export interface UseAuthFlowReturn {
  // State
  isLoading: boolean;
  isFetchingCaptcha: boolean;
  captcha: CaptchaState | null;
  error: AuthError | null;
  isAuthenticated: boolean;

  // Actions
  fetchCaptcha: () => Promise<void>;
  submitLogin: (credentials: {
    enrollment: string;
    dob: string;
    password: string;
    captchaInput: string;
    role: "Student" | "Employee" | "Guest";
  }) => Promise<void>;
  clearError: () => void;
  resetForm: () => void;
}

export function useAuthFlow(): UseAuthFlowReturn {
  const router = useRouter();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCaptcha, setIsFetchingCaptcha] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Fetch captcha from backend
   */
  const fetchCaptcha = useCallback(async () => {
    setIsFetchingCaptcha(true);
    setError(null);

    try {
      const response = await axios.get(`${API_URL}/api/init`, {
        timeout: 60000,
      });

      setCaptcha({
        image: response.data.captchaImage,
        sessionToken: response.data.sessionToken,
        captchaValue: response.data.captchaValue ?? null,
      });
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Failed to load captcha. Please try again.";

      setError({ message });
      console.error("Failed to fetch captcha:", err);
    } finally {
      setIsFetchingCaptcha(false);
    }
  }, []);

  /**
   * Submit login credentials
   */
  const submitLogin = useCallback(
    async (credentials: {
      enrollment: string;
      dob: string;
      password: string;
      captchaInput: string;
      role: "Student" | "Employee" | "Guest";
    }) => {
      if (!captcha) {
        setError({ message: "Captcha not loaded. Please refresh." });
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await axios.post(
          `${API_URL}/api/auth`,
          {
            enrollment: credentials.enrollment.toUpperCase(),
            dob: credentials.dob,
            password: credentials.password,
            captcha: credentials.captchaInput,
            role: credentials.role,
            sessionToken: captcha.sessionToken,
          },
          {
            timeout: 60000,
            withCredentials: true, // Include cookies
          }
        );

        if (response.data.success) {
          setIsAuthenticated(true);
          if (typeof window !== "undefined") {
            localStorage.setItem("enrollment", credentials.enrollment.toUpperCase());
            localStorage.setItem("role", credentials.role);
          }
          // Redirect to dashboard
          router.push("/dashboard");
        } else {
          setError({
            message: response.data.error || "Authentication failed",
          });
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const message =
            err.response?.data?.error || err.message || "Authentication failed";
          const status = err.response?.status;

          if (status === 401) {
            setError({ message: "Invalid credentials or captcha" });
          } else if (status === 400) {
            setError({ message: err.response?.data?.error || "Invalid input" });
          } else {
            setError({ message });
          }
        } else {
          setError({ message: "An unexpected error occurred" });
        }

        console.error("Authentication error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [captcha, router]
  );

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Reset form and refresh captcha
   */
  const resetForm = useCallback(() => {
    setError(null);
    fetchCaptcha();
  }, [fetchCaptcha]);

  // Fetch captcha on mount
  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  return {
    isLoading,
    isFetchingCaptcha,
    captcha,
    error,
    isAuthenticated,
    fetchCaptcha,
    submitLogin,
    clearError,
    resetForm,
  };
}
