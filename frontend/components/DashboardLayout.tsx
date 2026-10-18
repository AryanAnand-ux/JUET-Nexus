"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Settings, RotateCw } from "lucide-react";
import { MobileBottomNav } from "./MobileBottomNav";

export interface DashboardLayoutProps {
  children: React.ReactNode;
  studentName: string;
  enrollment: string;
  onLogout?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  studentName,
  enrollment,
  onRefresh,
  isRefreshing = false,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  // Helper to get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "JN";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const navItems: Array<{
    href: string;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      href: "/dashboard",
      label: "Attendance",
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: "/dashboard/performance",
      label: "Performance",
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      href: "/dashboard/courses",
      label: "Registered Courses",
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      href: "/dashboard/exam",
      label: "Exam Schedule",
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      href: "/dashboard/settings",
      label: "Settings",
      icon: <Settings className="w-5 h-5 shrink-0" />,
    },
  ];

  return (
    <div className="flex h-screen bg-[var(--surface-page)] font-nunito overflow-hidden transition-colors duration-200">

      {/* Sidebar Panel */}
      <aside
        ref={sidebarRef}
        className={clsx(
          "hidden lg:flex fixed inset-y-0 left-0 z-50 lg:static flex-col bg-[var(--surface-card)] border-r border-[var(--line-subtle)] transition-all duration-300 ease-in-out",
          // Desktop state — only changes via the explicit toggle button
          sidebarCollapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        {/* Brand Header */}
        <div className={clsx(
          "border-b border-[var(--line-subtle)] flex items-center justify-between transition-all duration-300",
          sidebarCollapsed ? "p-4 justify-center" : "p-6"
        )}>
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3 min-w-0">
              <img src="/icon-192x192.png" alt="" className="h-9 w-9 rounded-xl shrink-0" />
              <h2 className="font-nunito text-xl font-extrabold tracking-tight text-[var(--ink-strong)] truncate">
                JUET <span className="text-accent-primary">Nexus</span>
              </h2>
            </div>
          ) : (
            <img src="/icon-192x192.png" alt="JUET Nexus" className="h-10 w-10 rounded-xl" />
          )}
        </div>

        {/* User Card */}
        <div className={clsx(
          "border-b border-[var(--line-subtle)] transition-all duration-300",
          sidebarCollapsed ? "p-4 text-center" : "p-6"
        )}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-100 font-bold flex items-center justify-center text-sm shadow-sm" title={studentName}>
                {getInitials(studentName)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-100 font-bold flex items-center justify-center text-sm shrink-0 shadow-sm">
                {getInitials(studentName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--ink-strong)] truncate" title={studentName}>
                  {studentName}
                </p>
                {enrollment && (
                  <p className="text-xs text-[var(--ink-muted)] truncate font-mono">
                    {enrollment}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto" aria-label="Dashboard sections">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium tracking-wide transition-all text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-card)]",
                  isActive
                    ? "bg-midnight dark:bg-brand-600 text-white shadow-sm"
                    : "text-[var(--ink-muted)] hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-[var(--ink-strong)]",
                  sidebarCollapsed && "justify-center"
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer: Refresh + explicit collapse toggle (Desktop only) */}
        <div className="border-t border-[var(--line-subtle)] p-4 hidden lg:block space-y-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className={clsx(
                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-[var(--ink-muted)] hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-[var(--ink-strong)] transition-colors disabled:opacity-50",
                sidebarCollapsed && "justify-center"
              )}
              title={sidebarCollapsed ? "Refresh" : undefined}
            >
              <RotateCw className={clsx("w-4 h-4 shrink-0", isRefreshing && "animate-spin")} />
              {!sidebarCollapsed && <span className="truncate">Refresh</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="w-full flex items-center justify-center py-2 px-3 rounded-xl text-[var(--ink-muted)] hover:text-[var(--ink-strong)] hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={clsx("w-5 h-5 transition-transform duration-300", sidebarCollapsed && "rotate-180")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Content body */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto bg-[var(--surface-page)] p-4 md:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-6 touch-scroll-momentum transition-colors duration-200">
          <div key={pathname} className="max-w-7xl mx-auto animate-page-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Fixed bottom navigation for mobile */}
      <MobileBottomNav />
    </div>
  );
};

DashboardLayout.displayName = "DashboardLayout";
