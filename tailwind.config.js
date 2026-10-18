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
        // Warm "workshop" palette: cream paper, walnut wood, honey accents.
        cream: { 50: "#fffdf8", 100: "#fbf6ec", 200: "#f5ecdb", 300: "#ecdfc6", 400: "#dfcdaa" },
        bark: { 50: "#f3ebe0", 100: "#e6d8c6", 200: "#cdb79c", 300: "#b39a7a", 400: "#957a5c", 500: "#7a5f45", 600: "#62483a", 700: "#4c3728", 800: "#3a2a1e", 900: "#2a1d14" },
        walnut: { 400: "#8d5a36", 500: "#7a4b2c", 600: "#6b4428", 700: "#5a3620", 800: "#46291a" },
        honey: { 100: "#fdf1d4", 200: "#f9e1a6", 300: "#f2c96b", 400: "#e6b14a", 500: "#d49a2c", 600: "#b07a19" },
        rust: { 100: "#fbe4da", 500: "#c2552e", 600: "#a8431f", 700: "#8c3617" },
        sage: { 100: "#e3eedf", 500: "#4f8a4c", 600: "#3f7040" },
        lake: { 100: "#dde9f3", 500: "#3f7ba6", 600: "#2f5f84" },
        plum: { 100: "#ebe0f0", 500: "#8a5a9e", 600: "#6f4582" },
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', "Palatino", "Georgia", "serif"],
        body: ["ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(74, 50, 30, 0.06), 0 6px 18px -6px rgba(74, 50, 30, 0.18)",
        chip: "0 1px 1px rgba(74, 50, 30, 0.08)",
        inset: "inset 0 1px 3px rgba(42, 29, 20, 0.25)",
      },
    },
  },
  plugins: [],
}
