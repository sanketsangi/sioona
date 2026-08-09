/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "ds-background": {
          100: "var(--ds-background-100)",
          200: "var(--ds-background-200)",
        },
        "ds-gray": {
          100: "var(--ds-gray-100)",
          200: "var(--ds-gray-200)",
          300: "var(--ds-gray-300)",
          400: "var(--ds-gray-400)",
          500: "var(--ds-gray-500)",
          600: "var(--ds-gray-600)",
          700: "var(--ds-gray-700)",
          800: "var(--ds-gray-800)",
          900: "var(--ds-gray-900)",
          1000: "var(--ds-gray-1000)",
        },
        "ds-gray-alpha": {
          100: "var(--ds-gray-alpha-100)",
          200: "var(--ds-gray-alpha-200)",
          300: "var(--ds-gray-alpha-300)",
          400: "var(--ds-gray-alpha-400)",
          500: "var(--ds-gray-alpha-500)",
        },
        "ds-blue": {
          100: "var(--ds-blue-100)",
          700: "var(--ds-blue-700)",
          900: "var(--ds-blue-900)",
          1000: "var(--ds-blue-1000)",
        },
        "ds-red": {
          100: "var(--ds-red-100)",
          700: "var(--ds-red-700)",
          800: "var(--ds-red-800)",
          900: "var(--ds-red-900)",
          1000: "var(--ds-red-1000)",
        },
        "ds-amber": {
          100: "var(--ds-amber-100)",
          700: "var(--ds-amber-700)",
          900: "var(--ds-amber-900)",
          1000: "var(--ds-amber-1000)",
        },
        "ds-green": {
          100: "var(--ds-green-100)",
          700: "var(--ds-green-700)",
          900: "var(--ds-green-900)",
          1000: "var(--ds-green-1000)",
        },
        "ds-teal": {
          100: "var(--ds-teal-100)",
          700: "var(--ds-teal-700)",
          900: "var(--ds-teal-900)",
          1000: "var(--ds-teal-1000)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "16px",
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
        300: "300ms",
      },
    },
  },
  plugins: [],
};
