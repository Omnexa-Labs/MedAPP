/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2F6FED",
          50: "#EEF3FE",
          500: "#2F6FED",
          700: "#1B4FB8",
        },
      },
    },
  },
  plugins: [],
};
