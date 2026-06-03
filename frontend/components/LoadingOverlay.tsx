/**
 * LoadingOverlay Component
 * Full-screen overlay with "INTERCEPTING WEBPAGE..." message
 * Used during captcha fetch
 */

import React from "react";
import clsx from "clsx";

export interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = "Connecting to WebKiosk...",
}) => {
  if (!isVisible) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 bg-brutal-cream",
        "flex items-center justify-center z-[9999]"
      )}
    >
      <div className="text-center">
        <h1 className="font-serif text-brutal-3xl font-normal normal-case mb-8 text-brutal-black animate-pulse">
          {message}
        </h1>

        {/* Animated dots */}
        <div className="flex justify-center gap-4 mt-8">
          <div
            className="w-3.5 h-3.5 bg-brutal-yellow rounded-full shadow-sm"
            style={{
              animation: "bounce 1.4s infinite ease-in-out both",
              animationDelay: "-0.32s",
            }}
          />
          <div
            className="w-3.5 h-3.5 bg-brutal-lavender rounded-full shadow-sm"
            style={{
              animation: "bounce 1.4s infinite ease-in-out both",
              animationDelay: "-0.16s",
            }}
          />
          <div
            className="w-3.5 h-3.5 bg-brutal-green rounded-full shadow-sm"
            style={{
              animation: "bounce 1.4s infinite ease-in-out both",
              animationDelay: "0s",
            }}
          />
        </div>

        <style>{`
          @keyframes bounce {
            0%, 80%, 100% {
              transform: scale(0);
            }
            40% {
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
};

LoadingOverlay.displayName = "LoadingOverlay";
