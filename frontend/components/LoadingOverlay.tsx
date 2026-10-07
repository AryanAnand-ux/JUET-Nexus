/**
 * LoadingOverlay Component
 * Full-screen overlay shown while connecting to the student portal.
 */

import React from "react";
import clsx from "clsx";
import { Typing } from "@/components/loading-ui/typing";

export interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = "Connecting to your student portal...",
}) => {
  if (!isVisible) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 bg-white dark:bg-slate-950",
        "flex items-center justify-center z-[9999]"
      )}
    >
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <Typing size="lg" duration={0.85} count={3} className="text-accent-primary" />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 font-nunito tracking-wide animate-pulse max-w-xs">
          {message}
        </p>
      </div>
    </div>
  );
};

LoadingOverlay.displayName = "LoadingOverlay";

