"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns false during SSR and initial client hydration, then true.
 * During client-side navigation, returns true synchronously on first render.
 * Prevents Next.js hydration mismatches when reading from localStorage or window.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

