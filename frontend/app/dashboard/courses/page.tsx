"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useDashboard } from "@/hooks/useDashboard";
import { performLogout } from "@/utils/logout";
import { ArrowLeft, RefreshCw, Search, BookOpen, Layers, Award } from "lucide-react";
import Link from "next/link";

const ErrorBanner: React.FC<{ error: { message: string } }> = ({ error }) => (
  <div className="mb-6 border border-red-200 rounded-2xl bg-red-50 p-4 flex items-start gap-3 shadow-sm">
    <span className="text-red-500 mt-0.5">⚠</span>
    <p className="text-sm font-medium text-red-700 font-nunito">
      {error.message}
    </p>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div
        key={i}
        className="border border-gray-100 bg-gray-50 rounded-[20px] h-[160px] animate-pulse shadow-sm"
      />
    ))}
  </div>
);

export default function CoursesPage() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const storedEnrollment = typeof window !== "undefined" ? localStorage.getItem("enrollment") : null;
    if (!storedEnrollment) {
      router.push("/login");
    } else {
      setEnrollment(storedEnrollment);
    }
  }, [router]);

  const { data, isLoading, error, invalidateCache } = useDashboard(enrollment);

  const handleLogout = async () => {
    await performLogout();
    router.push("/login");
  };

  if (!enrollment) return null;

  // Filter courses by search term
  const courses = data?.courses || [];
  const filteredCourses = courses.filter(
    (course) =>
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout
      studentName={data?.student.name || "Student"}
      enrollment={enrollment}
      onLogout={handleLogout}
    >
      {/* Header bar and Actions */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link 
              href="/dashboard" 
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-nunito"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Bunk Meter
            </Link>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight font-nunito">
            Registered Courses
          </h2>
          <p className="text-sm font-medium text-slate-400 font-nunito mt-1">
            View your current semester curriculum and academic credits
          </p>
        </div>
        
        <button
          onClick={invalidateCache}
          disabled={isLoading}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 transition-all shadow-sm active:scale-95 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> 
          <span>Sync Curriculum</span>
        </button>
      </div>

      {error && <ErrorBanner error={error} />}

      {/* Search and Stats Summary */}
      {data && courses.length > 0 && (
        <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search course or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-nunito"
            />
          </div>

          {/* Stats Badges */}
          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-600 font-nunito">
                {courses.length} Courses Total
              </span>
            </div>
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-600 font-nunito">
                {courses.reduce((acc, c) => acc + c.credits, 0)} Total Credits
              </span>
            </div>
          </div>
        </div>
      )}

      {isLoading && !data ? (
        <LoadingSkeleton />
      ) : data && courses.length > 0 ? (
        <>
          {filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => {
                // Color mapping for course types
                const badgeColor =
                  course.type === "Theory"
                    ? "bg-blue-50 text-blue-700 border-blue-200/50"
                    : course.type === "Practical"
                    ? "bg-purple-50 text-purple-700 border-purple-200/50"
                    : course.type === "Project"
                    ? "bg-rose-50 text-rose-700 border-rose-200/50"
                    : "bg-slate-50 text-slate-700 border-slate-200/50";

                return (
                  <div
                    key={course.code}
                    className="group border border-slate-200/80 bg-white rounded-[20px] p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:border-slate-300 hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px]"
                  >
                    <div>
                      {/* Code and Credits */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-xs font-extrabold text-indigo-600 tracking-wider font-mono bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 rounded-lg">
                          {course.code}
                        </span>
                        <span className="text-xs font-bold text-slate-400 font-nunito flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-slate-400" /> {course.credits} Credits
                        </span>
                      </div>

                      {/* Course Title */}
                      <h3 className="font-extrabold text-slate-800 text-lg leading-snug font-nunito group-hover:text-indigo-950 transition-colors">
                        {course.title}
                      </h3>
                    </div>

                    {/* Badge / Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className={`text-xs font-extrabold border px-2.5 py-0.5 rounded-full font-nunito ${badgeColor}`}>
                        {course.type}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-[24px] bg-white p-12 text-center shadow-sm">
              <p className="text-sm font-medium text-slate-400 font-nunito">
                No courses match your search &quot;{searchTerm}&quot;.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="border border-slate-200 rounded-[24px] bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-400 font-nunito mb-4">
            No registered courses data available. Let&apos;s sync your WebKiosk curriculum.
          </p>
          <button
            onClick={invalidateCache}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} /> Sync Now
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
