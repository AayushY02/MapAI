/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["\"Space Grotesk\"", "sans-serif"],
        display: ["\"Fraunces\"", "serif"],
      },
      colors: {
        ink: "var(--ink)",
        sand: "var(--sand)",
        sun: "var(--sun)",
        ocean: "var(--ocean)",
        moss: "var(--moss)",
        clay: "var(--clay)",
      },
      boxShadow: {
        glow: "0 12px 30px -18px rgba(28, 84, 73, 0.35)",
      },
    },
  },
  plugins: [],
}
