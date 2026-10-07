import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://juetnexus.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login"],
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/dashboard/*",
          "/api/",
          "/_next/",
        ],
      },
      {
        userAgent: [
          "GPTBot",
          "PerplexityBot",
          "Google-Extended",
          "ClaudeBot",
          "Applebot-Extended",
        ],
        allow: ["/", "/login"],
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/dashboard/*",
          "/api/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
