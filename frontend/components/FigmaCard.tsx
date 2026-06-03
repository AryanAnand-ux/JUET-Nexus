import React from "react";
import clsx from "clsx";

export interface FigmaCardProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: React.ReactNode;
  padding?: "sm" | "md" | "lg";
}

export const FigmaCard = React.forwardRef<HTMLDivElement, FigmaCardProps>(
  ({ className, heading, padding = "md", children, ...props }, ref) => {
    const paddingStyles = {
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    };

    return (
      <div
        ref={ref}
        className={clsx(
          "bg-white border border-gray-200 rounded-2xl shadow-sm font-nunito transition-shadow duration-200 hover:shadow-md",
          paddingStyles[padding],
          className
        )}
        {...props}
      >
        {heading && (
          <h3 className="text-xl font-bold text-figma-dark mb-4 border-b border-gray-100 pb-3 font-nunito">
            {heading}
          </h3>
        )}
        {children}
      </div>
    );
  }
);

FigmaCard.displayName = "FigmaCard";
