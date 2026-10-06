import { useState, useCallback } from "react";
import axios from "axios";
import type { FeedbackPayload, FeedbackResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function useFeedback() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitFeedback = async (payload: FeedbackPayload): Promise<FeedbackResponse> => {
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post<FeedbackResponse>(
        `${API_URL}/api/feedback`,
        payload,
        { withCredentials: true }
      );
      setResult(response.data);
      return response.data;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Failed to submit feedback";
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsSubmitting(false);
  }, []);

  return {
    submitFeedback,
    isSubmitting,
    result,
    error,
    reset,
  };
}
