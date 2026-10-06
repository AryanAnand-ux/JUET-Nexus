/**
 * useAuthFlow Hook
 *
 * Drives whichever login shape the backend reports from `GET /api/init`:
 *
 *   loginFlow === "webkiosk"   legacy single step
 *     submitLogin({ enrollment, dob, password, captchaInput, role })
 *
 *   loginFlow === "campuslynx" portal two-step
 *     step 1  verifyUser({ enrollment, captchaInput })  -> advances to step 2
 *     step 2  submitPassword({ password })              -> session + redirect
 *
 * The flow is chosen entirely by the backend (`DATA_PROVIDER`), so the UI never
 * hard-codes a provider. `verifyUser` refreshes the captcha on failure because
 * the portal consumes a captcha on every attempt, valid or not.
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
  /** Which login form to render. Always campuslynx. */
  loginFlow: LoginFlow;
  /** CampusLynx step: 1 = identify, 2 = password. */
  step: 1 | 2;
  /** Enrollment captured at step 1, shown (read-only) at step 2. */
  pendingEnrollment: string;

  // Actions
  fetchCaptcha: (options?: { keepError?: boolean }) => Promise<void>;
  /** CampusLynx step 1. Resolves true when the flow advanced to step 2. */
  verifyUser: (credentials: { enrollment: string; captchaInput: string }) => Promise<boolean>;
  /** CampusLynx step 2. */
  submitPassword: (credentials: { password: string }) => Promise<void>;
  /** Return to step 1 and fetch a fresh captcha. */
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
  // Matches the backend's default provider (campuslynx); corrected by /api/init
  // on every load. The loading overlay covers the form until it answers, so a
  // webkiosk-fallback deployment never flashes the wrong fields.
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
   *
   * @param options.keepError Suppress the `setError(null)` that normally clears a
   * stale message. Callers that refresh the captcha *because* something just
   * failed pass this, otherwise the reason for the refresh is wiped and the user
   * is left staring at a new captcha with no explanation.
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
   * CampusLynx step 1: identify the user with the enrollment and captcha answer.
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
        // The portal consumes the captcha on every attempt; refresh it so the
        // user is not stuck retrying against a dead one, but keep the error so
        // they learn why it failed.
        await fetchCaptcha({ keepError: true });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [captcha, fetchCaptcha]
  );

  /**
   * CampusLynx step 2: exchange the login handle plus password for a session.
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
          persistSession(pendingEnrollment, "Student");
        } else {
          setError({ message: response.data.error || "Authentication failed" });
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          const code = err.response?.data?.code;
          if (code === "LOGIN_SESSION_EXPIRED") {
            // The handle is gone; there is nothing to retry against.
            setLoginToken(null);
            setStep(1);
            setError({
              message: "Your login session expired. Please enter your details again.",
            });
            await fetchCaptcha({ keepError: true });
          } else if (status === 401) {
            // Wrong password: keep the handle so the user can retry without a
            // new captcha (the backend deliberately does not consume it).
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
        console.error("Authentication error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [loginToken, pendingEnrollment, fetchCaptcha, persistSession]
  );

  /**
   * CampusLynx: abandon step 2 and return to identify with a fresh captcha.
   */
  const backToIdentify = useCallback(() => {
    setLoginToken(null);
    setPendingEnrollment("");
    setStep(1);
    setError(null);
    fetchCaptcha();
  }, [fetchCaptcha]);

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
    setLoginToken(null);
    setPendingEnrollment("");
    setStep(1);
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
    loginFlow,
    step,
    pendingEnrollment,
    fetchCaptcha,
    verifyUser,
    submitPassword,
    backToIdentify,
    clearError,
    resetForm,
  };
}
