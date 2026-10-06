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
      className="p-2 sm:p-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 shadow-sm transition-all duration-200 flex items-center justify-center shrink-0"
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
