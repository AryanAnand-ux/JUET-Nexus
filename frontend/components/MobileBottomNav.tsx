"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckCircle2,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  UserCircle2,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { performLogout } from "@/utils/logout";

interface NavItem {
  href?: string;
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [enrollment, setEnrollment] = useState("");
  const [branch, setBranch] = useState("");
  const [copied, setCopied] = useState(false);
  const [maskEnrollment, setMaskEnrollment] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStudentName(localStorage.getItem("studentName") || "Student");
    setEnrollment(localStorage.getItem("enrollment") || "—");
    setBranch(localStorage.getItem("branch") || "—");
    if (typeof window !== "undefined") {
      setMaskEnrollment(localStorage.getItem("mask_enrollment") === "true");
    }
  }, [profileOpen]);

  const toggleMask = () => {
    setMaskEnrollment((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("mask_enrollment", String(next));
      }
      return next;
    });
  };

  // Prevent background scroll when profile sheet is open
  useEffect(() => {
    if (profileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [profileOpen]);

  // Close on outside tap
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  const handleCopyEnrollment = () => {
    navigator.clipboard.writeText(enrollment).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    await performLogout();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "JN";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

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
      label: "Profile",
      icon: <UserCircle2 className="w-5 h-5" />,
      onPress: () => setProfileOpen(true),
    },
  ];

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200/80 dark:border-slate-800 shadow-xl px-2 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] transition-colors duration-200"
      >
        <div className="grid grid-cols-5 items-center max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = item.href ? pathname === item.href : false;

            if (item.onPress) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onPress}
                  className="flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-transform duration-100 active:scale-95 relative text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium touch-manipulation"
                >
                  <div className="p-1 rounded-lg transition-transform">
                    {item.icon}
                  </div>
                  <span className="text-[10px] font-semibold tracking-tight mt-0.5">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href!}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-transform duration-100 active:scale-95 relative touch-manipulation ${
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400 font-bold"
                    : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium"
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-all ${
                    isActive ? "bg-indigo-50 dark:bg-indigo-950/70 scale-105" : ""
                  }`}
                >
                  {item.icon}
                </div>
                <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Profile Bottom Sheet Backdrop */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setProfileOpen(false)}
        />
      )}

      {/* Profile Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out pb-[max(2rem,calc(1.5rem+env(safe-area-inset-bottom)))] ${
          profileOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab">
          <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-slate-700" />
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={() => setProfileOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors touch-manipulation active:scale-95"
          aria-label="Close profile"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-2">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center text-xl shadow-sm border border-indigo-200 dark:border-indigo-800/50">
              {getInitials(studentName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-gray-900 dark:text-slate-100 truncate font-nunito">
                {studentName}
              </p>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-3 mb-5">
            {/* Enrollment */}
            <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/60 rounded-2xl px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-0.5">
                  Enrollment No.
                </p>
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100 font-mono">
                  {maskEnrollment && enrollment !== "—"
                    ? `${enrollment.slice(0, 2)}••••${enrollment.slice(-2)}`
                    : enrollment}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMask}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all touch-manipulation active:scale-95"
                  title={maskEnrollment ? "Show enrollment" : "Hide enrollment"}
                  aria-label="Toggle Privacy Mode"
                >
                  {maskEnrollment ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyEnrollment}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all touch-manipulation active:scale-95"
                  aria-label="Copy enrollment number"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Branch */}
            <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-0.5">
                Branch
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-slate-100 font-nunito">
                {branch}
              </p>
            </div>

            {/* Feedback */}
            <Link
              href="/dashboard/feedback"
              onClick={() => setProfileOpen(false)}
              className="flex items-center justify-between bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/50 rounded-2xl px-4 py-3 text-indigo-700 dark:text-indigo-300 font-bold text-sm transition-colors hover:bg-indigo-100/70 dark:hover:bg-indigo-900/60 font-nunito touch-manipulation active:scale-98"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Send Feedback</span>
              </div>
              <span className="text-[11px] font-medium text-indigo-500/80">juetnexus@gmail.com</span>
            </Link>
          </div>

          {/* Theme + Logout */}
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-3 bg-gray-50 dark:bg-slate-800/60 rounded-2xl px-4 py-3">
              <span className="text-xs font-bold text-gray-500 dark:text-slate-400 font-nunito">Theme</span>
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-5 py-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-sm rounded-2xl border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-all font-nunito touch-manipulation active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
