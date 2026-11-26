"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  TrendingUp,
  CalendarCheck,
  Settings,
} from "lucide-react";

export type DashboardTabId = "attendance" | "performance" | "exam" | "settings";

interface NavItem {
  id: DashboardTabId;
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function MobileBottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab?: DashboardTabId;
  onTabChange?: (tab: DashboardTabId) => void;
} = {}) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      id: "attendance",
      href: "/dashboard",
      label: "Attendance",
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
    {
      id: "performance",
      href: "/dashboard#performance",
      label: "Marks",
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      id: "exam",
      href: "/dashboard#exam",
      label: "Exams",
      icon: <CalendarCheck className="w-5 h-5" />,
    },
    {
      id: "settings",
      href: "/dashboard#settings",
      label: "Settings",
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[var(--surface-card)]/95 backdrop-blur-md border-t border-[var(--line-subtle)] shadow-elevated px-2 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] transition-colors duration-200"
    >
      <div className="grid grid-cols-4 items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = activeTab
            ? activeTab === item.id
            : item.id === "attendance"
              ? pathname === "/dashboard"
              : pathname === `/dashboard/${item.id}` || pathname.startsWith(`/dashboard/${item.id}/`);

          const className = `flex flex-col items-center justify-center py-1.5 px-1 min-h-[48px] rounded-xl transition-colors duration-150 relative touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-card)] ${
            isActive
              ? "text-brand-600 dark:text-white font-bold"
              : "text-[var(--ink-muted)] hover:text-[var(--ink-strong)] font-medium"
          }`;

          const content = (
            <>
              <div
                className={`p-1 rounded-lg transition-all ${
                  isActive ? "bg-brand-50 dark:bg-neutral-800 scale-105" : ""
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-white" />
              )}
            </>
          );

          if (onTabChange) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={className}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
