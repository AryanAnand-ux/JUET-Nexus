"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  Settings,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function MobileBottomNav() {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Attendance",
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
    {
      href: "/dashboard/performance",
      label: "GPA",
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      href: "/dashboard/courses",
      label: "Courses",
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      href: "/dashboard/exam",
      label: "Exams",
      icon: <CalendarCheck className="w-5 h-5" />,
    },
    {
      href: "/dashboard/settings",
      label: "Settings",
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[var(--surface-card)]/95 backdrop-blur-md border-t border-[var(--line-subtle)] shadow-elevated px-2 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] transition-colors duration-200"
    >
      <div className="grid grid-cols-5 items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-transform duration-100 active:scale-95 relative touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-card)] ${
                isActive
                  ? "text-brand-600 dark:text-brand-100 font-bold"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink-strong)] font-medium"
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-all ${
                  isActive ? "bg-brand-50 dark:bg-brand-500/20 scale-105" : ""
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-brand-100" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
