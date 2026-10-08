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
import { ThemeToggle } from "./ThemeToggle";
import { MobileBottomNav } from "./MobileBottomNav";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { RotateCw, MessageSquare } from "lucide-react";
import { FeedbackModal } from "./FeedbackModal";
import { DevelopmentBanner } from "./DevelopmentBanner";

export interface DashboardLayoutProps {
  children: ReactNode;
  studentName: string;
  enrollment: string;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  studentName,
  enrollment,
  onLogout,
  onRefresh,
  isRefreshing = false,
}) => {
  useSessionHeartbeat();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [maskEnrollment, setMaskEnrollment] = useState(false);
  const pathname = usePathname();
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setMaskEnrollment(localStorage.getItem("mask_enrollment") === "true");
    }
  }, []);

  const toggleMask = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMaskEnrollment((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("mask_enrollment", String(next));
      }
      return next;
    });
  };

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
      href: "/dashboard/feedback",
      label: "Feedback",
      icon: <MessageSquare className="w-5 h-5 shrink-0" />,
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#09090b] font-nunito overflow-hidden transition-colors duration-200">

      {/* Sidebar Panel */}
      <aside
        ref={sidebarRef}
        onClick={handleSidebarClick}
        className={clsx(
          "hidden lg:flex fixed inset-y-0 left-0 z-50 lg:static flex-col bg-white dark:bg-zinc-950/80 border-r border-gray-200 dark:border-zinc-850 transition-all duration-300 ease-in-out",
          // Desktop state
          sidebarCollapsed ? "lg:w-20 cursor-pointer" : "lg:w-64 cursor-default"
        )}
      >
        {/* Brand Header */}
        <div className={clsx(
          "border-b border-gray-100 dark:border-zinc-800/80 flex items-center justify-between transition-all duration-300",
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
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={toggleMask}
              title={maskEnrollment ? "Click to show details" : "Click to hide details (Privacy Mode)"}
            >
              <div className="w-10 h-10 rounded-full bg-accent-light text-accent-primary font-bold flex items-center justify-center text-sm shrink-0 shadow-sm">
                {getInitials(studentName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-figma-dark dark:text-slate-200 truncate" title={studentName}>
                  {maskEnrollment ? "Student" : studentName}
                </p>
                <p className="text-xs text-figma-gray dark:text-slate-400 truncate font-mono">
                  {maskEnrollment && enrollment
                    ? `${enrollment.slice(0, 2)}••••${enrollment.slice(-2)}`
                    : enrollment}
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
        <div className="border-t border-gray-100 dark:border-zinc-800/80 p-4 hidden lg:block">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSidebarCollapsed(!sidebarCollapsed);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-figma-gray dark:text-zinc-400 hover:text-figma-dark dark:hover:text-zinc-100 hover:bg-gray-50 dark:hover:bg-zinc-850 transition-colors font-nunito text-xs font-bold"
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
        <header className="bg-white dark:bg-[#09090b] border-b border-gray-200 dark:border-zinc-800/80 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 shadow-sm z-10 transition-colors duration-200">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-figma-dark dark:text-slate-100 font-nunito truncate">
              {pathname === "/dashboard/performance"
                ? "Academic Performance"
                : pathname === "/dashboard/courses"
                ? "Registered Courses"
                : pathname === "/dashboard/exam"
                ? "Exam Schedule"
                : pathname === "/dashboard/feedback"
                ? "Feedback & Suggestions"
                : "Attendance Tracker"}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh academic data"
                aria-label="Refresh academic data"
                className="p-2 text-gray-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              title="Send Feedback (juetnexus@gmail.com)"
              aria-label="Send Feedback"
              className="p-2 text-gray-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <ThemeToggle />
            <FigmaButton size="sm" variant="ghost" onClick={onLogout} className="px-2 sm:px-3">
              <span className="hidden sm:inline">Logout</span>
              <svg className="w-5 h-5 sm:hidden text-figma-gray dark:text-slate-400 hover:text-figma-dark dark:hover:text-slate-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </FigmaButton>
          </div>
        </header>

        {/* Content body */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto bg-gray-50 dark:bg-[#09090b] p-4 md:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-6 touch-scroll-momentum transition-colors duration-200">
          <div className="max-w-7xl mx-auto">
            {pathname !== "/dashboard/feedback" && (
              <DevelopmentBanner
                onOpenFeedback={() => setFeedbackOpen(true)}
                className="mb-6"
              />
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Fixed bottom navigation for mobile */}
      <MobileBottomNav />

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        enrollment={enrollment}
        studentName={studentName}
      />
    </div>
  );
};

DashboardLayout.displayName = "DashboardLayout";
