"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, MessageSquare, X } from "lucide-react";

export interface DevelopmentBannerProps {
  /** Callback triggered when clicking the feedback action button */
  onOpenFeedback?: () => void;
  /** Callback triggered when the banner is dismissed */
  onDismiss?: () => void;
  /** Storage key to persist dismissal across sessions */
  storageKey?: string;
  /** Optional additional CSS classes */
  className?: string;
}

const DEFAULT_STORAGE_KEY = "juet_nexus_dev_banner_dismissed_v1";

/**
 * Dismissible announcement banner indicating that the app is under active development
 * and encouraging users to share feedback.
 */
export const DevelopmentBanner: React.FC<DevelopmentBannerProps> = ({
  onOpenFeedback,
  onDismiss,
  storageKey = DEFAULT_STORAGE_KEY,
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem(storageKey);
      if (!isDismissed) {
        setIsVisible(true);
      }
    } catch {
      // In case localStorage is blocked or unavailable
      setIsVisible(true);
    }
  }, [storageKey]);

  const handleClose = () => {
    setIsClosing(true);
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Ignore localStorage write error
    }

    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 200);
  };

  if (!isVisible) return null;

  return (
    <div
      role="region"
      aria-label="Development announcement"
      className={`relative overflow-hidden rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/90 via-purple-50/60 to-slate-50/90 dark:from-slate-900/90 dark:via-indigo-950/40 dark:to-slate-900/90 p-3.5 sm:p-4 text-slate-800 dark:text-slate-200 shadow-sm transition-all duration-200 ${
        isClosing ? "opacity-0 scale-[0.99]" : "opacity-100 scale-100"
      } ${className}`}
    >
      {/* Subtle background glow */}
      <div
        className="absolute top-0 right-1/4 w-36 h-36 bg-indigo-500/10 dark:bg-indigo-400/10 rounded-full blur-2xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-start sm:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Icon & Message */}
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40 mt-0.5 sm:mt-0"
            aria-hidden="true"
          >
            <Sparkles className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1 sm:mb-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100/90 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 dark:border dark:border-indigo-800/60 font-nunito">
                Under Active Development
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium font-nunito leading-snug">
              JUET Nexus is still in development. Notice a glitch or have ideas to improve your experience? We&apos;d love your feedback!
            </p>
          </div>
        </div>

        {/* Right: Action & Close Button */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          {onOpenFeedback && (
            <button
              type="button"
              onClick={onOpenFeedback}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-3 py-1.5 text-xs font-bold font-nunito shadow-sm transition-all duration-150 active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Share Feedback</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            aria-label="Dismiss development announcement"
            title="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile-only Share Feedback button row */}
      {onOpenFeedback && (
        <div className="mt-2.5 pt-2.5 border-t border-indigo-100/70 dark:border-indigo-900/40 flex items-center justify-between sm:hidden">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-nunito">
            Help us improve
          </span>
          <button
            type="button"
            onClick={onOpenFeedback}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-bold font-nunito shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <MessageSquare className="h-3 w-3" />
            <span>Share Feedback</span>
          </button>
        </div>
      )}
    </div>
  );
};

DevelopmentBanner.displayName = "DevelopmentBanner";
