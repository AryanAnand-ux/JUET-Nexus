import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Login to CampusLynx Portal",
  description:
    "Log in to JUET Nexus to access real-time CampusLynx attendance tracking, calculate safe bunks above 75%, and check your semester SGPA and exam schedule.",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Login to CampusLynx Portal | JUET Nexus",
    description:
      "Instant, persistent student login for Jaypee University of Engineering and Technology (JUET) CampusLynx portal.",
    url: "/login",
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-jakarta)" }}>
      {children}
    </div>
  );
}
