"use client";

import { useEffect } from "react";
import { FigmaButton, FigmaCard } from "@/components/base";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service if needed
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-figma-bg flex items-center justify-center p-6 font-nunito">
      <div className="w-full max-w-md">
        <FigmaCard className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-figma-red" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-figma-dark mb-2">
            Something went wrong!
          </h2>
          <p className="text-sm text-figma-gray mb-8">
            An unexpected error occurred while loading this page. Our systems have logged the issue.
          </p>
          <div className="flex flex-col gap-3">
            <FigmaButton onClick={() => reset()} className="w-full justify-center">
              Try Again
            </FigmaButton>
            <FigmaButton variant="secondary" onClick={() => window.location.href = "/"} className="w-full justify-center">
              Go to Home
            </FigmaButton>
          </div>
        </FigmaCard>
      </div>
    </div>
  );
}
