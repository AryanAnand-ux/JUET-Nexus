"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success", durationMs = 3500) => {
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type }]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, durationMs?: number) => showToast(message, "success", durationMs),
    [showToast]
  );
  const error = useCallback(
    (message: string, durationMs?: number) => showToast(message, "error", durationMs),
    [showToast]
  );
  const info = useCallback(
    (message: string, durationMs?: number) => showToast(message, "info", durationMs),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast container floating at the bottom, above mobile navigation */}
      <div
        aria-live="polite"
        className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto pointer-events-none px-2"
      >
        {toasts.map((t) => {
          const typeBorders = {
            success: "border-emerald-500/30 dark:border-emerald-500/40",
            error: "border-rose-500/30 dark:border-rose-500/40",
            warning: "border-amber-500/30 dark:border-amber-500/40",
            info: "border-neutral-300 dark:border-neutral-700",
          };

          const icon =
            t.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : t.type === "error" ? (
              <XCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            ) : t.type === "warning" ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
            );

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border shadow-xl bg-white dark:bg-[#1E1E1E] transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-full ${typeBorders[t.type]}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {icon}
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 break-words leading-tight">
                  {t.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 rounded-lg transition-colors cursor-pointer shrink-0 ml-1"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return context;
}
