"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Send,
  MessageSquare,
  Bug,
  Sparkles,
  Palette,
  CheckCircle2,
  ExternalLink,
  Star,
  Mail,
  MailQuestion,
} from "lucide-react";
import type { FeedbackCategory } from "@/types";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: FeedbackCategory;
  enrollment?: string;
  studentName?: string;
}

const TARGET_EMAIL = "juetnexus@gmail.com";

const CATEGORIES: {
  id: FeedbackCategory;
  label: string;
  icon: React.ReactNode;
  color: string;
  activeBg: string;
  border: string;
}[] = [
  {
    id: "bug",
    label: "Bug Report",
    icon: <Bug className="w-4 h-4" />,
    color: "text-rose-500",
    activeBg: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800",
    border: "hover:border-rose-300",
  },
  {
    id: "feature",
    label: "Feature Request",
    icon: <Sparkles className="w-4 h-4" />,
    color: "text-amber-500",
    activeBg: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800",
    border: "hover:border-amber-300",
  },
  {
    id: "improvement",
    label: "UI / Design",
    icon: <Palette className="w-4 h-4" />,
    color: "text-purple-500",
    activeBg: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-800",
    border: "hover:border-purple-300",
  },
  {
    id: "general",
    label: "General Feedback",
    icon: <MessageSquare className="w-4 h-4" />,
    color: "text-brand-600",
    activeBg: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-100 border-brand-300 dark:border-brand-500/40",
    border: "hover:border-brand-300",
  },
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = "general",
  enrollment,
  studentName,
}) => {
  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [gmailUrl, setGmailUrl] = useState("");
  const [mailtoUrl, setMailtoUrl] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory);
      setIsSubmitted(false);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, defaultCategory]);

  const currentCategoryObj = CATEGORIES.find((c) => c.id === category) || CATEGORIES[3];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const currentUrl = typeof window !== "undefined" ? window.location.href : "JUET Nexus";
    const screenRes = typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "Unknown";
    const userAgent = typeof window !== "undefined" ? navigator.userAgent : "Unknown";
    const formattedDate = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "short",
    });

    const emailSubject = `[JUET Nexus Feedback] [${currentCategoryObj.label}] ${
      subject.trim() || `Feedback from ${studentName || enrollment || "Student"}`
    }`;

    const studentInfo = [
      studentName ? `Name: ${studentName}` : null,
      enrollment ? `Enrollment: ${enrollment}` : null,
      email.trim() ? `Reply-to Email: ${email.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const emailBody = [
      "Hi JUET Nexus Team,",
      "",
      "--- FEEDBACK DETAILS ---",
      `Category: ${currentCategoryObj.label}`,
      `Experience Rating: ${rating} / 5`,
      ...(studentInfo ? [studentInfo] : []),
      "",
      ...(subject.trim() ? [`Subject / Topic: ${subject.trim()}`, ""] : []),
      "Message / Suggestions:",
      message.trim(),
      "",
      "--------------------------------------------------",
      "SYSTEM & DIAGNOSTICS:",
      `• App: JUET Nexus`,
      `• Page: ${currentUrl}`,
      `• Screen Size: ${screenRes}`,
      `• Browser: ${userAgent}`,
      `• Timestamp: ${formattedDate} (IST)`,
      "--------------------------------------------------",
    ].join("\n");

    const webGmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      TARGET_EMAIL
    )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

    const mailto = `mailto:${TARGET_EMAIL}?subject=${encodeURIComponent(
      emailSubject
    )}&body=${encodeURIComponent(emailBody)}`;

    setGmailUrl(webGmail);
    setMailtoUrl(mailto);
    setIsSubmitted(true);

    // Open Gmail web compose in a new tab
    if (typeof window !== "undefined") {
      try {
        const win = window.open(webGmail, "_blank", "noopener,noreferrer");
        // If window.open was blocked by popup blocker, fall back to mailto after a tiny delay
        if (!win || win.closed || typeof win.closed === "undefined") {
          window.location.href = mailto;
        }
      } catch {
        window.location.href = mailto;
      }
    }
  };

  const handleReset = () => {
    setMessage("");
    setSubject("");
    setEmail("");
    setRating(5);
    setIsSubmitted(false);
  };

  // Focus the modal container when it opens so keyboard/screen-reader users
  // are immediately placed inside the dialog.
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => {
      prev?.focus();
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 overflow-y-auto"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[var(--surface-card)] border border-[var(--line-subtle)] shadow-2xl overflow-hidden transition-all duration-300 z-10 max-h-[92vh] flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0 focus:outline-none"
      >
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-midnight via-carbon to-midnight text-white p-5 sm:p-6 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors touch-manipulation active:scale-95 cursor-pointer"
            aria-label="Close feedback modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-brand-100 text-[10px] font-semibold uppercase tracking-[0.14em] mb-3 border border-white/10">
            <Mail className="w-3.5 h-3.5" />
            <span>Direct to {TARGET_EMAIL}</span>
          </div>

          <h3 id="feedback-modal-title" className="text-xl sm:text-2xl font-editorial-italic font-normal tracking-normal">
            Share Your Feedback
          </h3>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto">
          {isSubmitted ? (
            /* Success State */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <h4 className="text-xl font-editorial-italic font-normal text-[var(--ink-strong)]">
                  Ready in Gmail!
                </h4>
                <p className="mt-1.5 text-xs sm:text-sm text-[var(--ink-body)] max-w-sm mx-auto leading-relaxed">
                  We opened Gmail with your feedback pre-filled. Just review and click <strong>Send</strong>.
                </p>
              </div>

              {/* Quick links to open if blocked */}
              <div className="pt-3 flex flex-col gap-2.5 max-w-sm mx-auto">
                <a
                  href={gmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-brand-500/30 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-100 text-xs font-semibold hover:bg-brand-100 dark:hover:bg-brand-500/25 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Gmail Web Compose</span>
                </a>

                <a
                  href={mailtoUrl}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] text-[var(--ink-body)] text-xs font-semibold hover:bg-[var(--line-subtle)] transition-colors"
                >
                  <MailQuestion className="w-4 h-4 text-[var(--ink-muted)]" />
                  <span>Open in Default Mail App</span>
                </a>
              </div>

              <div className="pt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-strong)] transition-colors cursor-pointer"
                >
                  Send Another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-midnight dark:bg-brand-600 text-white text-xs font-semibold hover:bg-carbon dark:hover:bg-brand-500 transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Simple Feedback Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category Picker */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-2">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left cursor-pointer ${
                          isSelected
                            ? cat.activeBg
                            : `border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/60 ${cat.border}`
                        }`}
                      >
                        <span className={cat.color}>{cat.icon}</span>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                  Subject / Summary <span className="text-[var(--ink-muted)] normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Attendance percentage mismatch or suggestion"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-strong)] placeholder-[var(--ink-muted)] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/25 focus:border-accent-primary transition-all touch-manipulation"
                  maxLength={100}
                />
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                    Your Feedback <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
                    {message.length} chars
                  </span>
                </div>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the issue or suggestion in detail..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-strong)] placeholder-[var(--ink-muted)] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/25 focus:border-accent-primary transition-all resize-none touch-manipulation"
                />
              </div>

              {/* Rating + Optional Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                    How is your experience?
                  </label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = hoverRating ? star <= hoverRating : star <= rating;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => setRating(star)}
                          className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-300 dark:text-slate-700 hover:scale-110 active:scale-95 transition-transform touch-manipulation cursor-pointer"
                          aria-label={`${star} star`}
                        >
                          <Star
                            className={`w-5 h-5 ${
                              active
                                ? "fill-amber-400 text-amber-400"
                                : "text-gray-300 dark:text-slate-600"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)] mb-1.5">
                    Your Email <span className="text-[var(--ink-muted)] normal-case font-normal">(optional for reply)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="enrollment@juetguna.in"
                    className="w-full px-3.5 py-2 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-strong)] placeholder-[var(--ink-muted)] text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-accent-primary/25 focus:border-accent-primary transition-all touch-manipulation"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3 border-t border-[var(--line-subtle)] flex items-center justify-between gap-3">
                <span className="text-[11px] text-[var(--ink-muted)] truncate">
                  Opens in <strong className="text-[var(--accent-text)]">Gmail</strong>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-[var(--line-subtle)] text-[var(--ink-muted)] text-xs font-semibold hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={!message.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-semibold shadow-card transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit & Open Gmail</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
