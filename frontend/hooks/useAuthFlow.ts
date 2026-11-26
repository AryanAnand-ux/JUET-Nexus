/**
 * useAuthFlow Hook (One-Hop Architecture)
 *
 * Drives CampusLynx authentication directly from the browser via /api/proxy/*:
 *   1. GET  /api/proxy/token/getcaptcha
 *   2. POST /api/proxy/token/pretoken-check   (AES-128-CBC encrypted)
 *   3. POST /api/proxy/token/generatewebtoken (AES-128-CBC encrypted)
 *   4. Persist session + encrypted password in localStorage for silent recovery
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markSessionFresh } from "@/hooks/useSessionKeepAlive";
import {
  getCaptcha,
  preTokenCheck,
  generateWebToken,
  type PortalCaptcha,
  type PortalPreToken,
} from "@/lib/portalClient";
import { saveCredentials } from "@/lib/session";
import { PortalError } from "@/lib/errors";
import type { LoginFlow } from "@/types";

interface CaptchaState {
  image: string;
  sessionToken: string;
  captchaValue: string | null;
  raw: PortalCaptcha;
}

export interface AuthError {
  field?: string;
  message: string;
}

export interface UseAuthFlowReturn {
  isLoading: boolean;
  isFetchingCaptcha: boolean;
  captcha: CaptchaState | null;
  error: AuthError | null;
  isAuthenticated: boolean;
  loginFlow: LoginFlow;
  step: 1 | 2;
  pendingEnrollment: string;
  fetchCaptcha: (options?: { keepError?: boolean }) => Promise<void>;
  submitLogin: (credentials: {
    enrollment: string;
    password: string;
    captchaInput: string;
  }) => Promise<boolean>;
  verifyUser: (credentials: { enrollment: string; captchaInput: string }) => Promise<boolean>;
  submitPassword: (credentials: { password: string }) => Promise<void>;
  backToIdentify: () => void;
  clearError: () => void;
  cancelAuth: () => void;
  resetForm: () => void;
}

function toDataUri(image: string): string {
  if (!image) return "";
  return image.startsWith("data:") ? image : `data:image/png;base64,${image}`;
}

export function useAuthFlow(): UseAuthFlowReturn {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCaptcha, setIsFetchingCaptcha] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginFlow] = useState<LoginFlow>("campuslynx");
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingEnrollment, setPendingEnrollment] = useState("");
  const preTokenRef = useRef<PortalPreToken | null>(null);
  const authAbortRef = useRef<AbortController | null>(null);

  const completeLogin = useCallback(
    async (enrollment: string, password: string) => {
      // Never block navigation on IndexedDB; race against 1.5s timeout
      await Promise.race([
        saveCredentials(enrollment.toUpperCase(), password),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      markSessionFresh();
      setIsAuthenticated(true);
      router.push("/dashboard");
    },
    [router]
  );

  const fetchCaptcha = useCallback(async (options?: { keepError?: boolean }) => {
    setIsFetchingCaptcha(true);
    if (!options?.keepError) {
      setError(null);
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await getCaptcha();
        setCaptcha({
          image: toDataUri(raw.image),
          sessionToken: raw.hidden,
          captchaValue: null,
          raw,
        });
        setIsFetchingCaptcha(false);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }

    const message =
      lastError instanceof PortalError
        ? lastError.message
        : "Portal connection timed out or is unavailable. Please click refresh to retry.";

    setError({ message });
    setIsFetchingCaptcha(false);
  }, []);

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

      authAbortRef.current?.abort();
      const controller = new AbortController();
      authAbortRef.current = controller;

      setIsLoading(true);
      setError(null);
      const enrollment = credentials.enrollment.trim().toUpperCase();

      try {
        const pre = await preTokenCheck(
          {
            username: enrollment,
            usertype: "S",
            captcha: { ...captcha.raw, captcha: credentials.captchaInput.trim() },
          },
          controller.signal
        );

        if (pre.otppwd !== "PWD") {
          setError({
            message:
              "This account requires an emailed one-time password, which is not supported yet.",
          });
          await fetchCaptcha({ keepError: true });
          return false;
        }

        preTokenRef.current = pre;
        setPendingEnrollment(enrollment);

        await generateWebToken(
          {
            otppwd: pre.otppwd,
            username: enrollment,
            passwordotpvalue: credentials.password,
            random: pre.random,
          },
          controller.signal
        );

        await completeLogin(enrollment, credentials.password);
        return true;
      } catch (err) {
        if (controller.signal.aborted) {
          return false;
        }
        if (err instanceof PortalError) {
          if (err.code === "INVALID_PASSWORD") {
            setError({ field: "password", message: err.message });
          } else if (err.code === "INVALID_CAPTCHA") {
            setError({ field: "captcha", message: err.message });
          } else {
            setError({ message: err.message });
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
    [captcha, fetchCaptcha, completeLogin]
  );

  const verifyUser = useCallback(
    async (credentials: {
      enrollment: string;
      captchaInput: string;
    }): Promise<boolean> => {
      if (!captcha) {
        setError({ message: "Captcha not loaded. Please refresh." });
        return false;
      }

      setIsLoading(true);
      setError(null);
      const enrollment = credentials.enrollment.trim().toUpperCase();

      try {
        const pre = await preTokenCheck({
          username: enrollment,
          usertype: "S",
          captcha: { ...captcha.raw, captcha: credentials.captchaInput.trim() },
        });

        if (pre.otppwd !== "PWD") {
          setError({
            message:
              "This account requires an emailed one-time password, which is not supported yet.",
          });
          await fetchCaptcha({ keepError: true });
          return false;
        }

        preTokenRef.current = pre;
        setPendingEnrollment(enrollment);
        setStep(2);
        return true;
      } catch (err) {
        setError({
          message:
            err instanceof PortalError
              ? err.message
              : "Invalid enrollment number or captcha.",
        });
        await fetchCaptcha({ keepError: true });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [captcha, fetchCaptcha]
  );

  const submitPassword = useCallback(
    async (credentials: { password: string }): Promise<void> => {
      const pre = preTokenRef.current;
      if (!pre || !pendingEnrollment) {
        setError({ message: "Your login session expired. Please start again." });
        setStep(1);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await generateWebToken({
          otppwd: pre.otppwd,
          username: pendingEnrollment,
          passwordotpvalue: credentials.password,
          random: pre.random,
        });

        await completeLogin(pendingEnrollment, credentials.password);
      } catch (err) {
        setError({
          message:
            err instanceof PortalError ? err.message : "Authentication failed",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [pendingEnrollment, completeLogin]
  );

  const backToIdentify = useCallback(() => {
    setStep(1);
    preTokenRef.current = null;
    fetchCaptcha();
  }, [fetchCaptcha]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const cancelAuth = useCallback(() => {
    authAbortRef.current?.abort();
    authAbortRef.current = null;
    setIsLoading(false);
    setError(null);
  }, []);

  const resetForm = useCallback(() => {
    setStep(1);
    preTokenRef.current = null;
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
    cancelAuth,
    resetForm,
  };
}
