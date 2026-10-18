"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { X, ShieldCheck, AlertTriangle, Lock, FileText, CheckCircle2 } from "lucide-react";

export interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

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
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[var(--surface-card)] border border-[var(--line-subtle)] shadow-2xl overflow-hidden z-10 max-h-[92vh] flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0 focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6355D8]/10 dark:bg-[#6355D8]/20 flex items-center justify-center text-[#6355D8] dark:text-brand-300 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 id="terms-modal-title" className="text-xl sm:text-2xl font-editorial-italic font-normal text-[var(--ink-strong)] tracking-normal">
                Terms &amp; Conditions
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                Please review before continuing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Terms & Conditions"
            className="p-2 -mr-1 -mt-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer touch-manipulation active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-sm text-[var(--ink-body)] leading-relaxed">
          <div className="font-semibold text-slate-700 dark:text-slate-200 bg-[#6355D8]/5 dark:bg-[#6355D8]/10 border border-[#6355D8]/15 rounded-2xl p-3.5 text-xs">
            By using <span className="font-bold text-[#6355D8] dark:text-brand-300">JUET Nexus</span>, you agree to the following:
          </div>

          {/* Section 1: Data Usage */}
          <div className="space-y-1.5 rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3>Data Usage</h3>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li>
                JUET Nexus accesses your academic data (like attendance, results, and schedules) directly from the official JUET portal.
              </li>
              <li>
                No personal or academic data is stored on any external servers.
              </li>
              <li>
                Your login credentials are saved only on your device for your convenience.
              </li>
            </ul>
          </div>

          {/* Section 2: Disclaimer */}
          <div className="space-y-1.5 rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
              <h3>Disclaimer</h3>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li>
                JUET Nexus is an independent student project and is not officially affiliated with JUET University.
              </li>
              <li>
                While we strive to ensure data accuracy, we are not responsible for discrepancies due to portal changes or downtime.
              </li>
            </ul>
          </div>

          {/* Section 3: User Responsibility */}
          <div className="space-y-1.5 rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
              <Lock className="w-4 h-4 text-[#6355D8] dark:text-brand-300 shrink-0" />
              <h3>User Responsibility</h3>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li>
                You are responsible for keeping your credentials private and secure.
              </li>
              <li>
                You agree not to misuse, modify, or reverse-engineer the app.
              </li>
            </ul>
          </div>

          {/* Section 4: Consent */}
          <div className="space-y-1.5 rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-[#6355D8] dark:text-brand-300 shrink-0" />
              <h3>Consent</h3>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <li>
                By using the app, you consent to access and view your own data via secure scraping from the college portal.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#6355D8] hover:bg-[#5842E3] text-white font-bold text-xs tracking-wide shadow-sm transition-all duration-150 active:scale-[0.98] cursor-pointer"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
