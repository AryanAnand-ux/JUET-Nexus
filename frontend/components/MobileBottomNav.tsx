"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PieChart,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  Award,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Bunk",
    icon: <PieChart className="w-5 h-5" />,
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
    href: "/dashboard/grades",
    label: "Grades",
    icon: <Award className="w-5 h-5" />,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200 dark:border-slate-800 shadow-xl px-1.5 py-1.5 transition-colors duration-200"
    >
      <div className="grid grid-cols-5 items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative ${
                isActive
                  ? "text-indigo-600 dark:text-indigo-400 font-bold"
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium"
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isActive ? "bg-indigo-50 dark:bg-indigo-950/70 scale-105" : ""
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
              {isActive && (
                <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
