"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ATTENDANCE_TARGET_STORAGE_KEY,
  DEFAULT_ATTENDANCE_TARGET,
  normalizeAttendanceTarget,
  readAttendanceTarget,
  writeAttendanceTarget,
} from "@/lib/attendanceTarget";

interface AttendanceTargetContextValue {
  attendanceTarget: number;
  setAttendanceTarget: (value: number) => void;
}

const AttendanceTargetContext = createContext<AttendanceTargetContextValue | undefined>(
  undefined
);

export const AttendanceTargetProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [attendanceTarget, setTarget] = useState<number>(DEFAULT_ATTENDANCE_TARGET);

  // Hydrate the persisted preference after mount; SSR always renders the default.
  useEffect(() => {
    const stored = readAttendanceTarget();
    if (stored !== null) setTarget(stored);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ATTENDANCE_TARGET_STORAGE_KEY) return;
      const next = normalizeAttendanceTarget(event.newValue);
      if (next !== null) setTarget(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setAttendanceTarget = useCallback((value: number) => {
    const normalized = normalizeAttendanceTarget(value);
    if (normalized === null) return;
    setTarget(normalized);
    writeAttendanceTarget(normalized);
  }, []);

  const value = useMemo(
    () => ({ attendanceTarget, setAttendanceTarget }),
    [attendanceTarget, setAttendanceTarget]
  );

  return (
    <AttendanceTargetContext.Provider value={value}>
      {children}
    </AttendanceTargetContext.Provider>
  );
};

export function useAttendanceTarget(): AttendanceTargetContextValue {
  const context = useContext(AttendanceTargetContext);
  if (!context) {
    throw new Error("useAttendanceTarget must be used within AttendanceTargetProvider");
  }
  return context;
}
