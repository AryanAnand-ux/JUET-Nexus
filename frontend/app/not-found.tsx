import Link from "next/link";
import { FigmaButton, FigmaCard } from "@/components/base";
import { MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-figma-bg flex items-center justify-center p-6 font-nunito">
      <div className="w-full max-w-md">
        <FigmaCard className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-figma-gray" />
            </div>
          </div>
          <h2 className="text-4xl font-black text-figma-dark mb-2 tracking-tight">
            404
          </h2>
          <p className="text-base font-bold text-figma-dark mb-2">
            Page Not Found
          </p>
          <p className="text-sm text-figma-gray mb-8">
            The page you are looking for doesn&apos;t exist or has been moved.
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
