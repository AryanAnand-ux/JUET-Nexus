import "../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Newsreader, Nunito_Sans } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "../context/ThemeContext";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "JUET Nexus",
    template: "%s | JUET Nexus",
  },
  description:
    "JUET Nexus is a modern, secure proxy dashboard for JUET student portal. View attendance, SGPA/CGPA, and exam schedule in one place.",
  applicationName: "JUET Nexus",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "JUET Nexus Dashboard",
    description: "Modern, secure proxy dashboard for JUET student portal.",
    type: "website",
  },
  robots: { index: false, follow: false }, // Private student tool — keep out of search engines
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} ${nunitoSans.variable}`}>
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
                navigator.serviceWorker.register('/sw.js').then(function(reg) {
                  console.log('[SW] Registered:', reg.scope);
                }).catch(function(err) {
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
