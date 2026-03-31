/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        border: "hsl(var(--border))",
        "ide-sidebar": "hsl(var(--ide-sidebar))",
        "ide-sidebar-foreground": "hsl(var(--ide-sidebar-foreground))",
        "ide-sidebar-hover": "hsl(var(--ide-sidebar-hover))",
        "ide-panel": "hsl(var(--ide-panel))",
        "ide-panel-foreground": "hsl(var(--ide-panel-foreground))",
        "ide-tab": "hsl(var(--ide-tab))",
        "ide-tab-active": "hsl(var(--ide-tab-active))",
        "ide-tab-foreground": "hsl(var(--ide-tab-foreground))",
        "ide-tab-active-foreground": "hsl(var(--ide-tab-active-foreground))",
        "ide-border": "hsl(var(--ide-border))",
        "ide-editor": "hsl(var(--ide-editor))",
        "ide-warning": "hsl(var(--ide-warning))",
        "ide-success": "hsl(var(--ide-success))",
        "ide-info": "hsl(var(--ide-info))",
        "ide-chat-user": "hsl(var(--ide-chat-user))",
        "ide-chat-ai": "hsl(var(--ide-chat-ai))"
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.04), 0 20px 60px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"]
      },
      keyframes: {
        "pulse-dot": {
          "0%, 80%, 100%": { opacity: "0.35", transform: "scale(0.9)" },
          "40%": { opacity: "1", transform: "scale(1)" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "pulse-dot": "pulse-dot 1.2s infinite ease-in-out",
        "slide-up": "slide-up 0.25s ease-out"
      }
    }
  },
  plugins: []
};
