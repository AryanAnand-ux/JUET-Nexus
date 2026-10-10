"use client";

import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { themeMode, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
      className="min-h-11 min-w-11 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-card)] text-[var(--ink-muted)] shadow-sm transition-colors duration-200 hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] flex items-center justify-center shrink-0"
      title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
    >
      {themeMode === "dark" ? (
        <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 hover:rotate-45 transition-transform" />
      ) : (
        <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 hover:-rotate-12 transition-transform" />
      )}
    </button>
  );
}
