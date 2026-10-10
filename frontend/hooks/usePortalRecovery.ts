"use client";

import { useCallback, useState } from "react";
import axios from "axios";
import { apiClient } from "@/utils/api";
import { solveCampusLynxCaptcha } from "@/utils/captchaSolver";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function usePortalRecovery(enrollment: string | null, onRecovered: () => Promise<void>) {
  const [password, setPassword] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recover = useCallback(async () => {
    if (!enrollment || !password) {
      setError("Enter your portal password to reconnect.");
      return false;
    }

    setIsRecovering(true);
    setError(null);
    try {
      const captchaResponse = await axios.get(`${API_URL}/api/init`, {
        timeout: 30000,
        withCredentials: true,
      });
      const captcha = captchaResponse.data;
      let captchaText = "";
      try {
        captchaText = await solveCampusLynxCaptcha(captcha.captchaImage);
      } catch {
        captchaText = "";
      }
      if (!captchaText) {
        setError("Automatic captcha solving was not confident. Refresh the login page and enter the captcha manually.");
        return false;
      }

      const verify = await axios.post(
        `${API_URL}/api/auth/verify-user`,
        {
          enrollment: enrollment.toUpperCase(),
          captcha: captchaText,
          sessionToken: captcha.sessionToken,
        },
        { timeout: 30000, withCredentials: true }
      );
      await axios.post(
        `${API_URL}/api/auth`,
        { loginToken: verify.data.loginToken, password },
        { timeout: 30000, withCredentials: true }
      );
      await apiClient.get("/api/auth/session");
      setPassword("");
      await onRecovered();
      return true;
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Portal reconnection failed. Please try again.";
      setError(message);
      return false;
    } finally {
      setPassword("");
      setIsRecovering(false);
    }
  }, [enrollment, onRecovered, password]);

  return { password, setPassword, isRecovering, error, recover };
}
