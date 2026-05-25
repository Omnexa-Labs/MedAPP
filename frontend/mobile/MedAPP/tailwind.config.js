/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 (RN 0.83 + Expo SDK 55)
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/features/**/*.{js,jsx,ts,tsx}",
    "./src/hooks/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      // -----------------------------------------------------------------
      // Color tokens (from the Stitch splash export — Material 3 inspired)
      // -----------------------------------------------------------------
      colors: {
        primary: {
          DEFAULT: "#00685f",
          container: "#008378",
          fixed: "#89f5e7",
          "fixed-dim": "#6bd8cb",
        },
        "on-primary": "#ffffff",
        "on-primary-container": "#f4fffc",
        "on-primary-fixed": "#00201d",
        "on-primary-fixed-variant": "#005049",

        secondary: {
          DEFAULT: "#515f74",
          container: "#d5e3fc",
          fixed: "#d5e3fc",
          "fixed-dim": "#b9c7df",
        },
        "on-secondary": "#ffffff",
        "on-secondary-container": "#57657a",
        "on-secondary-fixed": "#0d1c2e",
        "on-secondary-fixed-variant": "#3a485b",

        tertiary: {
          DEFAULT: "#0058be",
          container: "#2170e4",
          fixed: "#d8e2ff",
          "fixed-dim": "#adc6ff",
        },
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#fefcff",
        "on-tertiary-fixed": "#001a42",
        "on-tertiary-fixed-variant": "#004395",

        background: "#f5faf8",
        surface: {
          DEFAULT: "#f5faf8",
          dim: "#d6dbd9",
          bright: "#f5faf8",
          container: "#eaefed",
          "container-low": "#f0f5f2",
          "container-lowest": "#ffffff",
          "container-high": "#e4e9e7",
          "container-highest": "#dee4e1",
          variant: "#dee4e1",
          tint: "#006a61",
        },
        "on-background": "#171d1c",
        "on-surface": "#171d1c",
        "on-surface-variant": "#3d4947",
        "inverse-surface": "#2c3130",
        "inverse-on-surface": "#edf2f0",
        "inverse-primary": "#6bd8cb",

        outline: {
          DEFAULT: "#6d7a77",
          variant: "#bcc9c6",
        },

        error: {
          DEFAULT: "#ba1a1a",
          container: "#ffdad6",
        },
        "on-error": "#ffffff",
        "on-error-container": "#93000a",
      },

      // -----------------------------------------------------------------
      // Spacing scale (from Stitch — keep the named tokens; defaults remain)
      // -----------------------------------------------------------------
      spacing: {
        xs: "4px",
        sm: "12px",
        base: "8px",
        md: "24px",
        lg: "48px",
        xl: "80px",
        gutter: "24px",
        "container-max": "1280px",
      },

      // -----------------------------------------------------------------
      // Border radius (Stitch tokens)
      // -----------------------------------------------------------------
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },

      // -----------------------------------------------------------------
      // Type system — Manrope for headlines, Inter for body/labels
      // The Expo Font family names match the @expo-google-fonts exports.
      // -----------------------------------------------------------------
      // RN doesn't have a real "fontWeight" concept across custom fonts — each
      // weight is a separate font family. So these family classes resolve
      // directly to the right weighted Google Fonts export, matching the
      // Stitch dump's font-headline-xl / font-body-lg / font-label-md classes.
      fontFamily: {
        // Generic family aliases (use sparingly; prefer the semantic ones).
        manrope: ["Manrope_400Regular", "System"],
        "manrope-semibold": ["Manrope_600SemiBold", "System"],
        "manrope-bold": ["Manrope_700Bold", "System"],
        "manrope-extrabold": ["Manrope_800ExtraBold", "System"],
        inter: ["Inter_400Regular", "System"],
        "inter-medium": ["Inter_500Medium", "System"],
        "inter-semibold": ["Inter_600SemiBold", "System"],

        // Semantic family aliases — these mirror Stitch's font-<token> classes.
        // Pair each with the matching text-<token> for size/leading/tracking.
        "headline-xl": ["Manrope_700Bold", "System"],
        "headline-lg": ["Manrope_700Bold", "System"],
        "headline-lg-mobile": ["Manrope_700Bold", "System"],
        "headline-md": ["Manrope_600SemiBold", "System"],
        "body-lg": ["Inter_400Regular", "System"],
        "body-md": ["Inter_400Regular", "System"],
        "label-md": ["Inter_600SemiBold", "System"],
        "label-sm": ["Inter_500Medium", "System"],
      },
      fontSize: {
        "label-sm": ["12px", { lineHeight: "1", fontWeight: "500" }],
        "label-md": ["14px", { lineHeight: "1", letterSpacing: "0.01em", fontWeight: "600" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-md": ["24px", { lineHeight: "1.4", fontWeight: "600" }],
        "headline-lg-mobile": ["24px", { lineHeight: "1.3", fontWeight: "700" }],
        "headline-lg": [
          "32px",
          { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        "headline-xl": ["40px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};
