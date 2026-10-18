import Link from "next/link";
import { FigmaButton, FigmaCard } from "@/components/base";
import { MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 font-nunito">
      <div className="w-full max-w-md">
        <FigmaCard className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-[var(--surface-subtle)] rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-[var(--ink-muted)]" />
            </div>
          </div>
          <h2 className="text-4xl font-editorial-italic font-normal text-[var(--ink-strong)] mb-2 tracking-normal">
            404
          </h2>
          <p className="text-base font-semibold text-[var(--ink-strong)] mb-8">
            Page Not Found
          </p>
          <Link href="/" className="block">
            <FigmaButton className="w-full justify-center">
              Return Home
            </FigmaButton>
          </Link>
        </FigmaCard>
      </div>
    </div>
  );
}
