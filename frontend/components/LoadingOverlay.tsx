/**
 * LoadingOverlay Component
 * Full-screen overlay shown while connecting or performing portal actions,
 * equipped with progressive loading feedback, timeout detection, and retry controls.
 */

import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { Typing } from "@/components/loading-ui/typing";
import { AlertCircle, RotateCcw, X } from "lucide-react";

export interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  timeoutMs?: number;
  onRetry?: () => void;
  onCancel?: () => void;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = "Connecting to your student portal...",
  timeoutMs = 45000,
  onRetry,
  onCancel,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setElapsed(0);
      setIsTimedOut(false);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const diff = Date.now() - startTime;
      setElapsed(diff);
      if (diff >= timeoutMs) {
        setIsTimedOut(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, timeoutMs]);

  if (!isVisible) return null;

  const getDynamicMessage = () => {
    if (elapsed > 25000) {
      return "Still establishing connection to university portal... Hang tight.";
    }
    if (elapsed > 12000) {
      return "Connecting to server (waking up cloud service, this may take a moment)...";
    }
    if (elapsed > 4000) {
      return "Establishing secure portal session...";
    }
    return message;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Loading"
      className={clsx(
        "fixed inset-0 bg-[var(--surface-page)]/95 backdrop-blur-sm",
        "flex items-center justify-center z-[9999] transition-all duration-300"
      )}
    >
      <div className="flex flex-col items-center gap-6 text-center px-6 max-w-sm w-full animate-fade-in">
        {!isTimedOut ? (
          <>
            <Typing size="lg" duration={0.85} count={3} className="text-accent-primary" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--ink-strong)] font-nunito tracking-wide">
                {getDynamicMessage()}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">
                {elapsed > 4000 ? "Syncing with CampusLynx servers" : "Please wait a moment"}
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 p-6 shadow-sm w-full space-y-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 font-nunito">
                Portal connection delayed
              </h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                The university portal is responding slowly. You can retry or return to the form.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-1">
              {onRetry && (
                <button
                  type="button"
                  onClick={() => {
                    setIsTimedOut(false);
                    setElapsed(0);
                    onRetry();
                  }}
                  className="px-4 py-2 rounded-xl bg-accent-primary text-white text-xs font-bold hover:bg-accent-primary/90 flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Try again
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-700 text-xs font-semibold text-[var(--ink-muted)] hover:bg-gray-100 dark:hover:bg-slate-800 transition active:scale-95"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

LoadingOverlay.displayName = "LoadingOverlay";

