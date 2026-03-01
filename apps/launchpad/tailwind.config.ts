import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: "var(--brand-teal)",
          gold: "var(--brand-gold)",
          light: "var(--brand-light)",
          dark: "var(--brand-dark)",
          text: "var(--brand-text)",
        },
      },
      fontFamily: {
        sans: ["Gilroy", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tighter: "-0.03em",
      },
    },
  },
  plugins: [],
};

export default config;
