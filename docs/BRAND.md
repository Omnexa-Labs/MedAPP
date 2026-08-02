# MedApp — Brand Identity

The canonical source is the **Brand Identity** page in the Figma file
[MedApp — Premium Healthcare UI](https://www.figma.com/design/kRifcg1KCEAlTXy4aimotK).
This document mirrors it so the codebase can be reviewed without opening Figma.
If the two disagree, Figma wins for visuals and this file wins for asset paths.

Brand strategy follows the product mission in [PROJECT.md](PROJECT.md): a
mobile-first, user-owned health layer for emerging markets (Ghana, Nigeria,
Kenya). That drives three constraints most healthcare brands don't have:

- **Warm, not clinical.** Our users are "anyone with a body and a phone", not
  patients in a hospital. The identity should not feel institutional.
- **Legible on cheap hardware.** Low-density Android screens, bright sunlight,
  small type. Contrast and minimum sizes are functional requirements.
- **Light payload.** Bandwidth costs money. Prefer vector/flat colour over
  photography and heavy gradients.

## Logo

**Concept — "Continuity Thread".** Three **equal** nodes joined by one continuous
line. The nodes are the points a health record passes through — a provider, the
record itself, the user — and the unbroken line between them is the product's
whole premise: a record that follows the user across providers and time instead
of resetting at each visit.

It deliberately avoids the four clichés of medical-app branding: the plain
cross, the EKG line, the stethoscope, and the plus-in-a-circle.

> **Why the nodes are the same size.** The first version of this mark was a small
> dot, a curved tail, and a bulbous teardrop "pin". That silhouette reads as a
> sperm cell — a serious misfire for a general healthcare product, since it
> implies reproductive health we don't offer. Equal node sizes remove the
> head/tail asymmetry that created the reading. **Do not** resize one node,
> taper the line, or reintroduce a teardrop terminal.

Geometry lives in one place: the **`Mark / Continuity Dots`** component on the
Figma *Design System* page. `Icon`, `Wordmark` and `Wordmark / Reversed` are all
instances of it that only override colour — so the mark cannot drift between
contexts the way it did when frames carried their own copies.

### Variants

| Variant | Asset | Use |
|---|---|---|
| Primary | `frontend/mobile/MedAPP/assets/branding/logo.png` | Teal mark + teal type, on light surfaces |
| Reversed | `frontend/mobile/MedAPP/assets/branding/logo-reversed.png` | White mark + white type, on teal / dark / photography |
| Icon only | `frontend/mobile/MedAPP/assets/branding/app-icon.png` | App icon, favicons, tight spaces |

In React Native, always go through the shared component — never `<Image>` the
files directly and never redraw the mark inline:

```tsx
import { Logo } from "@/components/ui";

<Logo variant="wordmark" height={28} />   // light surfaces
<Logo variant="reversed" height={28} />   // teal / dark surfaces
<Logo variant="icon" height={32} />       // compact
```

### Logo rules

- **Do** use the exported assets. Never redraw, re-trace, or re-typeset the mark.
- **Do** keep clear space on all sides equal to the height of the mark's dot.
- **Do** switch to the reversed variant on teal, dark, or photographic backgrounds.
- **Don't** stretch, rotate, recolour, outline, or add shadows/effects.
- **Don't** place the logo on a busy image without a scrim behind it.
- **Don't** pair the logo with a second mark or icon in the same lockup.

> Asset note: Figma's PNG export bakes an opaque `#F5F5F5` matte behind
> transparent frames. Exports are post-processed to restore true transparency
> (and to derive the reversed variant) — if you re-export by hand, check the
> alpha channel before committing, or the logo will ship with a grey box.

## Colour

Teal carries the brand. Everything else is functional — it exists to
communicate state, not to decorate.

| Token | Hex | Role |
|---|---|---|
| `color/primary` | `#00685F` | Brand teal. CTAs, active states, the logo. |
| `color/primary-container` | `#008378` | Hero surfaces, gradient ends. |
| `color/on-primary` | `#FFFFFF` | Text/icons on teal. |
| `color/on-surface` | `#171D1C` | Headings, primary body text. |
| `color/on-surface-variant` | `#3D4947` | Secondary text, captions. |
| `color/outline-variant` | `#BCC9C6` | Hairlines, dividers, input borders. |
| `color/surface` / `color/background` | `#F5FAF8` | App canvas. |
| `color/success` | `#0B8043` | Confirmations, in-range vitals. |
| `color/success-container` | `#D7F0DD` | Success chip backgrounds. |
| `color/error` | `#BA1A1A` | Validation errors, out-of-range vitals. |
| `color/error-container` | `#FFDAD6` | Error banner backgrounds. |

### Dark mode

Both modes are first-class. The scheme is **System / Light / Dark**, defaulting
to System — a binary toggle is not acceptable because it strands users who want
the app to follow the OS.

- **Control location:** Settings → Appearance, rendered by
  `<AppearanceSelector />` (`src/components/ui/AppearanceSelector.tsx`).
- **State:** `src/lib/theme.ts` — a persisted zustand store (`AsyncStorage`),
  applied through NativeWind, which toggles the `.dark` class.
- **Tokens:** `global.css` declares every colour twice, under `:root` and
  `.dark:root`, as space-separated RGB channels so `bg-primary/20` still works.
  Tailwind reads them via `theme/colors.cjs` (generated — don't hand-edit).
- **Figma:** the `Colors` collection has **Light** and **Dark** modes. Pin a
  frame to a mode with `setExplicitVariableModeForCollection` to preview.

Dark values follow Material 3 tone mapping: accents move 40 → 80, on-accents
→ 20, containers → 30. `*-fixed` tokens are intentionally identical in both
modes — that's what "fixed" means in M3, don't "fix" them.

Rules that follow from having two modes:

- **Never hardcode a colour, including white.** `#FFFFFF` looks harmless and
  then stays white on a near-black surface. Use `surface`,
  `surface-container-lowest`, or `on-primary` — whichever is semantically right.
- **Never use a raw white/black fill on an icon container or tab item.** Leave
  those transparent so the parent surface shows through.
- **Text on an accent must use its `on-*` pair**, never literal white — in dark
  mode `primary` becomes light, so white-on-primary fails contrast.
- **The logo must follow the theme.** `<Logo />` defaults to `variant="auto"`,
  which resolves to the reversed (white) asset in dark mode. Only pass an
  explicit variant for surfaces that *don't* follow the theme (e.g. an
  always-teal hero card needs `variant="reversed"` even in light mode).
- **Check both modes before calling a screen done.** Most theming bugs are
  invisible in the mode you designed in.

### Colour rules

- **Never hardcode a hex.** Use the token. If a colour is genuinely missing, add
  a token (Figma variable + `tailwind.config.js`) rather than inlining a value.
- **Never use colour as the only signal** for clinical meaning. An out-of-range
  vital must also carry text or an icon (e.g. "▲ Above target range") — required
  by WCAG 1.4.1 and doubly important in sunlight on low-quality displays.
- Body text must clear **4.5:1** against its background; large text and icons
  **3:1**.

## Typography

**Manrope** for headlines — humanist and slightly distinctive, so titles feel
like a product rather than a template. **Inter** for everything functional —
proven legibility at small sizes on low-density screens.

| Token | Font | Size | Use |
|---|---|---|---|
| `headline-xl` | Manrope Bold | 28 | Screen titles |
| `headline-lg` | Manrope Bold | 24 | Section headings |
| `headline-md` | Manrope SemiBold | 20 | Card titles |
| `body-md` | Inter Regular | 16 | Body copy, descriptions |
| `label-md` | Inter SemiBold | 14 | Buttons, field labels |
| `label-sm` | Inter Medium | 12 | Captions, badges, helper text |

Never ship type below **12sp**. Never use Manrope for body copy or Inter for
screen titles.

## Spacing, radius, layout

- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32 / 48**. Nothing off-scale.
- Radius: **4** (small square controls ≤24px — checkbox, radio-sized boxes),
  **12** (inputs, buttons, chips), **24** (cards), **full** (pills, avatars).
  `full` is scoped to pills and avatars only: on a 20px control it clamps to a
  circle and a required-consent checkbox then reads as a radio button. `12`
  clamps the same way at that size, which is why `radius/4` exists.
- Mobile frame width: **393px** — the canonical viewport for all screen designs.
- Screen gutter: **16px**, applied consistently. Body sections must share the
  same left/right inset as the app bar above them.

### Elevation — cards do NOT cast a drop shadow

**Separation comes from surface tone and a hairline, never from a blur.** A form
or content card is `card-surface` + a 1px `outline-variant` hairline + `radius/24`
+ 24px inset. That is the whole treatment. The `elevation/card` effect style must
carry **no drop shadow**.

This is a correction, not a preference. The card previously shipped
`0px 8px 24px` at 12% opacity, and the product owner rejected it twice — "the box
shadows and background color isn't looking nice", then "we still have the shadows
behind the forms making it look ugly". Three reasons it was wrong:

1. **It was redundant.** The card already separates three other ways — white on a
   tinted `#F5FAF8` page, a full-strength hairline, and its inset. A fourth
   signal reads as haze, not lift.
2. **It only existed in one mode.** Dark mode emits no shadow at all (`shadow`
   collapses to black over a near-black page), so a light-only shadow made the
   two modes structurally different treatments pretending to be one.
3. **24px of blur is a dated signature.** Material 3 gives cards *tonal*
   elevation; filled and outlined cards carry no shadow.

If a surface genuinely must float above content — a bottom sheet, a menu, a
dialog, a toast — that is a **different role** from a card, and it may use a tight
`0 1px 2px` / `0 2px 6px` pair at ≤8%, tinted with the `shadow` token, never grey.
Do not reach for it on a card.

See also `docs/MOBILE_UX.md` for supporting mobile guidance (subordinate to this
document).

## App shell

The shell is fixed across the app. Screens own their content, not their chrome.

**Top app bar** — logo on the **left**; avatar + notifications grouped on the
**right**. The avatar and the notification button are both 40×40 with a ≥44pt
touch target. The unread badge overlaps the bell's top-right corner with a white
separation ring. Do not centre the logo, and do not add extra actions (an SOS
button, a search icon) to the bar — those belong in the scrollable body.

**Bottom navigation** — five tabs, identical on every screen that has it:
**Home · Overview · Inbox · Community · Lifestyle**
(implemented in `src/features/home/components/BottomNav.tsx`). Never rename,
reorder, or add tabs on a single screen. Detail screens don't get the bottom nav
— they get a back button in the app bar instead.

**Avatars** always need a real fallback (photo → initials → person silhouette).
An empty coloured circle reads as a broken image, not as a placeholder.

### There are TWO shells — patient and practitioner

Everything above describes the **patient** shell. Practitioners are a distinct
audience and get their own, which must **never** reuse the patient tab set.

**Practitioner top app bar** — back on the left, logo **centred**, notifications
on the right. Back is always available: where there is no history to pop (a deep
link, which is the normal entry for the partner web hand-back), the screen must
pass a fallback destination rather than render no back button.
Figma `Practitioner AppBar` 656:850 (variants `Back=Shown | Hidden`) ·
code `src/components/shell/PractitionerAppBar.tsx`.

**Practitioner bottom navigation** — five tabs:
**Home · Schedule · Inbox · Patients · Profile**
Figma `Practitioner BottomNav` 381:628 ·
code `src/components/shell/PractitionerBottomNav.tsx`.

The Appointments tab is **labelled "Schedule"**. Two reasons, and the second is
the one that matters: "Appointments" measured 81px at `label-sm` 12 in a 75px tab
and truncated to "Appointmen…" on device — and since type may not go under 12sp
and a target may not go under 44pt, the copy had to change, not the metrics. It is
also the right word: clinician-facing software calls a clinician's own day their
*schedule*. The patient shell keeps "Appointments" — same concept, different
audience, different word.

Note the deliberate mismatch: the Figma variant property is still
`Active=Appointments` and the code tab `key` is still `"appointments"`. Those are
APIs — renaming the property detaches every instance. Only the visible copy is
"Schedule". Do not "fix" this into agreement.

### Horizontal strips and carousels

Nothing is half-sliced in the resting state. Either every item fits the content
width, or the strip scrolls with a *deliberate* partial peek (roughly a third to a
half of the next item — never a hairline sliver, never a near-complete item that
reads as whole) plus a trailing inset matching the leading gutter.

Prefer fitting. For a five-item icon strip in a 345px column, `5T + 4×8 = 345`
gives a 62.6 tile and a 56px icon plate (24 glyph + 2×16). A 64px plate cannot
fit — `5×64 + 4×8 = 352`. Abbreviate a label that overflows its tile ("Labs", not
"Lab Results") rather than letting one tile wrap taller than its neighbours; never
shrink type below 12 to make something fit.

## Iconography

**[Health Icons](https://healthicons.org)** (MIT / public domain) is the
project's icon set for anything clinical or domain-specific. It was built for
global health programmes — it has real glyphs for blood pressure, pulse
oximetry, lab samples, blister packs, community health workers, PPE — which is
exactly our vocabulary, and it doesn't carry the generic look of the icon packs
every other product uses.

**Everything goes through `<Icon />`** (`src/components/ui/icons/Icon.tsx`).
Screens must never import an icon library directly:

```tsx
import { Icon } from "@/components/ui";

<Icon name="blood-pressure" label="Blood pressure" />  // clinical / domain
<Icon chrome="arrow-back" label="Back" />              // UI chrome only
```

- **Registry:** `src/components/ui/icons/registry.ts` is the only file that
  imports SVGs. Names are semantic (`medication`, `lab-sample`, `heart-rate`),
  not pictorial, so a glyph can be swapped without touching call sites. Add new
  entries there — verify the path exists under
  `node_modules/healthicons/public/icons/svg/outline/` first.
- **Chrome caveat (known gap):** Health Icons ships **no UI chrome** — there is
  no chevron, bell, share, or sun/moon in the set. Chrome therefore falls back to
  MaterialIcons via the `chrome` prop, i.e. the Android platform set, rather than
  inventing a third style. `Icon.tsx` is the single place to change if the
  project later adopts a dedicated chrome set.
- **Sizing:** 24px default, 20px in dense rows. Outline weight throughout;
  use `filled` only for an active/selected state.
- **Colour:** icons take a resolved token value, defaulting to `on-surface` for
  the current mode. RN has no `currentColor` inheritance, so an icon on an
  accent surface must be passed its `on-*` pair explicitly.
- **Semantics:** the glyph must match its label. A heart under "Community" or a
  person under "Lifestyle" is a bug, not a style choice.
- **Accessibility:** pass `label` for meaningful icons; omit it for decorative
  ones and they're hidden from assistive tech automatically.
- **No emojis, ever** — not in the UI, not in copy, not as a stand-in for a
  missing glyph. If a concept has no icon, add one to the registry.

Build wiring: `metro.config.js` moves `svg` from `assetExts` to `sourceExts` and
uses `react-native-svg-transformer`; `svg.d.ts` types the imports; Jest maps
`.svg` to `src/test/svg-mock.tsx` since it doesn't run Metro's transformer.

## Voice

Plain, direct, second person. "Your blood pressure looks steady this week", not
"Patient exhibits stable hypertensive indicators". Never diagnose — MedApp is
infrastructure around clinicians, not a replacement for them (see PROJECT.md's
out-of-scope list). Avoid alarm language for routine data.
