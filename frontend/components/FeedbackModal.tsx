"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Send,
  MessageSquare,
  Bug,
  Sparkles,
  Palette,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Star,
  Mail,
} from "lucide-react";
import { useFeedback } from "@/hooks/useFeedback";
import type { FeedbackCategory, FeedbackPayload } from "@/types";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: FeedbackCategory;
  enrollment?: string;
  studentName?: string;
}

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
    color: "text-indigo-500",
    activeBg: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800",
    border: "hover:border-indigo-300",
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

  const { submitFeedback, isSubmitting, result, error, reset } = useFeedback();

  useEffect(() => {
    if (isOpen) {
      reset();
      setCategory(defaultCategory);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, defaultCategory, reset]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const metadata = {
      url: typeof window !== "undefined" ? window.location.href : "",
      device: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
      userAgent: typeof window !== "undefined" ? navigator.userAgent : "",
    };

    const payload: FeedbackPayload = {
      category,
      subject: subject.trim() || `${category.toUpperCase()} from ${enrollment || "Student"}`,
      message: message.trim(),
      email: email.trim() || undefined,
      enrollment: enrollment || undefined,
      name: studentName || undefined,
      rating,
      metadata,
    };

    try {
      await submitFeedback(payload);
    } catch {
      // Handled in hook
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-2xl overflow-hidden transition-all duration-300 z-10 font-nunito max-h-[90vh] flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 text-white p-5 sm:p-6 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors touch-manipulation active:scale-95"
            aria-label="Close feedback modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold mb-2 border border-zinc-700">
            <Mail className="w-3.5 h-3.5 text-zinc-300" />
            <span>Direct to juetnexus@gmail.com</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black tracking-tight">
            Share Your Feedback
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">
            Help us improve JUET Nexus for all students.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {result?.success ? (
            /* Success State */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  Feedback Received!
                </h4>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-300 max-w-sm mx-auto">
                  {result.message}
                </p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center items-center">
                {result.fallbackMailto && (
                  <a
                    href={result.fallbackMailto}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors w-full sm:w-auto"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Email App / Gmail</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-slate-100 text-white dark:text-gray-900 text-xs font-bold hover:bg-gray-800 dark:hover:bg-white transition-colors w-full sm:w-auto"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Feedback Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="border border-rose-200 dark:border-rose-900/50 rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{error}</p>
                    <a
                      href={`mailto:juetnexus@gmail.com?subject=Feedback&body=${encodeURIComponent(message)}`}
                      className="underline font-bold mt-1 inline-block"
                    >
                      Click here to email juetnexus@gmail.com directly
                    </a>
                  </div>
                </div>
              )}

              {/* Category Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
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
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left ${
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
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                  Subject / Summary
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Attendance percentage mismatch or suggestion"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all touch-manipulation"
                  maxLength={100}
                />
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
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
                  placeholder="Describe what happened, any suggestions, or features you'd like to see..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none touch-manipulation"
                />
              </div>

              {/* Rating + Optional Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
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
                          className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-300 dark:text-slate-700 hover:scale-110 active:scale-95 transition-transform touch-manipulation"
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1.5">
                    Your Email <span className="text-gray-400 normal-case">(optional for reply)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="enrollment@juetguna.in"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all touch-manipulation"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3 flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-400 dark:text-slate-500">
                  Recipient: <strong className="text-gray-600 dark:text-slate-300">juetnexus@gmail.com</strong>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{isSubmitting ? "Sending..." : "Send Feedback"}</span>
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
