/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Mirrors the colour palette in packages/web/tailwind.config.ts so
      // both apps share one visual language. Keep the two in sync.
      colors: {
        surface: {
          DEFAULT: "#0B0B0D",
          elevated: "#141418",
          raised: "#1C1C22",
          border: "#2A2A32",
          hover: "#23232B",
        },
        accent: {
          DEFAULT: "#FF6B1A",
          hover: "#FF7D38",
          muted: "#7A3410",
          dim: "#3A1F10",
        },
        home: {
          DEFAULT: "#3B82F6",
          dim: "#1E3A8A",
        },
        away: {
          DEFAULT: "#EF4444",
          dim: "#7F1D1D",
        },
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        ink: {
          DEFAULT: "#F5F5F4",
          muted: "#A3A3A3",
          dim: "#737373",
        },
      },
    },
  },
  plugins: [],
};
