"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useDashboard } from "@/hooks/useDashboard";
import { useFeedback } from "@/hooks/useFeedback";
import { performLogout } from "@/utils/logout";
import {
  Mail,
  Send,
  Bug,
  Sparkles,
  Palette,
  MessageSquare,
  Star,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import type { FeedbackCategory, FeedbackPayload } from "@/types";

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

export default function FeedbackPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<string | null>(null);

  useEffect(() => {
    const storedEnrollment = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
    if (!storedEnrollment) {
      router.push("/login");
    } else {
      setEnrollment(storedEnrollment);
    }
  }, [router]);

  const { data: dashboardData } = useDashboard(enrollment);

  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const { submitFeedback, isSubmitting, result, error, reset } = useFeedback();

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

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
      name: dashboardData?.student?.name || undefined,
      rating,
      metadata,
    };

    try {
      await submitFeedback(payload);
    } catch {
      // Handled in hook
    }
  };

  if (!enrollment) return null;

  return (
    <DashboardLayout
      studentName={dashboardData?.student?.name || "Student"}
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-950 text-white p-6 sm:p-8 shadow-xl border border-indigo-900/30">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3 border border-indigo-500/30">
              <Mail className="w-3.5 h-3.5 text-indigo-400" />
              <span>Direct to juetnexus@gmail.com</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Share Your Feedback
            </h2>
            <p className="mt-1 text-sm text-indigo-200/80 font-medium">
              Report bugs, suggest new features, or let us know how JUET Nexus is helping you.
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl border border-gray-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
          {result?.success ? (
            /* Success confirmation */
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                Thank You for Your Feedback!
              </h3>
              <p className="text-sm text-gray-600 dark:text-slate-300 max-w-md mx-auto">
                {result.message}
              </p>

              <div className="pt-6 flex flex-col sm:flex-row gap-3 justify-center">
                {result.fallbackMailto && (
                  <a
                    href={result.fallbackMailto}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in Gmail / Email App</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setMessage("");
                    setSubject("");
                  }}
                  className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-slate-100 text-white dark:text-gray-900 text-xs font-bold hover:bg-gray-800 dark:hover:bg-white transition-colors"
                >
                  Send Another Note
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="border border-rose-200 dark:border-rose-900/50 rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-4 flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300">
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
                  Feedback Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 p-3 rounded-2xl text-xs font-bold border transition-all text-center sm:text-left ${
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
                  Subject / Topic
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Attendance percentage mismatch or suggestion"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  maxLength={100}
                />
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    Your Message <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
                    {message.length} chars
                  </span>
                </div>
                <textarea
                  rows={5}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your suggestion or issue in detail..."
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                />
              </div>

              {/* Experience rating + email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                    How is your experience with JUET Nexus?
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = hoverRating ? star <= hoverRating : star <= rating;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => setRating(star)}
                          className="p-1 text-gray-300 dark:text-slate-700 hover:scale-110 transition-transform"
                          aria-label={`${star} star`}
                        >
                          <Star
                            className={`w-6 h-6 ${
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
                    Your Email <span className="text-gray-400 normal-case">(optional for response)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@juet.ac.in"
                    className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Submit footer */}
              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  Recipient: <strong className="text-indigo-600 dark:text-indigo-400">juetnexus@gmail.com</strong>
                </span>

                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{isSubmitting ? "Sending..." : "Send Feedback"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
