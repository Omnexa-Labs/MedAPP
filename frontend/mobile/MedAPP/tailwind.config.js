/**
 * `headline-lg` — 24px per docs/BRAND.md. Declared once and shared by the
 * deprecated `headline-lg-mobile` alias so the two can never drift apart again.
 */
const HEADLINE_LG = ["24px", { lineHeight: "1.3", fontWeight: "700" }];

/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 (RN 0.83 + Expo SDK 55)
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/features/**/*.{js,jsx,ts,tsx}",
    "./src/hooks/**/*.{js,jsx,ts,tsx}",
    // Tests are NOT a source of utility classes, and scanning them broke the
    // bundler once: a theme drift-guard QUOTED a bad class in a comment
    // (`text-[color:var(--color/on-primary,white)]`), Tailwind harvested it as
    // a real arbitrary value, and the `/` produced CSS that Metro could not
    // parse — `SyntaxError: Unexpected token Delim('/')`, with no file or line
    // pointing anywhere near the test. A suite that names classes in order to
    // forbid them must not also define them.
    "!./src/**/__tests__/**",
    "!./src/**/*.test.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      // -----------------------------------------------------------------
      // Color tokens (Material 3 teal scheme — see docs/BRAND.md)
      //
      // Each token resolves through a CSS custom property declared in
      // global.css, which has both a :root (light) and .dark:root (dark)
      // block. One class therefore works in both modes, and alpha
      // modifiers (`bg-primary/20`) keep working because the vars hold
      // space-separated RGB channels rather than hex.
      //
      // GENERATED — edit the token table in the theme generator, not here.
      // -----------------------------------------------------------------
      colors: require("./theme/colors.cjs"),

      // -----------------------------------------------------------------
      // Spacing
      //
      // docs/BRAND.md defines the scale as 4 / 8 / 12 / 16 / 24 / 32 / 48.
      // Tailwind's numeric defaults already cover it exactly (1/2/3/4/6/8/12),
      // so prefer those for new work — `py-4` is 16px, `gap-8` is 32px.
      //
      // The named aliases below are the older Stitch names still referenced
      // across the pre-design-system screens. Two of them are NOT on the scale
      // and must not be used in new code:
      //   - `xl` (80px)  — no BRAND step. BookingConfirmedScreen's `mt-xl` is
      //                    gone (booking-flow reconciliation, spec G13), but the
      //                    "only remaining user" note was already stale: it also
      //                    survives in InboxScreen (`py-xl`) and
      //                    PractitionerSocialProfileScreen (`px-xl`, `py-xl`).
      //                    Delete the alias when those two frames are rebuilt.
      //   - `gutter`     — an alias for 24px, i.e. `md`; kept for old call sites.
      // `sm` is 12px (not 8px) for the same historical reason — read it as the
      // scale's 12, and use `base` for 8.
      // -----------------------------------------------------------------
      spacing: {
        xs: "4px",
        base: "8px",
        sm: "12px",
        md: "24px",
        lg: "48px",
        xl: "80px",
        gutter: "24px",
        "container-max": "1280px",
      },

      // -----------------------------------------------------------------
      // Border radius
      //
      // docs/BRAND.md: 12 (inputs, buttons, chips), 24 (cards), full (pills,
      // avatars) — those are `md`, `card` and `full` here. `lg`/`xl` are the
      // legacy Stitch values (8px / 12px) that the not-yet-rebuilt screens
      // still use; don't reach for them in new work.
      //
      // `tile` (32px) is a fourth step the approved Splash frame introduces for
      // its 160px icon tile (node 51:110). It is named rather than inlined as
      // an arbitrary value, and is flagged for the designer: either it becomes
      // an official BRAND step or the frame drops to 24.
      //
      // `xs` (4px) is the `radius/4` step the approved Login frame introduces
      // for its Checkbox (node 1:68, `rounded-[4px]`). docs/BRAND.md says
      // "12 / 24 / full — nothing else", so this is a real BRAND<->Figma
      // conflict; it is named (never the legacy `DEFAULT`) so the conflict is
      // greppable, and it is flagged for the designer: either 4 becomes an
      // official BRAND step or the checkbox moves to 12.
      // -----------------------------------------------------------------
      borderRadius: {
        DEFAULT: "0.25rem",
        xs: "4px",
        lg: "0.5rem",
        xl: "0.75rem",
        md: "12px",
        card: "24px",
        tile: "32px",
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
        // DEPRECATED alias of `headline-lg` — same family, and (since the 32->24
        // correction below) the same size/leading too. Use `headline-lg`.
        "headline-lg-mobile": ["Manrope_700Bold", "System"],
        "headline-md": ["Manrope_600SemiBold", "System"],
        "body-lg": ["Inter_400Regular", "System"],
        "body-md": ["Inter_400Regular", "System"],
        "label-md": ["Inter_600SemiBold", "System"],
        "label-sm": ["Inter_500Medium", "System"],
      },
      // -----------------------------------------------------------------
      // Type sizes
      //
      // Every value below is the FIGMA VARIABLE value (get_variable_defs on the
      // approved Login frame, 57:112) reconciled against docs/BRAND.md. Where
      // the two disagreed the drift was always the same shape: a stale number
      // inherited from the Stitch HTML dump. Three of those were corrected in
      // this pass and are called out inline so they can't silently return:
      //
      //   label-sm  lineHeight 1   -> 1.3   (Figma)
      //   label-md  lineHeight 1   -> 1.3, and letterSpacing 0.01em -> 0 (Figma)
      //   body-md   lineHeight 1.6 -> 1.4   (Figma)
      //
      // A lineHeight of `1` is not a design value — it is what you get when a
      // dump omits the leading. At 12px/14px it clamps descenders on Android.
      // -----------------------------------------------------------------
      fontSize: {
        // Figma 57:112: lineHeight 1.3 (was a stale `1`).
        "label-sm": ["12px", { lineHeight: "1.3", fontWeight: "500" }],
        // Figma 57:112: lineHeight 1.3, letterSpacing 0 — so NO tracking key.
        // The old `0.01em` was invented by the dump; label type on this ramp is
        // set solid, and tracking is scoped to the badge caption (see Badge.tsx).
        "label-md": ["14px", { lineHeight: "1.3", fontWeight: "600" }],
        // Figma 57:112: lineHeight 1.4 (was a stale 1.6).
        "body-md": ["16px", { lineHeight: "1.4", fontWeight: "400" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        // 20px per docs/BRAND.md ("headline-md | Manrope SemiBold | 20 | Card
        // titles"). It shipped as a stale 24px from the Stitch dump — the same
        // drift that headline-xl had below, corrected the same way: the token
        // owns the brand value and every call site inherits it.
        "headline-md": ["20px", { lineHeight: "1.4", fontWeight: "600" }],
        // 24px per docs/BRAND.md ("headline-lg | Manrope Bold | 24 | Section
        // headings"). It shipped as a stale 32px with -0.01em tracking from the
        // Stitch dump — the third instance of the same drift as headline-xl
        // (40->28) and headline-md (24->20).
        //
        // COLLAPSED: at 24/1.3/700 this is byte-for-byte what
        // `headline-lg-mobile` already was, so there is now ONE value and
        // `headline-lg-mobile` is a deprecated ALIAS of it — not a second step.
        // BRAND's ramp has no "-mobile" variant (the app is mobile-only, so the
        // distinction never meant anything), and `headline-lg` is the brand name,
        // so new work uses `headline-lg`. The alias is retained rather than
        // deleted only because four live call sites still name it and two of
        // those are pre-design-system screens excluded from this pass; deleting
        // the key would leave them with no font size at all (NativeWind drops
        // unknown utilities silently). Delete it once those four are renamed.
        "headline-lg": HEADLINE_LG,
        "headline-lg-mobile": HEADLINE_LG,
        // 28px per docs/BRAND.md ("headline-xl | Manrope Bold | 28 | Screen
        // titles") and the approved Figma frames. It shipped as a stale 40px
        // from the Stitch dump; correcting it here is the whole point of having
        // a token — screens that used the old value get the brand size.
        "headline-xl": ["28px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};
