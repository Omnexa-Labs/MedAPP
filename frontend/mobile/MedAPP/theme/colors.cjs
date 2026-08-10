// GENERATED — do not edit by hand.
// Regenerate from the token table in the theme generator; values are documented
// in docs/BRAND.md. Each colour resolves through a CSS custom property so the
// same class works in light and dark mode, and so /opacity modifiers still work.
module.exports = {
  primary: {
    DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
    container: "rgb(var(--color-primary-container) / <alpha-value>)",
    // `color/primary-tint` — the subtle primary-tinted surface the approved
    // frames use behind a 40px icon tile (e.g. sign_up_personal_details 11:38).
    tint: "rgb(var(--color-primary-tint) / <alpha-value>)",
    fixed: "rgb(var(--color-primary-fixed) / <alpha-value>)",
    "fixed-dim": "rgb(var(--color-primary-fixed-dim) / <alpha-value>)",
  },
  "on-primary": "rgb(var(--color-on-primary) / <alpha-value>)",
  "on-primary-container": "rgb(var(--color-on-primary-container) / <alpha-value>)",
  "on-primary-fixed": "rgb(var(--color-on-primary-fixed) / <alpha-value>)",
  "on-primary-fixed-variant": "rgb(var(--color-on-primary-fixed-variant) / <alpha-value>)",
  secondary: {
    DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
    container: "rgb(var(--color-secondary-container) / <alpha-value>)",
    fixed: "rgb(var(--color-secondary-fixed) / <alpha-value>)",
    "fixed-dim": "rgb(var(--color-secondary-fixed-dim) / <alpha-value>)",
  },
  "on-secondary": "rgb(var(--color-on-secondary) / <alpha-value>)",
  "on-secondary-container": "rgb(var(--color-on-secondary-container) / <alpha-value>)",
  "on-secondary-fixed": "rgb(var(--color-on-secondary-fixed) / <alpha-value>)",
  "on-secondary-fixed-variant": "rgb(var(--color-on-secondary-fixed-variant) / <alpha-value>)",
  tertiary: {
    DEFAULT: "rgb(var(--color-tertiary) / <alpha-value>)",
    container: "rgb(var(--color-tertiary-container) / <alpha-value>)",
    fixed: "rgb(var(--color-tertiary-fixed) / <alpha-value>)",
    "fixed-dim": "rgb(var(--color-tertiary-fixed-dim) / <alpha-value>)",
  },
  "on-tertiary": "rgb(var(--color-on-tertiary) / <alpha-value>)",
  "on-tertiary-container": "rgb(var(--color-on-tertiary-container) / <alpha-value>)",
  "on-tertiary-fixed": "rgb(var(--color-on-tertiary-fixed) / <alpha-value>)",
  "on-tertiary-fixed-variant": "rgb(var(--color-on-tertiary-fixed-variant) / <alpha-value>)",
  background: "rgb(var(--color-background) / <alpha-value>)",
  surface: {
    DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
    dim: "rgb(var(--color-surface-dim) / <alpha-value>)",
    bright: "rgb(var(--color-surface-bright) / <alpha-value>)",
    container: "rgb(var(--color-surface-container) / <alpha-value>)",
    "container-low": "rgb(var(--color-surface-container-low) / <alpha-value>)",
    "container-lowest": "rgb(var(--color-surface-container-lowest) / <alpha-value>)",
    "container-high": "rgb(var(--color-surface-container-high) / <alpha-value>)",
    "container-highest": "rgb(var(--color-surface-container-highest) / <alpha-value>)",
    variant: "rgb(var(--color-surface-variant) / <alpha-value>)",
    tint: "rgb(var(--color-surface-tint) / <alpha-value>)",
  },
  // Surface ROLES, not new colours. Both were already declared in global.css
  // and theme/palette.cjs (so JS could resolve them) but were never bound to a
  // Tailwind class, which is why Card/Input had to name a fixed surface step
  // instead — and why the card shipped as literal white in dark mode. Kept
  // top-level (not under `surface`) so the class reads `bg-card-surface`.
  //
  //   role            light                      dark
  //   card-surface    surface-container-lowest   surface-container-high
  //   field-surface   primary-tint               surface-container-lowest
  //
  // The alias points the OPPOSITE way per mode on purpose: see the block
  // comment in global.css.
  "card-surface": "rgb(var(--color-card-surface) / <alpha-value>)",
  "field-surface": "rgb(var(--color-field-surface) / <alpha-value>)",
  "on-background": "rgb(var(--color-on-background) / <alpha-value>)",
  "on-surface": "rgb(var(--color-on-surface) / <alpha-value>)",
  "on-surface-variant": "rgb(var(--color-on-surface-variant) / <alpha-value>)",
  "inverse-surface": "rgb(var(--color-inverse-surface) / <alpha-value>)",
  "inverse-on-surface": "rgb(var(--color-inverse-on-surface) / <alpha-value>)",
  "inverse-primary": "rgb(var(--color-inverse-primary) / <alpha-value>)",
  outline: {
    DEFAULT: "rgb(var(--color-outline) / <alpha-value>)",
    variant: "rgb(var(--color-outline-variant) / <alpha-value>)",
  },
  error: {
    DEFAULT: "rgb(var(--color-error) / <alpha-value>)",
    container: "rgb(var(--color-error-container) / <alpha-value>)",
  },
  "on-error": "rgb(var(--color-on-error) / <alpha-value>)",
  "on-error-container": "rgb(var(--color-on-error-container) / <alpha-value>)",
  success: {
    DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
    container: "rgb(var(--color-success-container) / <alpha-value>)",
  },
  "on-success": "rgb(var(--color-on-success) / <alpha-value>)",
  "on-success-container": "rgb(var(--color-on-success-container) / <alpha-value>)",
  shadow: "rgb(var(--color-shadow) / <alpha-value>)",
  scrim: "rgb(var(--color-scrim) / <alpha-value>)",
};
