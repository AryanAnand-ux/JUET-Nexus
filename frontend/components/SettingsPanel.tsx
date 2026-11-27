"use client";

/**
 * Shared settings UI used by both the embedded dashboard tab and the
 * standalone /dashboard/settings route.
 */

import React, { useEffect, useState } from "react";
import { LogOut, Target, UserRound } from "lucide-react";
import { useAttendanceTarget } from "@/context/AttendanceTargetContext";
import { normalizeAttendanceTarget } from "@/lib/attendanceTarget";

export interface SettingsPanelProps {
  studentName?: string | null;
  enrollment?: string | null;
  branch?: string | null;
  lastSyncedAt?: Date | string | null;
  onLogout: () => void;
}

const UNAVAILABLE = "Not available";

function displayValue(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : UNAVAILABLE;
}

function formatSyncTime(value?: Date | string | null): string {
  if (!value) return UNAVAILABLE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return UNAVAILABLE;
  return date.toLocaleString();
}

function initials(name: string): string {
  if (name === UNAVAILABLE) return "—";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "—";
}

const ProfileField: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
      {label}
    </dt>
    <dd
      className={`mt-1 text-sm font-semibold leading-snug text-[var(--ink-strong)] break-words ${
        mono ? "font-mono tabular-nums" : ""
      }`}
    >
      {value}
    </dd>
  </div>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  studentName,
  enrollment,
  branch,
  lastSyncedAt,
  onLogout,
}) => {
  const { attendanceTarget, setAttendanceTarget } = useAttendanceTarget();
  const [draftTarget, setDraftTarget] = useState(String(attendanceTarget));
  const [saveStatus, setSaveStatus] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    setDraftTarget(String(attendanceTarget));
  }, [attendanceTarget]);

  useEffect(() => {
    setSaveStatus(null);
  }, [draftTarget]);

  const name = displayValue(studentName);
  const rollNumber = displayValue(enrollment);
  const branchLabel = displayValue(branch);

  const handleSaveTarget = () => {
    const parsed = normalizeAttendanceTarget(draftTarget);
    if (parsed === null) {
      setSaveStatus({ error: true, text: "Enter a target between 1 and 100." });
      return;
    }
    setAttendanceTarget(parsed);
    setSaveStatus({ error: false, text: `Saved. Attendance target is now ${parsed}%.` });
  };

  return (
    <div className="space-y-5">
      {/* Profile */}
      <section className="rounded-[24px] border border-[var(--line-subtle)] bg-[var(--surface-card)] p-5 shadow-card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] text-[var(--ink-strong)] flex items-center justify-center text-sm font-extrabold shrink-0">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[var(--ink-strong)] truncate">{name}</h3>
            <p className="text-[11px] text-[var(--ink-muted)] flex items-center gap-1.5">
              <UserRound className="w-3 h-3 shrink-0" /> Signed-in student profile
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
          <ProfileField label="Roll Number" value={rollNumber} mono />
          <ProfileField label="Branch" value={branchLabel} />
          <ProfileField label="Last synced" value={formatSyncTime(lastSyncedAt)} />
        </dl>
      </section>

      {/* Preferences */}
      <section className="overflow-hidden rounded-[24px] border border-[var(--line-subtle)] bg-[var(--surface-card)] divide-y divide-[var(--line-subtle)] shadow-card">
        <div className="px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] text-[var(--ink-muted)] flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink-strong)]">
                  Default Attendance Target
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="relative">
                <span className="sr-only">Attendance target percentage</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  value={draftTarget}
                  onChange={(event) => setDraftTarget(event.target.value)}
                  className="w-20 rounded-xl border border-[var(--line-subtle)] bg-[var(--surface-subtle)] px-3 py-2 pr-7 text-sm font-bold text-[var(--ink-strong)] tabular-nums focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--ink-muted)] pointer-events-none">
                  %
                </span>
              </label>
              <button
                type="button"
                onClick={handleSaveTarget}
                className="rounded-xl bg-accent-primary px-4 py-2 text-xs font-bold text-white shadow-card transition hover:bg-accent-hover active:scale-95 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>

          {saveStatus && (
            <p
              role="status"
              className={`mt-2 text-[11px] font-semibold ${
                saveStatus.error ? "text-rose-500 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {saveStatus.text}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 flex-1">
            Logout
          </span>
        </button>
      </section>
    </div>
  );
};

SettingsPanel.displayName = "SettingsPanel";
