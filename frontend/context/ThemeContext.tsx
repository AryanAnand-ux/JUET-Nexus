"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type AccentColor = "indigo" | "burgundy" | "purple" | "emerald";

interface ThemeContextType {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  toggleTheme: () => void;
  setAccentColor: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [accentColor, setAccentColorState] = useState<AccentColor>("indigo");
  const [mounted, setMounted] = useState(false);

  // Load theme settings from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme-mode") as ThemeMode | null;
    const savedAccent = localStorage.getItem("theme-accent") as AccentColor | null;

    if (savedTheme) {
      setThemeMode(savedTheme);
    } else {
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setThemeMode(systemPrefersDark ? "dark" : "light");
    }

    if (savedAccent) {
      setAccentColorState(savedAccent);
    }

    setMounted(true);
  }, []);

  // Update document classes when theme or accent changes
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    // Apply dark mode class
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Apply accent classes
    root.classList.remove("accent-indigo", "accent-burgundy", "accent-purple", "accent-emerald");
    root.classList.add(`accent-${accentColor}`);

    // Persist values
    localStorage.setItem("theme-mode", themeMode);
    localStorage.setItem("theme-accent", accentColor);
  }, [themeMode, accentColor, mounted]);

  const toggleTheme = () => {
    setThemeMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setAccentColor = (accent: AccentColor) => {
    setAccentColorState(accent);
  };

  return (
    <ThemeContext.Provider value={{ themeMode, accentColor, toggleTheme, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
