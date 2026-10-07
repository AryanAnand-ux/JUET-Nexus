import type { FeedbackCategory } from "../../../shared/types";

const recentSubmissions = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60 seconds

export function resetRecentSubmissions(): void {
  recentSubmissions.clear();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: {
    category: FeedbackCategory;
    subject?: string;
    message: string;
    rating?: number | null;
    name?: string | null;
    email?: string | null;
    enrollment?: string | null;
    metadata?: Record<string, any> | null;
  };
}

export function validateFeedback(
  body: any,
  clientIp?: string
): ValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid feedback payload" };
  }

  // Honeypot anti-spam check (supports 'honeypot' or 'website')
  if (body.honeypot || body.website) {
    return { valid: false, error: "Automated submission rejected" };
  }

  // Message validation
  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!rawMessage) {
    return { valid: false, error: "Message is required" };
  }
  if (rawMessage.length < 3) {
    return { valid: false, error: "Message must be at least 3 characters" };
  }

  // Rating validation
  let rating: number | null = null;
  if (body.rating !== undefined && body.rating !== null && body.rating !== "") {
    const num = Number(body.rating);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
      return { valid: false, error: "Rating must be between 1 and 5" };
    }
    rating = num;
  }

  // Email validation
  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    const trimmedEmail = String(body.email).trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      return { valid: false, error: "Please enter a valid email address" };
    }
    email = trimmedEmail || null;
  }

  // Duplicate spam detection based on IP and exact message
  if (clientIp) {
    const key = `${clientIp}:${rawMessage.toLowerCase()}`;
    const lastTimestamp = recentSubmissions.get(key);
    const now = Date.now();
    if (lastTimestamp && now - lastTimestamp < DUPLICATE_WINDOW_MS) {
      return {
        valid: false,
        error: "You have recently submitted this exact feedback. Please wait before submitting again.",
      };
    }
    recentSubmissions.set(key, now);
  }

  const category: FeedbackCategory =
    body.category && ["bug", "feature", "improvement", "general"].includes(body.category)
      ? body.category
      : "general";

  return {
    valid: true,
    sanitized: {
      category,
      subject: body.subject ? String(body.subject).trim() : undefined,
      message: rawMessage,
      rating,
      name: body.name ? String(body.name).trim() : null,
      email,
      enrollment: body.enrollment ? String(body.enrollment).trim() : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
    },
  };
}
