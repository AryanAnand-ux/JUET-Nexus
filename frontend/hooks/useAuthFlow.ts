/**
 * useAuthFlow Hook
 *
 * Drives CampusLynx authentication for JUET Nexus.
 * Supports unified single-screen login (`submitLogin`) where Enrollment,
 * Password, and Captcha are entered together, as well as step-by-step
 * compatibility functions.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import type { LoginFlow } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface CaptchaState {
  image: string;
  sessionToken: string;
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
  loginFlow: LoginFlow;
  step: 1 | 2;
  pendingEnrollment: string;

  // Actions
  fetchCaptcha: (options?: { keepError?: boolean }) => Promise<void>;
  /** Unified single-screen login submitting enrollment, password, and captcha */
  submitLogin: (credentials: {
    enrollment: string;
    password: string;
    captchaInput: string;
  }) => Promise<boolean>;
  /** Step 1 verify */
  verifyUser: (credentials: { enrollment: string; captchaInput: string }) => Promise<boolean>;
  /** Step 2 password submit */
  submitPassword: (credentials: { password: string }) => Promise<void>;
  backToIdentify: () => void;
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
  const [loginFlow, setLoginFlow] = useState<LoginFlow>("campuslynx");
  const [step, setStep] = useState<1 | 2>(1);
  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState("");

  const persistSession = useCallback(
    (enrollment: string, role: string) => {
      setIsAuthenticated(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("enrollment", enrollment.toUpperCase());
        localStorage.setItem("role", role);
      }
      router.push("/dashboard");
    },
    [router]
  );

  /**
   * Fetch captcha from backend
   */
  const fetchCaptcha = useCallback(async (options?: { keepError?: boolean }) => {
    setIsFetchingCaptcha(true);
    if (!options?.keepError) {
      setError(null);
    }

    try {
      const response = await axios.get(`${API_URL}/api/init`, {
        timeout: 60000,
      });

      setLoginFlow("campuslynx");
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
   * Unified single-screen login action
   */
  const submitLogin = useCallback(
    async (credentials: {
      enrollment: string;
      password: string;
      captchaInput: string;
    }): Promise<boolean> => {
      if (!captcha) {
        setError({ message: "Captcha not loaded. Please refresh." });
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Step 1: verify user & captcha
        const verifyRes = await axios.post(
          `${API_URL}/api/auth/verify-user`,
          {
            enrollment: credentials.enrollment.toUpperCase(),
            captcha: credentials.captchaInput,
            sessionToken: captcha.sessionToken,
          },
          { timeout: 60000, withCredentials: true }
        );

        const token = verifyRes.data.loginToken;
        setLoginToken(token);
        setPendingEnrollment(credentials.enrollment.toUpperCase());

        // Step 2: authenticate password
        const authRes = await axios.post(
          `${API_URL}/api/auth`,
          { loginToken: token, password: credentials.password },
          { timeout: 60000, withCredentials: true }
        );

        if (authRes.data.success) {
          if (authRes.data.sessionToken && typeof window !== "undefined") {
            localStorage.setItem("sessionToken", authRes.data.sessionToken);
          }
          persistSession(credentials.enrollment.toUpperCase(), "Student");
          return true;
        } else {
          setError({ message: authRes.data.error || "Authentication failed" });
          await fetchCaptcha({ keepError: true });
          return false;
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          const msg = err.response?.data?.error;
          if (status === 401 && msg && msg.toLowerCase().includes("password")) {
            setError({ field: "password", message: msg || "Invalid password." });
          } else if (status === 401) {
            setError({ field: "captcha", message: msg || "Invalid captcha or enrollment number." });
          } else {
            setError({ message: msg || "Unable to sign in. Please verify your details." });
          }
        } else {
          setError({ message: "An unexpected error occurred. Please try again." });
        }
        await fetchCaptcha({ keepError: true });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [captcha, fetchCaptcha, persistSession]
  );

  /**
   * Step 1: verify enrollment and captcha
   */
  const verifyUser = useCallback(
    async (credentials: { enrollment: string; captchaInput: string }): Promise<boolean> => {
      if (!captcha) {
        setError({ message: "Captcha not loaded. Please refresh." });
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await axios.post(
          `${API_URL}/api/auth/verify-user`,
          {
            enrollment: credentials.enrollment.toUpperCase(),
            captcha: credentials.captchaInput,
            sessionToken: captcha.sessionToken,
          },
          { timeout: 60000, withCredentials: true }
        );

        setLoginToken(response.data.loginToken);
        setPendingEnrollment(credentials.enrollment.toUpperCase());
        setStep(2);
        return true;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          const message =
            err.response?.data?.error ||
            (status === 401
              ? "Invalid enrollment number or captcha."
              : "Unable to verify your enrollment. Please try again.");
          setError({ message });
        } else {
          setError({ message: "An unexpected error occurred" });
        }
        await fetchCaptcha({ keepError: true });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [captcha, fetchCaptcha]
  );

  /**
   * Step 2: submit password
   */
  const submitPassword = useCallback(
    async (credentials: { password: string }): Promise<void> => {
      if (!loginToken) {
        setError({ message: "Your login session expired. Please start again." });
        setStep(1);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await axios.post(
          `${API_URL}/api/auth`,
          { loginToken, password: credentials.password },
          { timeout: 60000, withCredentials: true }
        );

        if (response.data.success) {
          if (response.data.sessionToken && typeof window !== "undefined") {
            localStorage.setItem("sessionToken", response.data.sessionToken);
          }
          persistSession(pendingEnrollment, "Student");
        } else {
          setError({ message: response.data.error || "Authentication failed" });
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          const code = err.response?.data?.code;
          if (code === "LOGIN_SESSION_EXPIRED") {
            setLoginToken(null);
            setStep(1);
            setError({
              message: "Your login session expired. Please enter your details again.",
            });
            await fetchCaptcha({ keepError: true });
          } else if (status === 401) {
            setError({ message: err.response?.data?.error || "Invalid password." });
          } else {
            setError({
              message:
                err.response?.data?.error || err.message || "Authentication failed",
            });
          }
        } else {
          setError({ message: "An unexpected error occurred" });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [loginToken, pendingEnrollment, fetchCaptcha, persistSession]
  );

  const backToIdentify = useCallback(() => {
    setStep(1);
    setLoginToken(null);
    fetchCaptcha();
  }, [fetchCaptcha]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetForm = useCallback(() => {
    setStep(1);
    setLoginToken(null);
    setPendingEnrollment("");
    setError(null);
    fetchCaptcha();
  }, [fetchCaptcha]);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  return {
    isLoading,
    isFetchingCaptcha,
    captcha,
    error,
    isAuthenticated,
    loginFlow,
    step,
    pendingEnrollment,
    fetchCaptcha,
    submitLogin,
    verifyUser,
    submitPassword,
    backToIdentify,
    clearError,
    resetForm,
  };
}
