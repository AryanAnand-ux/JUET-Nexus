/**
 * Dashboard Layout Component
 * Persistent, collapsible sidebar + top navigation + main content area
 * Premium Indigo/Violet/Slate aesthetic
 */

"use client";

import React, { ReactNode, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { FigmaButton } from "./base";
import { usePathname } from "next/navigation";
import { ThemeSelector } from "./ThemeSelector";

export interface DashboardLayoutProps {
  children: ReactNode;
  studentName: string;
  enrollment: string;
  onLogout: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  studentName,
  enrollment,
  onLogout,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target && typeof target.closest === "function" && target.closest('[data-sidebar-toggle="true"]')) {
        return;
      }
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        setSidebarCollapsed(true);
        setSidebarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSidebarClick = () => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  };

  // Helper to get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "JN";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const navItems = [
    {
      href: "/dashboard",
      label: "Bunk Meter",
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900 font-nunito overflow-hidden transition-colors duration-200">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 bg-black/40 z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        ref={sidebarRef}
        onClick={handleSidebarClick}
        className={clsx(
          "fixed inset-y-0 left-0 z-50 lg:static flex flex-col bg-white dark:bg-slate-950/40 border-r border-gray-200 dark:border-slate-900 transition-all duration-300 ease-in-out",
          // Mobile state
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0",
          // Desktop state
          sidebarCollapsed ? "lg:w-20 cursor-pointer" : "lg:w-64 cursor-default"
        )}
      >
        {/* Brand Header */}
        <div className={clsx(
          "border-b border-gray-100 dark:border-slate-800 flex items-center justify-between transition-all duration-300",
          sidebarCollapsed ? "p-4 justify-center" : "p-6"
        )}>
          {!sidebarCollapsed ? (
            <h2 className="font-nunito text-2xl font-black tracking-tight text-figma-dark dark:text-slate-100 truncate">
              JUET <span className="text-accent-primary">Nexus</span>
            </h2>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center font-bold text-accent-primary border border-accent-primary/20">
              JN
            </div>
          )}
        </div>

        {/* User Card */}
        <div className={clsx(
          "border-b border-gray-100 dark:border-slate-800 transition-all duration-300",
          sidebarCollapsed ? "p-4 text-center" : "p-6"
        )}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-accent-light text-accent-primary font-bold flex items-center justify-center text-sm shadow-sm" title={studentName}>
                {getInitials(studentName)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-light text-accent-primary font-bold flex items-center justify-center text-sm shrink-0 shadow-sm">
                {getInitials(studentName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-figma-dark dark:text-slate-200 truncate" title={studentName}>
                  {studentName}
                </p>
                <p className="text-xs text-figma-gray dark:text-slate-400 truncate">
                  {enrollment}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto" aria-label="Dashboard sections">
          {!sidebarCollapsed && (
            <p className="text-[10px] font-bold tracking-wider text-figma-gray uppercase px-2 mb-2 block">
              Sections
            </p>
          )}
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium tracking-wide transition-all font-nunito",
                  isActive
                    ? "bg-accent-primary text-white shadow-md shadow-accent-primary/20"
                    : "text-figma-gray dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-figma-dark dark:hover:text-slate-100",
                  sidebarCollapsed && "justify-center"
                )}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon}
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Toggle Footer (Desktop only) */}
        <div className="border-t border-gray-100 dark:border-slate-800 p-4 hidden lg:block">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarCollapsed(!sidebarCollapsed);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-figma-gray dark:text-slate-400 hover:text-figma-dark dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors font-nunito text-xs font-bold"
          >
            <svg
              className={clsx("w-5 h-5 transition-transform duration-300", sidebarCollapsed && "rotate-180")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header bar */}
        <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-3 shadow-sm z-10 transition-colors duration-200">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile menu trigger */}
            <button
              type="button"
              data-sidebar-toggle="true"
              aria-expanded={sidebarOpen}
              aria-label="Toggle navigation menu"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg text-figma-dark dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-figma-dark dark:text-slate-100 font-nunito truncate">
              {pathname === "/dashboard/performance"
                ? "Academic Performance"
                : pathname === "/dashboard/courses"
                ? "Registered Courses"
                : "Bunk Meter & Attendance"}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <ThemeSelector />
            <FigmaButton size="sm" variant="ghost" onClick={onLogout}>
              Logout
            </FigmaButton>
          </div>
        </header>

        {/* Content body */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900 p-4 md:p-6 transition-colors duration-200">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

DashboardLayout.displayName = "DashboardLayout";
