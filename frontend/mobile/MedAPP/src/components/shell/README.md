# components/shell/

App-shell chrome — the bars a screen does **not** own. Import from the barrel:

```tsx
import { DetailShell, PatientShell, PractitionerShell } from "@/components/shell";
```

Kept separate from `components/ui/` (presentation primitives) and
`components/layout/` (padding/safe-area wrappers) because these components carry
**navigation** and an audience: they know the tab set and push routes.

## Three shells, never interchangeable

| Shell               | Audience        | App bar              | Bottom nav                                    | Tabs                                            |
| ------------------- | --------------- | -------------------- | --------------------------------------------- | ----------------------------------------------- |
| `PatientShell`      | patient         | `PatientAppBar`      | `BottomNav` (`src/features/home/components/`) | Home · Overview · Inbox · Community · Lifestyle |
| `PractitionerShell` | practitioner    | `PractitionerAppBar` | `PractitionerBottomNav` (this dir)            | Home · Schedule · Inbox · Patients · Profile    |
| `DetailShell`       | either (pushed) | `DetailAppBar`       | **none, and not as a prop**                   | —                                               |

Picking between them is one question: **is this screen a tab root?** If yes, the
audience decides which of the first two. If no, it is `DetailShell` — docs/BRAND.md
§App shell: _"Detail screens don't get the bottom nav — they get a back button in
the app bar instead."_

The split is the designer's explicit intent, quoted in the Figma component
description for 381:628: the practitioner set is _"deliberately NOT the patient
tab set … practitioners are a distinct audience."_

The two app bars are **mirror images**, and that is the design, not drift:

|        | patient         | practitioner |
| ------ | --------------- | ------------ |
| left   | [back] + logo   | back         |
| centre | —               | logo         |
| right  | avatar + bell   | bell         |

docs/BRAND.md §App shell is explicit for the patient bar — _"logo on the left;
avatar + notifications grouped on the right … Do not centre the logo"_ — and
Figma 741:887 agrees. Do not add a third action (SOS, search) to either bar; per
BRAND those belong in the scrollable body.

**Back is now available on BOTH bars, and they stay distinguishable.** The patient
bar's `Back=Shown` variant SHIFTS the logo right (x 16 → 68) rather than centring
it, so a centred logo remains the practitioner shell's signature even when both
bars show a chevron. Two differences from `PractitionerAppBar`, both forced by the
patient logo being left-aligned:

- `hideBack` **defaults to `true`** here (`false` on the practitioner bar). Every
  existing patient caller is a tab root and `router.canGoBack()` is true on most
  of them, so the other default would have grown a back button on all of them.
- **No 44×44 spacer when back is hidden.** The practitioner bar renders one to
  keep its centred logo still; here a spacer is the thing that would MOVE the
  logo. Figma matches: in `Back=Hidden` the BackButton is `visible = false` and
  auto-layout excludes it. `PatientAppBar.test.tsx` locks this.

## Components

| Component               | Figma                   | Notes                                                                                                                                                                                             |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PatientAppBar`         | component set `741:887` (`Back=Hidden\|Shown`, default Hidden) | `LeadingGroup` (optional back 44×44, 8px gap, `<Logo />` h 42) + `RightGroup` (avatar 40 in a 44 target, 12px gap, bell 44×44) with unread badge. `AvatarWithFallback`, so photo → initials → silhouette. No fill on the bell, no shadow. |
| `PatientShell`          | `741:887` + `740:1015`  | `PatientAppBar` → `flex-1` body → `BottomNav`; owns `StatusBar` and the top/left/right safe area. `showBottomNav={false}` + `hideBack={false}` for detail/transactional screens — the two halves of BRAND's one sentence. Forwards every bar and nav prop. |
| `AccountMenu`           | component set `949:10651` (`View=Menu\|Confirm sign out`), page `945:5796`; **code not yet reconciled — nine required changes in docs/PIPELINE.md §5** | What the patient avatar opens: identity row, **Profile** → `/(app)/patient-profile-overview`, **Appearance** (`<AppearanceSelector />`), **Sign out**. Anchored under `PatientAppBar` (`PATIENT_APP_BAR_HEIGHT` + 4), right-aligned to the bar's `px-4`. `PatientShell` mounts it by DEFAULT; screens don't. |
| `PractitionerAppBar`    | component set `656:850` (`Back=Shown\|Hidden`) | back (44×44) + centred `<Logo />` + bell (44×44) with unread badge. No `theme` prop — the Figma Theme variant only swaps the logo raster, which `<Logo variant="auto" />` already does.           |
| `PractitionerBottomNav` | component set `381:628` | five tabs, `flex-1` each (≈75×48), Health Icons glyph + `label-sm`; active `primary`, inactive `on-surface-variant`. Adds the bottom safe-area inset the 393×1283 Figma canvas can't express.     |
| `PractitionerShell`     | frame `72:117` layout   | composes both around a `flex-1` body; owns `StatusBar` and the top/left/right safe area.                                                                                                          |
| `DetailShell`           | `193:120`               | `DetailAppBar` → `flex-1` body. **No bottom nav and no prop for one.** Owns `StatusBar` and, by default, all four safe-area edges. Forwards every `DetailAppBar` prop by rest-spread. |

The patient bottom nav stays at `src/features/home/components/BottomNav.tsx`
because 12 screens already import it from there; `PatientTab` is re-exported from
this barrel so a screen can type `activeTab` without reaching into the features
tree. Moving the file is a separate, mechanical change.

### The avatar is a real control now (`AccountMenu`)

`PatientAppBar` has always had `onAvatarPress`, `PatientShell` has always
forwarded it, and **no screen ever passed it** — so the avatar was a dead 44pt
target on all 12 patient screens. Three things had no entry point as a result:
`useAuthStore.signOut()` (implemented, called from nowhere — there was **no way
to sign out of the app**), `/(app)/patient-profile-overview` (built, verified
against frame `261:387`, linked from nothing), and `<AppearanceSelector />` (the
three-way light/dark/system preference, referenced only by its own barrel).

The default lives in the **shell**, not in the screens, for the same reason
`PATIENT_TAB_HREFS` does: five tab roots render this bar, and the last time this
kind of behaviour was left to each screen, three of them silently dropped the
Inbox tab. A screen may still pass `onAvatarPress` to override; when it does, the
menu is not mounted and `avatarExpanded` stays `undefined`, so the bar does not
announce a disclosure that isn't there.

Sign out is guarded **twice**, deliberately: it is the last row, below a hairline,
after the whole Appearance block, and the only `error`-toned item (that answers
"I meant to open my profile"), *and* it takes a confirmation (that answers "I did
tap it" — `signOut()` calls `secureStorage.clearAll()`, so the recovery is
re-authenticating, not an undo). The confirmation is a **state of the same
`<Modal>`**, not a second one: stacked RN modals on Android are unreliable.

After confirming, `AccountMenu` navigates **itself** — `router.replace(
"/(public)/sign-in")` — then clears the session. `(app)/_layout`'s
`<Redirect>` would also catch it, but only after a frame of authenticated UI has
painted. The guard is a backstop, not the mechanism.

### Layout contract for `PatientShell`

`BottomNav` is `absolute bottom-0` and therefore reserves **no** layout space —
every current caller clears it with its own
`contentContainerStyle={{ paddingBottom: 140 }}`. `PatientShell` preserves that
deliberately: making the bar participate in layout would silently double the
padding on twelve screens. A migrating screen keeps its bottom padding and only
deletes its inline top bar.

### Layout contract for `DetailShell`

Built because it was the missing third shell: 16 screens render `DetailAppBar` and
every one of them hand-rolls the wrapper around it. Measured across those 16
before the migration:

| Thing         | What the 16 screens did                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `StatusBar`   | **11** hardcode `style="dark"`, 2 pass `"auto"`, 1 renders none, 2 resolve the scheme |
| `edges`       | **10** pass `["top","left","right"]`, 6 pass all four                                 |
| bottom nav    | **4** render `<BottomNav>` under a detail bar, which BRAND forbids outright           |

Four decisions, each of which the tests lock:

- **Status bar** — resolved from `useResolvedScheme()`, the same one line the other
  two shells use. Not a prop: `style="dark"` on eleven screens is the drift being
  removed and a prop lets it back in one screen at a time. `"auto"` is not
  equivalent either — it follows the OS, while this app's scheme is a user
  preference (`src/lib/theme.ts`) that can be light on a dark-mode phone.
- **Safe-area edges** — default `["top","left","right","bottom"]`, unlike the other
  two shells. They omit `bottom` because a bottom nav is sitting in that inset and
  claims it itself; this shell has no bottom nav, so nothing else claims it and
  content would run under the gesture bar. Pass `claimsBottomInset={false}` when
  the screen pins something to the bottom edge and handles the inset itself. The
  screens that force that override: `SelectTimeSlotScreen` (docked action bar with
  its own `<SafeAreaView edges={["bottom"]}>`), `ChatThreadScreen` and
  `AiAssistantScreen` (composer under a `KeyboardAvoidingView`), and
  `PractitionerTelehealthProfileScreen` (sticky CTA at `absolute bottom`). It is a
  boolean rather than an `edges` array because an array escape hatch is exactly how
  the 10-vs-6 split happened.
- **Keyboard** — the shell adds **no** `KeyboardAvoidingView`; the two composer
  screens keep their own. The KAV has to sit *below* the app bar and wrap the
  scroll area plus the composer, so a shell-level one would lift the bar off the
  top of the screen when the keyboard opens. It is also 2 screens of 16, and those
  2 already configure it differently (`ChatThreadScreen` passes
  `keyboardVerticalOffset={0}`, `AiAssistantScreen` passes none). The `flex-1` body
  takes a `KeyboardAvoidingView` as its direct child, which is the shape both
  screens already have.
- **Prop forwarding** — the props interface `extends Omit<DetailAppBarProps,
  "testID">` and the bar receives the rest object, so forwarding is enforced by the
  type instead of a hand-kept list. That shape was chosen because the hand-kept
  list is what failed before (see `onTabPress` below). `appBarTestID` is separate
  so the shell's own `testID` can land on the root, like the other two shells.

```tsx
import { Pressable, ScrollView, Text } from "react-native";
import { DetailShell } from "@/components/shell";
import { Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

export function MedicationDetailsScreen() {
  // 193:120 binds both bar glyphs to color/primary; never a hex.
  const primary = useTokenColor("primary");

  return (
    <DetailShell
      title="Medication Details"
      // `onBack` is optional — omitted, the bar calls router.back() itself.
      actions={
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={handleShare}>
          <Icon chrome="share" size={24} color={primary} />
        </Pressable>
      }
    >
      <ScrollView
        className="flex-1"
        // Keep whatever padding the screen already had. Do not "clean it up":
        // it may be clearing the screen's own pinned footer.
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text>…</Text>
      </ScrollView>
    </DetailShell>
  );
}
```

A screen with a pinned footer or composer adds one prop and keeps its own footer:

```tsx
<DetailShell title="Dr. Ama Boateng" subtitle="Online" claimsBottomInset={false}>
  <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
    {/* messages + composer, unchanged */}
  </KeyboardAvoidingView>
</DetailShell>
```

Migrating a screen means deleting its `<SafeAreaView>`, its `<StatusBar>`, its
hand-rolled bar and — on the four that have one — its `<BottomNav>`, plus the now
unused imports. Everything inside the body, including scroll padding, stays.

## Tokens

Every colour in both shells resolves by token name — no literals, including
white (docs/BRAND.md §Colour rules). Values in JS go through
`useTokenColor()` / `tokenColor()` in `src/lib/tokens.ts`; everything expressible
as a class is a class, so NativeWind flips it with the theme.

| Where                              | Token                            |
| ---------------------------------- | -------------------------------- |
| both bar fills, bottom-nav fill    | `surface`                        |
| bottom-nav hairline                | `outline-variant` @ 20%          |
| patient bell glyph                 | `primary`                        |
| practitioner bell glyph            | `on-surface`                     |
| badge fill / numeral / ring        | `error` / `on-error` / `surface` |
| bottom nav, active glyph + label   | `primary`                        |
| bottom nav, inactive glyph + label | `on-surface-variant`             |
| avatar fallback tint + foreground  | `primary` @ 12% / `primary`      |

## Elevation

**No shell casts a shadow.** Figma 741:887, 740:1015, 656:850 and 381:628 all
carry no effects, and docs/BRAND.md §Elevation is explicit that separation comes
from surface tone and a hairline. The patient bottom nav previously shipped
`shadowColor: "#475569"` — a grey blur matching no token and no frame, visible in
light mode only. It was **deleted**, not tokenised, and
`PatientBottomNav.test.tsx` asserts against the source that it stays gone.

## Route coverage (flagged)

`src/app/(app)/` has no practitioner home, patients roster, or practitioner
self-profile. Those three tabs render (the shell is fixed app-wide) but no-op and
announce _"Not available yet"_ to assistive tech instead of pushing an invented
path or a patient screen. `Appointments` and `Inbox` are wired to the real
`/(app)/appointments` and `/(app)/inbox`; `AppointmentManagementScreen` is
currently authored patient-side and needs a practitioner variant.

Neither bell has a destination — there is no notifications screen — and
`unreadCount` is prop-driven with no data source, so the badge is absent until a
notifications store exists. A mock display _name_ is harmless; a mock unread
count is a false statement to the user. See the prop docs.

The patient `BottomNav` has no `href` table at all: routing is the caller's, via
`onTabPress`. `PatientShell` passes it straight through.

## Both bottom navs now share one treatment

`Patient BottomTabBar` **101:143** was rebuilt to match `Practitioner BottomNav`
**381:628** on the product owner's instruction ("make patient bottomtabbar same
as the design for practionar bottomnav ... and remember figma is the source of
truth"). Both are now, in Figma and in code:

- bar 393×64, `surface` fill, 8px padding, tabs space-between, `clipsContent = false`
- tab item **75×48**, vertical, 4px gap, **no fill and no backing plate**
- icon **24×24**, then the label at `label-sm` 12
- active: icon **and** label on `primary`; inactive: both on `on-surface-variant`

Three things this resolved, recorded because each was previously an open flag here:

1. The patient tab icons were **12×12** in Figma against the practitioner nav's 24.
   Now 24 in both. The old 12px vectors were replaced with real geometry imported
   at 24, not scaled up — scaling vector paths distorts them.
2. Every patient `TabItem` carried a 20×20 `Icon Backing` ellipse whose *inactive*
   fill was `outline-variant` — five grey discs behind five glyphs, a token-role
   misuse and the "empty coloured circle reads as a broken image" pattern. All five
   ellipses are deleted.
3. The code had shipped an active `primary-container` **pill** with an
   `on-primary-container` glyph, disclosed at the time as a deliberate deviation
   because Figma bound the active tab to `primary`/`on-primary`. The owner ruled
   Figma wins, and the practitioner bar has no pill, so the pill is gone.

The patient tab SET is unchanged — Home · Overview · Inbox · Community · Lifestyle.
Only the treatment was aligned.

`101:143` is **no longer a single COMPONENT** — the note that used to sit here
said variantising it "should be its own task with 'all six instances still
resolve, undetached' as the exit criterion". That task has since run: the bar is
component set **`740:1015`** with `Active=Home | Overview | Inbox | Community |
Lifestyle`, `Active=Home` is the default and is still node `101:143`, and all 12
live instances re-resolved with zero detachments.

The CODE was never the thing that was behind here: `BottomNav` has always taken
an `active` prop and rendered the selected tab on `primary`. Figma has now caught
up, so a frame can finally show which tab it is on instead of every frame
rendering an identical bar with a layer name that claims otherwise.

## Deviations from docs/BRAND.md §App shell

BRAND.md now documents both shells. The approved **practitioner** components
still contradict its patient-shell prose in three places; Figma wins on visuals:

1. the logo is **centred**, not left ("Do not centre the logo");
2. there is **no avatar** in the bar ("avatar + notifications grouped on the right");
3. the screen has a back button **and** the bottom nav ("Detail screens don't get
   the bottom nav — they get a back button instead"). The AppBar's Figma
   description states back is _"always available"_, so this pairing is deliberate.

## Adoption

**Both migrations are done.** No screen in `src/features/` hand-rolls a patient
app bar, and no screen that renders `DetailAppBar` hand-rolls a
`SafeAreaView` + `StatusBar` wrapper around it. The four detail screens that
carried a `<BottomNav>` — `PractitionerSocialProfile`,
`PractitionerTelehealthProfile`, `ActiveScriptShare`, `ActiveScriptView` — no
longer do; BRAND forbids it, and the back button in the bar is the way out.

`DetailShell` claims the bottom inset by default. Four screens turn that off
because something of their own is pinned to the bottom edge and must own it:

| Screen                                             | Why `claimsBottomInset={false}`      |
| -------------------------------------------------- | ------------------------------------ |
| `booking/SelectTimeSlotScreen`                       | docked action bar takes the inset    |
| `chat/ChatThreadScreen`                              | composer sits flush to the keyboard  |
| `chat/AiAssistantScreen`                             | composer sits flush to the keyboard  |
| `practitioner/PractitionerTelehealthProfileScreen`   | floating CTA adds its own inset      |

Every other detail screen takes the default. If you are adding one, take the
default too — reach for the override only when a real pinned element would
otherwise sit a safe-area's height above where it belongs.

`ActivePatientRoster2Screen` uses **both** shells deliberately: `PractitionerShell`
for its tab-root states, `DetailShell` for the review-saved state. Its file
header explains the split.
