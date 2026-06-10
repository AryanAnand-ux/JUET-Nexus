"use client";

import React from "react";
import { useTheme, AccentColor } from "../context/ThemeContext";
import { Sun, Moon } from "lucide-react";

export const ThemeSelector: React.FC = () => {
  const { themeMode, accentColor, toggleTheme, setAccentColor } = useTheme();

  const accents: { name: AccentColor; colorClass: string; label: string }[] = [
    { name: "indigo", colorClass: "bg-[#6366F1]", label: "Indigo Accent" },
    { name: "burgundy", colorClass: "bg-[#7F265B]", label: "Burgundy Accent" },
    { name: "purple", colorClass: "bg-[#8B5CF6]", label: "Purple Accent" },
    { name: "emerald", colorClass: "bg-[#10B981]", label: "Emerald Accent" },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-4 border border-slate-200/60 dark:border-slate-800 bg-white/70 dark:bg-slate-950/40 backdrop-blur-md rounded-2xl px-2.5 sm:px-4 py-1.5 sm:py-2 shadow-sm transition-all duration-300">
      {/* Theme Mode Toggle (Sun/Moon) */}
      <button
        type="button"
        onClick={toggleTheme}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center"
        aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
      >
        {themeMode === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      {/* Divider */}
      <span className="w-px h-4 bg-slate-200 dark:bg-slate-800" />

      {/* Accent Colors Dots */}
      <div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label="Choose Accent Color">
        {accents.map((acc) => {
          const isActive = accentColor === acc.name;
          return (
            <button
              key={acc.name}
              type="button"
              onClick={() => setAccentColor(acc.name)}
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full ${acc.colorClass} relative transition-all duration-200 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 focus:ring-accent-primary`}
              aria-label={acc.label}
              aria-pressed={isActive}
            >
              {isActive && (
                <span className="absolute inset-0 rounded-full border border-white dark:border-slate-950 animate-ping opacity-75" />
              )}
              {isActive && (
                <span className="absolute inset-[-3px] rounded-full border border-accent-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

ThemeSelector.displayName = "ThemeSelector";
