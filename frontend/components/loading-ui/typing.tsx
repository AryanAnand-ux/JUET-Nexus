/**
 * Typing — animated three-dot "typing" indicator.
 *
 * Each dot translates upward in sequence, mimicking a chat typing bubble.
 * Color inherits from `text-current` / `bg-current`, so it adapts to any
 * parent's foreground. Duration is driven by `--typing-duration` (default 1s);
 * stagger stays at 160 ms per dot.
 *
 * Usage:
 *   <Typing />                          — default, 3 dots, 1 s cycle
 *   <Typing count={4} duration={0.6} /> — 4 dots, faster cycle
 *   <Typing size="lg" className="text-indigo-500" />
 */

import React from "react";

export type TypingSize = "xs" | "sm" | "md" | "lg";

const SIZE_MAP: Record<TypingSize, string> = {
  xs: "w-1 h-1",
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-3 h-3",
};

const GAP_MAP: Record<TypingSize, string> = {
  xs: "gap-1",
  sm: "gap-1.5",
  md: "gap-1.5",
  lg: "gap-2",
};

export interface TypingProps {
  /** Number of dots (default 3) */
  count?: number;
  /** Animation cycle length in seconds (default 1) */
  duration?: number;
  /** Delay step between dots in ms (default 160) */
  stagger?: number;
  /** Dot size preset */
  size?: TypingSize;
  /** Extra classes — use `text-*` to set color */
  className?: string;
}

export const Typing: React.FC<TypingProps> = ({
  count = 3,
  duration = 1,
  stagger = 160,
  size = "md",
  className = "",
}) => {
  return (
    <span
      className={`inline-flex items-center ${GAP_MAP[size]} ${className}`}
      aria-label="Loading"
      role="status"
    >
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`${SIZE_MAP[size]} rounded-full bg-current`}
          style={{
            animation: `typing-bounce ${duration}s ease-in-out infinite`,
            animationDelay: `${i * stagger}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-40%); opacity: 1; }
        }
      `}</style>
    </span>
  );
};

Typing.displayName = "Typing";
