# Mobile UX guidance

Supporting guidance for designing and building MedApp screens. Distilled from two
community Claude Code design skills, with their conflicts against our own system
resolved here rather than left for an agent to guess at:

- [awesome-skills/mobile-app-design](https://github.com/awesome-skills/mobile-app-design)
  — iOS/Android conventions, accessibility, React Native pitfalls
- [ceorkm/mobile-app-ui-design](https://github.com/ceorkm/mobile-app-ui-design)
  — composition and "does it feel alive" polish

## Precedence — read this first

**`docs/BRAND.md` wins. Always.** It owns every token, the type ramp, the spacing
scale, the radius scale, elevation, iconography, and the app shell. Nothing in this
file may override it.

This file is only authoritative for things BRAND.md does not cover: platform
conventions, accessibility thresholds, motion timings, thumb reach, loading and
empty states, and React Native performance.

### Conflicts, already resolved — do not "fix" these back

| Source claim | Our rule | Why |
|---|---|---|
| "Labels 11pt minimum" | **Nothing under 12sp** | BRAND's ramp bottoms out at `label-sm` 12. 11pt is below our floor. |
| "Max 4 sizes, 2 weights" | **6-step ramp** (28/24/20/16/14/12) | Our ramp is already defined and in use across every approved frame. |
| "8-point grid, spacing divisible by 8" | **4 / 8 / 12 / 16 / 24 / 32 / 48** | 12 and 24 are load-bearing in the approved frames. Our scale is 4-based, which subsumes 8. |
| "Android touch target 48dp" | **44pt minimum, 48 preferred** | 44 is BRAND's floor and what the frames are built to. Treat 48 as the target to beat, never as licence to shrink below 44. |
| iOS San Francisco / Android Roboto system fonts | **Manrope headlines, Inter body** | We are a branded product with a defined type pairing, not a system-styled app. |

## Accessibility — hard floors

- Touch targets **≥ 44×44pt**. Space adjacent targets **≥ 8pt** apart. If the
  design draws a smaller control, keep the visual size and expand the target with
  padding or `hitSlop` — never ship a 36pt tap area.
- Contrast: **4.5:1** normal text, **3:1** for large text (18pt+) and for UI
  component boundaries. Check this in **both** modes — our recurring failure is a
  correct light value paired with an illegible dark one.
- Never encode meaning in colour alone. An error state needs text or an icon, not
  just a red border.
- Every interactive element needs an `accessibilityLabel`; inputs need
  `accessibilityHint` and `aria-invalid` when in error; async results need a live
  region.

## Motion

- Touch feedback within **100ms**. If a press has no immediate visual response,
  the app reads as broken regardless of how fast the work completes.
- Show a loading indicator for anything over **1 second**. Under that, a spinner
  flashes and looks like a glitch.
- Target **60fps**. Debounce rapid input.
- **Reserve layout space for async content.** A card that grows when data lands
  causes a layout shift, which reads as jank even at 60fps.

## Composition

- **Thumb zone**: primary actions belong in the bottom third. Our CTAs already sit
  at the bottom of the auth screens — keep it that way.
- **Progressive disclosure**: show what's needed, reveal the rest. This is the
  argument for the sign-up wizard being three steps instead of one long form.
- Roughly **60 / 30 / 10** neutral / secondary / accent. Practically: teal is the
  accent, not the field. If a screen reads as mostly teal, the ratio is inverted.
- One idea per section, separated by the spacing scale rather than by rules and
  boxes. Prefer removing a divider over adding one.

## Platform conventions

- Back affordance top-left; a single primary action top-right. Bottom tab bar with
  3–5 items. Our patient and practitioner shells both follow this.
- Android hardware/gesture back must do the same thing as the on-screen back.
- Don't invent navigation. If a screen needs a pattern the shell doesn't have,
  that's a design-system conversation, not a per-screen improvisation.

## React Native specifics

- No literal colours — every value through a token (see BRAND.md). This includes
  `shadowColor`, `borderColor`, and anything inside a `StyleSheet`.
- No direct icon-library imports in a screen; go through the shared `<Icon />`.
- Lists: key stably, avoid re-creating closures per row, and virtualise long lists.
- Test at 393pt wide *and* at a large font scale. Our frames are 393; the device
  may not be.

## Common mistakes this project has actually made

Kept as a checklist because each of these shipped at least once:

- An accent background paired with the wrong `on-` token — illegible in dark mode.
  Shipped three times (`#003731` on `#005049`).
- A card fill naming a fixed surface *step* instead of a surface *role*, so it
  inverted between modes.
- A drop shadow doing work the hairline and surface tone already did.
- An empty coloured circle with no glyph — reads as a broken image.
- Emoji standing in for icons.
- A stale type value inherited from the prototype dump (`headline-xl` at 40 when
  BRAND says 28).
- A layer left named "Frame" in Figma, so no one can tell what it is.
- A control drawn at 40×40 with no 44pt target override.
