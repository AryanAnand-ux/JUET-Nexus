"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Dark mode is the only application theme. The login screen is the sole
 * exception and keeps its existing light design (no `dark` class on <html>).
 */
export function ThemeEnforcer() {
  const pathname = usePathname();

  useEffect(() => {
    const isLogin = pathname === "/login" || pathname.startsWith("/login/");
    const root = document.documentElement;
    root.classList.toggle("dark", !isLogin);
    root.style.colorScheme = isLogin ? "light" : "dark";

    // Retired preference from the previous light/dark toggle.
    try {
      window.localStorage.removeItem("theme-mode");
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return null;
}
