# components/ui/

Presentation primitives — no business logic, no data fetching. Import from the
barrel: `import { Button, Card, Input, Badge } from "@/components/ui";`

All classes/colours map to the `tailwind.config.js` tokens (which mirror
`stitch_medapp_premium_healthcare_ui/clinical_vitality/DESIGN.md`). When a Stitch
screen shows a pattern already covered here, use the primitive instead of
re-pasting the class string.

| Primitive | Purpose | Key props |
|---|---|---|
| `Button` | Filled CTA + secondary/outline/ghost variants | `label`, `variant`, `size`, `pill`, `fullWidth`, `loading`, `leadingIcon`, `trailingIcon` |
| `Card` | Form/content surface: `card-surface` + `outline-variant` hairline + radius 24 + 24px inset, and **no drop shadow** (`docs/BRAND.md` § Elevation) | `flat` (deprecated no-op — a card never casts a shadow), `className` |
| `Input` | Bordered text field w/ optional leading icon + trailing slot | `icon?` (chrome), `leading?` (slot, for a clinical `<Icon name>`), `hasError`, `trailing`, …`TextInput` props |
| `Badge` | Uppercase status/role chip | `label`, `tone`, `icon` |

Booking flow (Figma page 144:107). Eight components the frames instance; each
replaces a private copy that had already drifted across 2+ screens.

| Primitive | Purpose | Key props |
|---|---|---|
| `PractitionerSummaryRow` | "Who you are booking with" (780:5363). Wraps the real `Card`; avatar goes through `AvatarWithFallback`, so a bare CDN `<Image>` cannot come back | `name`, `specialty`, `avatarUri`, `surface` (`card`\|`bare`), `rating`, `tags`, `verified` |
| `DockedActionBar` | Bottom-pinned commit bar (781:2291), incl. the trust line. Claims its own bottom inset — its screen passes `claimsBottomInset={false}` | `primary`, `secondary` (⇒ Pair), `footnote` |
| `SectionHeader` | 44-tall section heading, **outside** its card (756:4413). Replaces an 11px uppercase caption drawn inside it | `title`, `icon`, `action` |
| `IconTile` | Tinted square leading a detail row (756:4255 / 756:5246). One fill: `primary-tint` + `primary` glyph | `icon`, `size` (40\|32), `label` |
| `KeyValueRow` | One labelled fact. Trailing badge **XOR** action, enforced by the type | `label`, `value`, `secondaryValue`, `badge`, `action` |
| `InfoCallout` | Tinted note qualifying the content above it (756:4361). `tone="error"` is the in-product alternative to a native `Alert` | `children`, `icon`, `tone` (`info`\|`error`) |
| `SuccessMedallion` | 96px confirmation mark (756:4753). No shadow | `label` |
| `DatePill` | One day in the date strip (756:4424). **Three** lines — the month is real data | `day`, `date`, `month`, `selected`, `unavailable`, `onPress` |

Async states (Figma Design System page 26:84). Approved and never coded, so a
dozen screens hand-rolled one each — `docs/PIPELINE.md` §5.

| Primitive | Purpose | Key props |
|---|---|---|
| `EmptyState` | The one empty state (517:1773). An empty list and an empty search result are different COPY, same anatomy | `container` (`card`\|`inline`), `title`, `body?`, `icon?`, `action?` |
| `ErrorPanel` | The one error state (517:2111) | `container`, `title`, `body` (**mandatory**), `icon?`, and **exactly one of** `retry` \| `unrecoverable` |
| `SkeletonCard` | Loading placeholder (517:2291) | `shape` (**required**, no default), `count?` |

Three rules in this set are structural rather than conventional:

- **`ErrorPanel`'s `retry` returns `Promise<unknown>`**, so it must hand back the
  promise of the request it re-issues (`() => query.refetch()`). This app shipped
  two "Try again" buttons that flipped a local enum and refetched nothing; a
  required `onRetry: () => void` makes the *button* mandatory and does nothing
  about the *refetch*. `() => void q.refetch()` and `() => setState(x)` are both
  type errors, and a cast past the type throws in `__DEV__`.
- **A failure with nothing to retry must NAME its reason** — `unrecoverable` is a
  closed union (`no-identifier` | `not-found` | `forbidden` | `section-unavailable`),
  not a boolean, so `grep unrecoverable` lists every dead end in the app.
  `section-unavailable` is the per-section isolation case: one section failed and
  the rest of the page is live, so a retry there would compete with valid content.
- **`SkeletonCard`'s height is keyed to `shape` and cannot be passed in**, and
  there is no `style` prop. `docs/PIPELINE.md`:106 — a skeleton must reserve the
  EXACT layout of what it replaces or it causes the shift it exists to prevent.
  222:333 shipped 118px against `VitalStatCard`'s real 127. Each shape is measured
  to a real component; if that component's height changes, `SKELETON_HEIGHTS` and
  the Figma variant change with it, and the test re-checks the arithmetic.

`Container=Inline` on the first two exists so a section can report its own state
without drawing a card inside a card. Reach for it whenever the panel sits inside
an existing `Card`.

Two states in this set are deliberately **not colour-only** (`docs/BRAND.md`
§Colour rules): `ChoiceChip unavailable` and `DatePill unavailable` both draw a
**dashed** hairline at full strength, drop their *content* to 38%, refuse the
press, and announce "unavailable". They are identical on purpose — one
affordance, learned once. Do not simplify either to a tint.

`Button variant="primary"` is the exact CTA repeated across Splash / SignIn /
SignUp. `Input` was promoted verbatim from the `InputWithIcon` local that was
copy-pasted into two auth screens — its API is unchanged, so those screens can
drop the local copy and import this instead.

Still raw `View`/`Text`/`Pressable` in screens today (extract once a pattern
repeats in 2+ screens, per the house rule): glass `TopAppBar`, glass `BottomBar`
(a stub `BottomNav` lives in `features/home/components/`), `ChatBubble`,
`StatCard`, and a `Checkbox`.
