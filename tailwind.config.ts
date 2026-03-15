import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        sidebar: "hsl(var(--sidebar))",
        /* Layer tokens — Case B */
        layer: {
          0: "#0A0A0A",
          1: "#141414",
          2: "#1C1C1C",
          3: "#242424",
        },
        /* Division Orange */
        division: {
          orange: "#FF8C00",
          "orange-dim": "rgba(255,140,0,0.15)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) + 1px)",
        sm: "var(--radius)",
      },
      boxShadow: {
        "glow-orange": "0 0 0 1px rgba(255,140,0,0.45), 0 0 20px rgba(255,140,0,0.25)",
        "glow-green":  "0 0 0 1px rgba(0,210,100,0.35), 0 0 18px rgba(0,210,100,0.20)",
        "glow-red":    "0 0 0 1px rgba(255,45,80,0.35),  0 0 14px rgba(255,45,80,0.18)",
        "card-hover":  "0 0 0 1px rgba(255,107,0,0.30)",
        /* compat */
        "glow-cyan":   "0 0 0 1px rgba(255,107,0,0.35), 0 0 18px rgba(255,107,0,0.20)",
      },
      backgroundImage: {
        "btn-primary":  "linear-gradient(135deg, #FF8C00 0%, #E06000 100%)",
        "content-glow": "radial-gradient(ellipse 70% 30% at 50% 0%, rgba(255,107,0,0.04) 0%, transparent 70%)",
      },
      animation: {
        "pulse-slow":       "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer":          "shimmer 2.2s ease-in-out infinite",
        "glow-pulse":       "glow-pulse 2.5s ease-in-out infinite",
        "score-glow":       "score-glow 3s ease-in-out infinite",
        "scan":             "scan 8s linear infinite",
        "status-tick":      "status-tick 2s ease-in-out infinite",
        "bracket-flicker":  "bracket-flicker 7s ease-in-out infinite",
        "border-flow":      "border-flow 3s ease-in-out infinite",
        "crosshair-spin":   "crosshair-spin 8s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
