import React from "react";
import clsx from "clsx";

export interface FigmaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const FigmaButton = React.forwardRef<HTMLButtonElement, FigmaButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold font-nunito rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary: "bg-accent-primary hover:bg-accent-hover text-white focus:ring-accent-primary",
      secondary: "bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-750 text-figma-dark dark:text-slate-200 focus:ring-slate-500 dark:focus:ring-offset-slate-900",
      danger: "bg-figma-red hover:bg-[#9d3c31] text-white focus:ring-figma-red",
      ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-slate-850 text-figma-gray dark:text-slate-400 hover:text-figma-dark dark:hover:text-slate-100 focus:ring-slate-600",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-6 py-3.5 text-lg",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 currentColor"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {children}
      </button>
    );
  }
);

FigmaButton.displayName = "FigmaButton";
