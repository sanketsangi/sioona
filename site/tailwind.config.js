/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    /*
     * Colors are replaced (not extended) so the default Tailwind palette is
     * unavailable by construction: components can only bind to --sio-* tokens.
     */
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      sunset: "rgb(var(--sio-sunset-rgb) / <alpha-value>)",
      sio: {
        "bg-base": "var(--sio-bg-base)",
        "bg-subtle": "var(--sio-bg-subtle)",
        "bg-muted": "var(--sio-bg-muted)",
        "bg-interactive": "var(--sio-bg-interactive)",
        "bg-interactive-hover": "var(--sio-bg-interactive-hover)",
        "bg-inverse": "var(--sio-bg-inverse)",
        "bg-inverse-hover": "var(--sio-bg-inverse-hover)",
        "bg-overlay": "var(--sio-bg-overlay)",
        "bg-nav": "var(--sio-bg-nav)",
        "bg-disabled": "var(--sio-bg-disabled)",
        "fg-base": "var(--sio-fg-base)",
        "fg-subtle": "var(--sio-fg-subtle)",
        "fg-muted": "var(--sio-fg-muted)",
        "fg-faint": "var(--sio-fg-faint)",
        "fg-on-color": "var(--sio-fg-on-color)",
        "fg-link": "var(--sio-fg-link)",
        "fg-link-hover": "var(--sio-fg-link-hover)",
        "border-base": "var(--sio-border-base)",
        "border-strong": "var(--sio-border-strong)",
        "border-subtle": "var(--sio-border-subtle)",
        "border-muted": "var(--sio-border-muted)",
        "focus-accent": "var(--sio-focus-accent)",
        "signal-lead-bg": "var(--sio-signal-lead-bg)",
        "signal-lead-fg": "var(--sio-signal-lead-fg)",
        "signal-lead-fg-strong": "var(--sio-signal-lead-fg-strong)",
        "signal-retention-bg": "var(--sio-signal-retention-bg)",
        "signal-retention-fg": "var(--sio-signal-retention-fg)",
        "signal-retention-accent": "var(--sio-signal-retention-accent)",
        "signal-upsell-bg": "var(--sio-signal-upsell-bg)",
        "signal-upsell-fg": "var(--sio-signal-upsell-fg)",
        "signal-upsell-accent": "var(--sio-signal-upsell-accent)",
        "status-pending-bg": "var(--sio-status-pending-bg)",
        "status-pending-fg": "var(--sio-status-pending-fg)",
        "status-pending-accent": "var(--sio-status-pending-accent)",
        "status-success-bg": "var(--sio-status-success-bg)",
        "status-success-fg": "var(--sio-status-success-fg)",
        "status-success-accent": "var(--sio-status-success-accent)",
        "status-warning-bg": "var(--sio-status-warning-bg)",
        "status-warning-fg": "var(--sio-status-warning-fg)",
        "status-warning-accent": "var(--sio-status-warning-accent)",
        "status-danger-bg": "var(--sio-status-danger-bg)",
        "status-danger-fg": "var(--sio-status-danger-fg)",
        "status-danger-accent": "var(--sio-status-danger-accent)",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        panel: "var(--radius-panel)",
        group: "var(--radius-group)",
      },
      maxWidth: {
        page: "var(--page-max)",
      },
      transitionTimingFunction: {
        sio: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
