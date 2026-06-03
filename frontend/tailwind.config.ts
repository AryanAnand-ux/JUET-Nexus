import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Generations She Palette
        "brutal-cream": "#FAF9F6",
        "brutal-black": "#111111",
        "brutal-white": "#FFFFFF",
        "brutal-green": "#CBEED5", // soft pastel green
        "brutal-orange": "#FFE5D4", // soft pastel peach
        "brutal-red": "#FCA5A5", // soft pinkish red
        "brutal-yellow": "#D2FA50", // lime accent green
        "brutal-lavender": "#E2D9FF", // pastel lavender
        "brutal-soft-yellow": "#FFF4C2", // pastel yellow
        "figma-bg": "#F5F3FF", // very light violet/slate
        "figma-maroon": "#6366F1", // Indigo accent
        "figma-maroon-dark": "#4F46E5", // Indigo dark
        "figma-maroon-darker": "#3730A3", // Indigo darker
        "figma-dark": "#0F172A", // Slate dark
        "figma-gray": "#64748B", // Slate gray
        "figma-gray-light": "#94A3B8", // Slate light gray
        "figma-red": "#EF4444", // Red accent
        "figma-orange": "#E0E7FF", // light Indigo overlay
        "figma-peach": "#EEF2F6", // soft slate-blue
        "figma-purple": "#8B5CF6", // Violet accent
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
        nunito: ["var(--font-nunito-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Soft, thin geometric outlines rather than heavy brutalist blocks
        "brutal-sm": "1px 1px 0px 0px rgba(17,17,17,1)",
        "brutal": "2px 2px 0px 0px rgba(17,17,17,1)",
        "brutal-lg": "3px 3px 0px 0px rgba(17,17,17,1)",
        "brutal-xl": "4px 4px 0px 0px rgba(17,17,17,1)",
        "brutal-none": "0px 0px 0px 0px rgba(0,0,0,0)",
      },
      borderWidth: {
        "brutal-thin": "1px",
        "brutal-thick": "1.5px", // thin lines characteristic of Generations She
      },
      fontSize: {
        // Typography for clean design
        "brutal-xs": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "brutal-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "brutal-base": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "brutal-lg": ["18px", { lineHeight: "28px", fontWeight: "500" }],
        "brutal-xl": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "brutal-2xl": ["32px", { lineHeight: "40px", fontWeight: "700" }],
        "brutal-3xl": ["48px", { lineHeight: "56px", fontWeight: "800" }],
        "brutal-4xl": ["64px", { lineHeight: "72px", fontWeight: "800" }],
      },
      transitionDuration: {
        "brutal-fast": "100ms",
        "brutal-base": "200ms",
        "brutal-slow": "400ms",
      },
    },
  },
  plugins: [],
};
export default config;
