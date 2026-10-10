import "../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { ThemeProvider } from "../context/ThemeContext";
import { Analytics } from "@vercel/analytics/next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F5" },
    { media: "(prefers-color-scheme: dark)", color: "#10131B" },
  ],
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://juetnexus.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "JUET Nexus — Student Portal, Attendance & SGPA Hub",
    template: "%s | JUET Nexus",
  },
  description:
    "Fast, modern student portal client and academic dashboard for Jaypee University of Engineering and Technology (JUET). Instant CampusLynx attendance tracking, safe-bunk calculator above 75%, exam schedule, and SGPA forecasting.",
  applicationName: "JUET Nexus",
  keywords: [
    "JUET",
    "JUET Nexus",
    "JUET student portal",
    "JUET CampusLynx",
    "JUET attendance",
    "JUET attendance calculator",
    "JUET bunk calculator",
    "Jaypee University of Engineering and Technology",
    "JUET Guna",
    "JUET SGPA calculator",
    "JUET exam schedule",
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "JUET Nexus — Student Portal & Real-Time Attendance Tracker",
    description:
      "Instant CampusLynx attendance tracking, safe-bunk calculations above 75%, SGPA forecasting, and exam schedules for JUET students.",
    url: "/",
    siteName: "JUET Nexus",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JUET Nexus — Student Portal & Real-Time Attendance Tracker",
    description:
      "Instant CampusLynx attendance tracking, safe-bunk calculations above 75%, SGPA forecasting, and exam schedules for JUET students.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "0niLebqPCbZ9SH5BLX0uP_S53oiuwx6Zrxmmw5xAWFM",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "JUET Nexus",
      url: siteUrl,
      applicationCategory: "EducationalApplication",
      operatingSystem: "All modern browsers (PWA supported)",
      description:
        "High-speed academic dashboard and CampusLynx portal client for Jaypee University of Engineering and Technology (JUET) students. Tracks real-time attendance, safe bunking limits above 75%, SGPA/CGPA, and exam timetables.",
      browserRequirements: "Requires JavaScript. Requires HTML5.",
      softwareVersion: "1.0.0",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
    },
    {
      "@type": "EducationalOrganization",
      "@id": "https://juet.ac.in/#organization",
      name: "Jaypee University of Engineering and Technology (JUET)",
      url: "https://www.juet.ac.in",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Raghogarh, Guna",
        addressRegion: "Madhya Pradesh",
        postalCode: "473226",
        addressCountry: "IN",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta
          name="google-site-verification"
          content="0niLebqPCbZ9SH5BLX0uP_S53oiuwx6Zrxmmw5xAWFM"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        {/* Skip to main content — accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-figma-maroon focus:text-white focus:font-bold focus:rounded-lg focus:shadow-md font-nunito"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Analytics />
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              const register = function() {
                if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    registrations.forEach(function(registration) {
                      registration.unregister();
                    });
                  });
                  return;
                }
                navigator.serviceWorker.register('/sw.js').catch(function(err) {
                  console.error('[SW] Registration failed:', err);
                });
              };
              if (document.readyState === 'complete') {
                register();
              } else {
                window.addEventListener('load', register);
              }
            }
          `}
        </Script>
      </body>
    </html>
  );
}
