import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Neutral palette — high contrast for arena visibility
        surface: {
          DEFAULT: "#0B0B0D",
          elevated: "#141418",
          raised: "#1C1C22",
          border: "#2A2A32",
          hover: "#23232B",
        },
        // Primary accent — basketball energy
        accent: {
          DEFAULT: "#FF6B1A",
          hover: "#FF7D38",
          muted: "#7A3410",
          dim: "#3A1F10",
        },
        // Team colour defaults (semantic, can be overridden per team)
        home: {
          DEFAULT: "#3B82F6",
          dim: "#1E3A8A",
        },
        away: {
          DEFAULT: "#EF4444",
          dim: "#7F1D1D",
        },
        // Semantic
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        ink: {
          DEFAULT: "#F5F5F4",
          muted: "#A3A3A3",
          dim: "#737373",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Scoreboard sizes
        "score-xl": ["clamp(4rem, 12vw, 10rem)", { lineHeight: "0.9", letterSpacing: "-0.04em" }],
        "score-lg": ["clamp(2.5rem, 7vw, 5rem)", { lineHeight: "0.9", letterSpacing: "-0.03em" }],
        clock: ["clamp(2rem, 7vw, 5rem)", { lineHeight: "0.9", letterSpacing: "0.02em" }],
      },
      boxShadow: {
        "panel": "0 0 0 1px #2A2A32, 0 1px 2px rgba(0,0,0,0.4)",
        "accent-glow": "0 0 0 1px #FF6B1A, 0 0 20px rgba(255, 107, 26, 0.25)",
      },
      animation: {
        "pulse-ring": "pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
      },
      keyframes: {
        pulseRing: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.7)" },
          "50%": { boxShadow: "0 0 0 8px rgba(239, 68, 68, 0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
