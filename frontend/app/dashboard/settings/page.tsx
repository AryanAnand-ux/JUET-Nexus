"use client";

/**
 * Settings Page
 * Centralises app preferences: Feedback submission, Theme switching, and Logout.
 * Reuses the existing FeedbackModal, ThemeContext, and performLogout logic.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FeedbackModal } from "@/components/FeedbackModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { performLogout } from "@/utils/logout";
import { ChevronRight, LogOut, MessageSquare, Palette } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [studentName, setStudentName] = useState("Student");
  const [enrollment, setEnrollment] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStudentName(localStorage.getItem("studentName") || "Student");
    setEnrollment(localStorage.getItem("enrollment") || "");
  }, []);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  return (
    <DashboardLayout
      studentName={studentName}
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      <div className="mx-auto w-full max-w-lg">
        <h2 className="text-2xl sm:text-3xl font-editorial-italic text-[var(--ink-strong)] mb-6">
          Settings
        </h2>

        <div className="rounded-[24px] border border-[var(--line-subtle)] bg-[var(--surface-card)] divide-y divide-[var(--line-subtle)] shadow-card overflow-hidden">
          {/* Feedback */}
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-subtle)] cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-100 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-[var(--ink-strong)] flex-1">Feedback</span>
            <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
          </button>

          {/* Theme */}
          <div className="w-full flex items-center gap-4 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-100 flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-[var(--ink-strong)] flex-1">Theme</p>
            <ThemeToggle />
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 flex-1">Logout</span>
          </button>
        </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        enrollment={enrollment}
        studentName={studentName}
      />
    </DashboardLayout>
  );
}
