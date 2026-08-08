// Find Care screen — translated from the Stitch "MedApp Directory" HTML.
//
// Reached from HomeScreen's Quick Services → "Find Care" tile, NOT from the
// bottom tab bar (the tab bar is the 5-slot set from the Home dump; Find
// Care is a stack-pushed screen).
//
// ============================================================================
// SHELL MIGRATION (2026-07-30) — inline app bar gone
// ============================================================================
// Approved frame: **144:108 "find_care_enhanced_directory_updated_nav"**. Its
// first child is an instance of "Patient AppBar (Avatar + Logo + Bell)"
// (144:109 → 101:142) and it also instances "Patient BottomTabBar" (145:320 →
// 101:143) — but see the RE-MIGRATION below: that frame is now known to be
// wrong, and the PO has ruled against it.
//
// Removed with the bar: the back Pressable, the `<Logo variant="wordmark"
// height={22} />`, the bell Pressable, their two literal `color="#00685f"`
// glyph values, and the now-orphaned `appBarShadow` Platform.select constant
// (deleted, not tokenised — the bar was its only user, component 101:142
// carries no effects at all, and docs/BRAND.md §Elevation: "Separation comes
// from surface tone and a hairline, never from a blur").
//
// ============================================================================
// RE-MIGRATION (2026-08-05) — tab-root chrome OUT, DetailShell IN
// ============================================================================
// Reported from the device, verbatim: "the logo is off and it has the bottom nav
// with Home tab active... is a bit confusing." Both halves were confirmed in the
// capture, and this screen is the third to take the ruling already made for
// `appointment_management` (docs/PIPELINE.md §5, PO 2026-08-01):
//
//   Find Care is NOT one of the five patient tabs, so a tab bar here can only
//   render a LIE — Home selected while the user is demonstrably not on Home.
//   `Patient BottomTabBar` 740:1015 ships exactly five values and has no way to
//   fake a sixth, and that absence is deliberate, not an omission.
//
// The logo was the same fault seen from the other side. `Detail AppBar 193:120`'s
// own description: *"No logo — the logo belongs only on tab-root screens."*
//
//   was   inline bar (back + logo + bell) + BottomNav
//   then  <PatientShell activeTab="home" isTabRoot={false}> — the frame's chrome
//   now   <DetailShell title="Find Care">, per docs/BRAND.md §App shell:
//         "Detail screens don't get the bottom nav — they get a back button in
//         the app bar instead."
//
// This SUPERSEDES the FLAG that stood here from 2026-07-30, which recorded that
// frame 144:108 dropped this screen's top-left back affordance and called it a
// designer decision because the frame carried deliberate 44x44 tap targets for
// the avatar and bell. The flag was right that the frame said so and right to
// escalate rather than absorb it. The ruling went the other way: the frame is
// wrong about the chrome, and `Patient AppBar (Back + …)` was never the answer —
// `Detail AppBar 193:120` already existed and is what a pushed screen takes.
// Figma is the source of truth for the DESIGN; 144:108's body content still is.
// **The frame's two chrome instances need deleting — logged in §5, not done here,
// because the file is claimed by a running design round.**
//
// What the trade costs and buys:
//   - GAINED a real way out. Every exit was previously a tab, i.e. somewhere
//     unrelated to where the user came from. Both inbound paths push
//     (HomeScreen's Find Care tile, Appointments' "Book new"), so `router.back()`
//     — DetailAppBar's default — is always correct, and it no-ops rather than
//     throwing on a cold deep link.
//   - GAINED the top-left back affordance docs/MOBILE_UX.md §Platform conventions
//     requires and the old flag recorded as missing.
//   - LOST the five-tab jump-off. Intended: a detail screen returns to where it
//     was pushed from, and both entry points are themselves tab roots.
//   - LOST the avatar, and with it the account menu on THIS screen. It is on all
//     five tab roots (PatientShell mounts `AccountMenu` by default), which is
//     where a session control belongs; a detail bar carrying one is how the
//     avatar ended up on a screen with no identity of its own to show.
//   - The 28px body `<Text>Find Care</Text>` is GONE — the bar carries the screen
//     name now, and two identical headings stacked is a stutter for a screen
//     reader as much as for the eye.
//
// Translation rules (same as SignInScreen / HomeScreen):
//   - hover:*, group-hover:*, focus:ring → dropped (RN has no hover).
//   - overflow-x-auto hide-scrollbar → horizontal ScrollView with hidden
//     indicator.
//   - shadow-[0px_4px_20px_rgba(...)] → DROPPED. See the ELEVATION note below.
//   - The Stitch dump duplicates chips (Hospitals/Pharmacies appear in
//     both rows, and there's both "Pharmacies" and "Pharmacist"). We
//     de-dupe: main row is the entity type, sub-row is filter facets.
//   - Status indicators (online dot, away dot) → absolutely-positioned
//     small Views.
//   - This is a static UI cut. Backend wiring to /v1/doctors, /v1/nurses,
//     /v1/hospitals, /v1/pharmacies is a follow-up once the gateway
//     surfaces them with the directory shape.
//
// (The note that used to sit here — "the BottomNav is kept visible with
// `active='home'` because a pushed screen keeps its parent tab highlighted" — is
// what the RE-MIGRATION above overturns. That convention holds when the screen
// genuinely belongs to a tab's stack; Find Care belongs to no tab, so there was
// no parent to highlight.)
//
// ============================================================================
// ELEVATION SWEEP (2026-07-31) — every shadow on this screen is gone
// ============================================================================
// This screen was the one the product owner was looking at: its provider cards
// floated on a soft grey haze (`shadowColor: "#475569"`, a literal matching no
// token) while the migrated Patient Dashboard's cards sat flat with a hairline,
// so the same product showed two elevation languages side by side.
//
// docs/BRAND.md §Elevation is binding: "A CARD casts NO shadow. Separation is
// surface tone + a 1px `outline-variant` hairline + `radius/24`." Six shadow
// applications were classified here and all six were deleted, none retokenised:
//
//   PersonCard root          card  → deleted, now the shared <Card />
//   FacilityCard root        card  → deleted, now the shared <Card />
//   FacilityCard icon plate  tile  → deleted (a 64px icon plate is not a sheet)
//   FacilityCard CTA         button inside a card → deleted
//   EmptyState root          panel → deleted, now the shared <Card />
//   ErrorPanel root          panel → deleted, now the shared <Card />
//   SkeletonCard root        card  → deleted, now the shared <Card />
//
// Nothing on this screen floats: there is no sheet, menu, dialog, toast or FAB,
// so nothing qualified for BRAND's sanctioned `0 1px 2px` / `0 2px 6px` pair.
// The `cardShadow` constant and the `buttonShadow()` helper were deleted with
// their last callers rather than left orphaned.
//
// Adopting <Card /> also upgrades the hairline from `outline-variant/30` to full
// strength and the radius from 12 to BRAND's `radius/24` — with the blur gone
// the hairline and the fill step ARE the separation, and a 30% hairline against
// a near-equal background is exactly the "card with no edge" failure BRAND warns
// about. The fill moves from the fixed `surface-container-lowest` to the
// `card-surface` ROLE, which is what makes the card lift rather than recede in
// dark mode.
//
// ============================================================================
// FUNNEL WIRING (2026-08-02) — this screen is the middle of the booking flow
// ============================================================================
// The route audit found the new-booking funnel dead end to end. This screen is
// its second step:
//
//   Home -> Find Care tile -> find-care -> provider card -> "View Profile"
//        -> practitioner-telehealth-profile -> "Book appointment"
//        -> select-time-slot -> review-appointment -> booking-confirmed
//
// Two things changed here for that:
//   1. The `MaterialIcons` import is gone. Five call sites now go through the
//      shared `<Icon />`, which is the only file allowed to touch an icon
//      library (src/components/ui/icons/Icon.tsx header, docs/BRAND.md
//      §Iconography). The five glyphs are all CHROME names, so they take
//      `chrome=` rather than a Health Icons `name=`.
//   2. Provider cards decide what to do PER KIND rather than routing the whole
//      `DirectoryEntry` union at one destination. See the block above
//      `PersonCard`, and the FLAG inside `FacilityCard`'s CTA.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding anything
// expo-* here.

import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import {
  AvatarWithFallback,
  Card,
  ChoiceChip,
  ChoiceChipRow,
  Icon,
  SearchField,
} from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, useTokenColor } from "@/lib/tokens";
import { useDebouncedValue } from "@/features/care/hooks/use-debounced-value";
import { useDirectory, type DirectoryChip } from "@/features/care/hooks/use-directory";
import type { FacilityEntry, IconName, PersonEntry } from "@/features/care/types";

// Main chip taxonomy — de-duped from the Stitch dump. The `value` is
// what the filter state uses; the label is what the user sees. Typed
// against DirectoryChip so a typo here would be a compile error, not
// a silently-empty directory at runtime.
const MAIN_CHIPS: { value: DirectoryChip; label: string; icon?: IconName }[] = [
  { value: "all", label: "All" },
  { value: "doctors", label: "Doctors", icon: "person" },
  { value: "nurses", label: "Nurses", icon: "medical-services" },
  { value: "hospitals", label: "Hospitals", icon: "local-hospital" },
  { value: "pharmacies", label: "Pharmacies", icon: "local-pharmacy" },
  { value: "pharmacists", label: "Pharmacists", icon: "medication" },
];

// ===========================================================================
// Sub-row facets — ONE survives, and the other two were worse than dead.
// ===========================================================================
// `filteredEntries` below matches a facet label against the concatenated BADGE
// text of each entry. "Home Service" works because `adaptNurse` emits exactly
// that badge for a nurse with a `home_visit_fee_cents`. The other two matched
// nothing any adapter has ever emitted:
//
//   "Available Now"  no presence data exists anywhere in this system, and the
//                    field that stood in for it (`availability: "online"`) was a
//                    hardcoded constant, not a badge — see features/care/api.ts.
//   "Nearest"        a sort, not a filter, and there is no distance to sort by:
//                    only `/v1/nurses` takes lat/lng at all and no adapter
//                    returns a distance.
//
// So selecting either emptied the directory to zero rows and rendered
// `EmptyState hasActiveFilters` — "No matches / Try a different filter" — which
// blames the user's choice for a filter that could never match. A control that
// silently deletes the whole directory and then implies you asked for it is a
// worse defect than a button that does nothing. Both are removed rather than
// disabled; they come back with a presence signal and a distance field
// respectively. Logged in docs/api/README.md's gap register.
const SUB_FACETS: string[] = ["Home Service"];

/**
 * This screen's scroll gutter and BRAND's screen gutter.
 *
 * At 360dp — the width the defect below was found at, not the 393dp the frames
 * are drawn at — this is what the two chip rows have to fit inside:
 *
 *   content column = 360 - 2x16 = **328dp**
 */
const GUTTER = 16;

// ---------------------------------------------------------------------------
// Directory data comes from useDirectory() now — the old MOCK_DIRECTORY
// array was deleted in the real-data wiring pass. Types live in
// ./types.ts and are re-exported by the hook for convenience.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function FindCareScreen() {
  // `useCurrentUser()` is gone with the avatar (see the RE-MIGRATION note): a
  // detail bar has no avatar slot, so the hook had no consumer left. `initialsFor`
  // stays — the provider CARDS use it for their own photo fallback chain.
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<DirectoryChip>("all");
  const [activeFacets, setActiveFacets] = useState<Set<string>>(new Set());

  // 250ms feels instant to the user but gives a typist time to land on
  // a word before we burn a network call. The backend `?q=` filter
  // does the heavy lifting; the screen only does facet filtering on
  // the returned slice.
  const debouncedQuery = useDebouncedValue(query, 250);

  const { entries, isLoading, error, refetch } = useDirectory(activeChip, debouncedQuery);

  const toggleFacet = (label: string) => {
    setActiveFacets((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Server already filtered by chip + ?q=. The screen only narrows by
  // facet here — facets are derived from badges (e.g. "Home Service")
  // and we don't yet have a clean server contract for those. AND-ing
  // multiple facets keeps the behaviour consistent with the old
  // pipeline.
  const filteredEntries = useMemo(() => {
    if (activeFacets.size === 0) return entries;
    const facets = Array.from(activeFacets).map((f) => f.toLowerCase());
    return entries.filter((entry) => {
      const badgeText = entry.badges.map((b) => b.label.toLowerCase()).join(" | ");
      return facets.every((f) => badgeText.includes(f));
    });
  }, [entries, activeFacets]);

  const hasActiveFilters = activeChip !== "all" || activeFacets.size > 0 || query.trim().length > 0;

  const clearFilters = () => {
    setActiveChip("all");
    setActiveFacets(new Set());
    setQuery("");
  };

  return (
    /* DetailShell owns the safe area, the StatusBar and the bar (Figma 193:120).
       See the RE-MIGRATION note at the top of the file for why this is not
       PatientShell any more.

       `claimsBottomInset` is left at its default. Nothing is pinned to the bottom
       edge here — the two chip rows wrap and the list scrolls — so the shell
       claims the inset and the last provider card cannot run under the gesture
       bar. That inset is also why `paddingBottom` drops from 140 (below).

       No `onBack`: both entry points push (HomeScreen's Find Care tile,
       Appointments' "Book new"), so DetailAppBar's default `router.back()` is
       right, and it no-ops rather than throwing on a cold deep link. */
    <DetailShell title="Find Care">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: 16,
          // 32, not the 140 this screen carried. The 140 was sized to clear the
          // bottom nav; the nav is gone and the shell now adds the bottom inset on
          // top, so keeping it would leave ~170px of dead space under the last
          // card. 32 matches AppointmentManagement and the three booking screens.
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* No body heading: the bar carries "Find Care" now. The 28px
            `<Text>Find Care</Text>` that was here would announce
            "Find Care, heading. Find Care." */}

        {/* Search bar — the shared SearchField (Figma 396:538), a composition
            over the canonical Input. Deletes the worst of the five private
            search rows: a `cardShadow` on a field (docs/BRAND.md §Elevation
            forbids it outright — a field is not a sheet/menu/dialog/toast/FAB),
            height emergent from `paddingVertical: 14` instead of the frame's 52,
            `bg-surface-container-lowest` where 396:538 mandates the recessed
            `color/field-surface`, no focus or error border, and `#6d7a77` frozen
            into the glyph/placeholder/clear-glyph plus `#171d1c` into the TYPED
            VALUE — so in dark mode the user typed near-black on a dark field.

            The clear affordance was also a 24x24 target (`h-6 w-6`); 396:535 is
            named "clear-button (44x44)" and docs/MOBILE_UX.md forbids shipping a
            target under 44pt. */}
        {/* `mt-md` dropped with the heading it used to sit under — the
            ScrollView's own `paddingTop: 16` is the top inset now, and keeping
            both stacked 16 on 16. */}
        <View>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="Search doctors, nurses, departments…"
            accessibilityLabel="Search the care directory"
          />
        </View>

        {/* Main chips — the shared ChoiceChip (Figma 11:104). `role="radio"`
            because the entity type is one-of-N.

            This row and the facet row below it were the clearest case in the
            whole codebase for the extraction: `MainChip` and `FacetChip` sat in
            ADJACENT rows of ONE screen, shared no code, differed by 8pt in
            height (both under the 44pt floor), used different radii, and each
            re-implemented the selected-state affordance so the two could diverge
            again independently. Between them they passed four frozen light-mode
            literals straight into an icon colour — `#ffffff`, `#3d4947`,
            `#00685f`, `#6d7a77` — which is the exact bug class that made the
            patient BottomNav render identically in dark mode. `MainChip` was
            also `rounded-full`, which BRAND scopes to pills and avatars, not
            chips (11:104 is `radius/12`), and drew its glyph at 18, off BRAND's
            24/20 ramp.

            The check glyph is kept (ChoiceChip defaults `showSelectedCheck` on),
            so selection is still not colour-only — the reason this screen had
            added it in the first place.

            ====================================================================
            360dp DEVICE FIX (2026-08-03) — this row WRAPS; it no longer scrolls
            ====================================================================
            On an Itel S25 Ultra at 360dp this row shipped as a full-bleed
            horizontal scroller and cut the fourth chip through its LABEL: the
            row read `All  Doctors  Nurses  Ho`, with "Hospitals" sliced
            mid-word and Pharmacies/Pharmacists entirely off-screen behind no
            affordance at all. docs/BRAND.md §"Horizontal strips and carousels"
            forbids exactly that — "Nothing is half-sliced in the resting
            state" — and its remedy order is explicit: "Prefer fitting."

            Measured on device (Inter SemiBold 14, 16px inset each side, 1px
            border, 20px glyph + 4px gap, +24 for the selected check):

              All (selected)  70    Hospitals    109
              Doctors        101    Pharmacies   123
              Nurses          95    Pharmacists  127

            Six chips + five 8px gaps = 665 + 40 = 705dp of content for a 328dp
            column. Fitting the row on one line is arithmetically impossible at
            360 — 328 does not even hold three of the six — and BRAND's other
            two escapes both fail here as well:

              * A DELIBERATE PEEK cannot be engineered. A peek has to land
                between a third and a half of the next item, and a hug chip's
                width is its label's width, so where the right edge falls is
                whatever `activeChip` and the OS font scale happen to make it.
                Today it lands two letters into "Hospitals".
              * SHORTENING A LABEL buys nothing. Even stripping every glyph and
                every plural, the six labels still measure past 328.

            So the row wraps, which is `ChoiceChipRow`'s DEFAULT mode and the
            one that degrades gracefully — it re-flows at any width and any font
            scale instead of clipping. Packing at 328dp with the 8px row gap:

              line 1  70 + 8 + 101 + 8 + 95            = 282   (+109 -> 399 X)
              line 2  109 + 8 + 123                    = 240   (+127 -> 375 X)
              line 3  127
              height  3x44 + 2x8                       = 148dp

            That costs 104dp against the 44dp scroller it replaces, and it buys
            all six categories legible at rest rather than three and a fragment.
            On a directory screen that is the right trade, but it IS a trade and
            it is the reason this comment states the numbers.

            The full-bleed `marginHorizontal: -GUTTER` goes with the scroller: a
            wrapping row adds no padding of its own and simply sits inside the
            screen's 16px gutter, which is where BRAND wants body sections
            anyway ("Body sections must share the same left/right inset as the
            app bar above them"). */}
        <View style={{ marginTop: 16 }}>
          {/* testID is the seam FindCareScreen.layout.test.tsx asserts on — a
              wrapping row is a View with no `horizontal`, a scroller is a
              ScrollView with `horizontal` set, so the decision above is locked
              against being quietly reverted. */}
          <ChoiceChipRow testID="find-care-type-chips">
            {MAIN_CHIPS.map((c) => (
              <ChoiceChip
                key={c.value}
                label={c.label}
                icon={c.icon}
                role="radio"
                selected={activeChip === c.value}
                onPress={() => setActiveChip(c.value)}
              />
            ))}
          </ChoiceChipRow>
        </View>

        {/* Sub-row facets — one chip, and the row is a row of what works.

            "Home Service" is the shared ChoiceChip, `role` left at the default
            "filter" (a `button` with a selected state) rather than "radio",
            because it is a toggle and would still be one if a second real facet
            joined it. It filters on the provider BADGES
            (`badgeText.includes(f)`), and `features/care/api.ts` emits that
            badge as the literal "Home Service" — so the label is not free to
            rename without desynchronising the chip from the badge it matches.

            WHAT LEFT THIS ROW, and why the 360dp wrap arithmetic that used to
            live in this comment is moot: "Available Now" and "Nearest" are gone
            (see SUB_FACETS — both matched a badge no adapter emits, so either
            one silently emptied the directory into "No matches"), and
            "Specialty" is gone with them. That last one was a `PickerTrigger`
            with a chevron promising a menu and an empty `onPress`: there is no
            specialty list to open, because `/v1/doctors/specialties` does not
            exist. A chevron is a promise about what a tap does, and this one had
            nothing behind it. The trigger COMPONENT is deleted too rather than
            left orphaned — it had exactly one caller, and a stranded primitive
            is how the control gets wired back to nothing. All three return with
            the data behind them; logged in docs/api/README.md's gap register.

            One chip fits any width, so nothing here can clip. The row stays a
            wrapping `ChoiceChipRow` rather than becoming a bare View: that is
            the seam FindCareScreen.layout.test.tsx asserts on, and a second
            facet must land in a row that already re-flows. */}
        <View style={{ marginTop: 8 }}>
          <ChoiceChipRow testID="find-care-facet-chips">
            {SUB_FACETS.map((f) => (
              <ChoiceChip
                key={f}
                label={f}
                selected={activeFacets.has(f)}
                onPress={() => toggleFacet(f)}
              />
            ))}
          </ChoiceChipRow>
        </View>

        {/* Directory grid — single column on mobile. The HTML uses
              md:grid-cols-2 / lg:grid-cols-3; phones get one column for
              readability. The wrapping bg-surface-container-low panel
              from the HTML is dropped — on mobile the rhythm reads
              better without the outer tint.

              State machine:
                - error (and no cached entries)  → ErrorPanel + Retry
                - isLoading (and no entries yet) → 3 skeleton cards
                - entries.length === 0            → EmptyState
                - default                         → list
              The "and no entries" guards mean a refetch on an
              already-loaded list keeps the old data on screen instead
              of flashing back to skeletons. */}
        <View className="mt-md gap-md">
          {error && filteredEntries.length === 0 ? (
            <ErrorPanel onRetry={refetch} />
          ) : isLoading && filteredEntries.length === 0 ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredEntries.length === 0 ? (
            <EmptyState hasActiveFilters={hasActiveFilters} onClear={clearFilters} />
          ) : (
            filteredEntries.map((entry) =>
              entry.kind === "person" ? (
                <PersonCard key={entry.id} entry={entry} />
              ) : (
                <FacilityCard key={entry.id} entry={entry} />
              ),
            )
          )}
        </View>
      </ScrollView>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

// Badge tints. Every entry is a token pair — a container step and its `on-*`
// content — so the pair flips together. `bg-*/10` + the accent text is the same
// treatment the shared <Badge /> uses for its tinted tones.
//
// FLAGGED (`warn`): the palette has no amber/caution ramp. `warn` is mapped to
// the `error` ramp, which is the nearest honest role — it is a "pay attention"
// tint, one step stronger than the copy intends. Tailwind's `orange-100` /
// `orange-700` are NOT tokens and have no dark value at all, so keeping them was
// not an option. The branch is currently unreachable (no adapter in
// `features/care/api.ts` emits `tone: "warn"`), so nothing regresses today, but
// a real `warning` / `on-warning-container` pair belongs in BRAND before this
// tone is used.
const PERSON_BADGE_STYLES: Record<
  PersonEntry["badges"][number]["tone"],
  { bg: string; fg: string }
> = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  secondary: { bg: "bg-secondary-container", fg: "text-on-secondary-container" },
  tertiary: { bg: "bg-tertiary/10", fg: "text-tertiary" },
  warn: { bg: "bg-error/10", fg: "text-error" },
};

// ===========================================================================
// THE PRESENCE DOT IS DELETED, and `AVAILABILITY_DOT` with it.
// ===========================================================================
// A green dot in the corner of every provider's avatar, wrapped in
// `accessibilityLabel="<name> is online"`. It was driven by
// `entry.availability`, which every adapter in features/care/api.ts set to the
// literal `"online"` — so the app told a patient that a specific, named
// clinician was available right now, about every clinician in the directory,
// always, sourced from a constant. The `busy` and `away` branches were
// unreachable by construction, which is the tell: a status indicator with one
// reachable state is not indicating anything.
//
// Nothing in this system has presence data — no service, no column, no field on
// any of the five list responses. So the dot is removed rather than recoloured
// or greyed: a neutral "unknown" dot would still assert that presence is a thing
// this app tracks. See the deleted `AvailabilityTone` in ./types.ts; the whole
// treatment comes back together when a signal exists.

// Two-letter fallback for AvatarWithFallback when avatarUri is missing/broken
// — "Dr. Sarah Chen" -> "SC". Falls back to the silhouette glyph if there's
// nothing usable (e.g. a single-word name).
function initialsFor(name: string): string | null {
  const words = name
    .replace(/^Dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// What a directory entry's tap DOES — decided per kind, not blanket-routed.
//
// `useDirectory` returns a `DirectoryEntry` union spanning five backend
// collections, and they are not interchangeable destinations:
//
//   doctors      BOOKABLE. `practitioner-telehealth-profile` with a live "Book
//                appointment" dock. This is the funnel:
//                find-care -> profile -> select-time-slot -> review -> confirmed.
//
//   nurses       NOT bookable, and this is a backend fact rather than a taste
//   pharmacists  call: `booking_service`'s BookingCreate takes `doctor_id`
//                (backend/services/booking_service/app/schemas/booking.py, and
//                ReviewAppointmentScreen forwards `practitionerId` straight into
//                it). Pushing a nurse_id or a pharmacist_id through that field
//                does not 404 — it writes a booking row pointing at a provider
//                who is not a doctor, which is worse than a dead link. They get
//                the SAME profile screen, with `providerKind` set, so the screen
//                renders the identity and withholds the booking dock instead of
//                offering a CTA whose only outcome is a wrong record.
//
//   hospitals    Facilities, and NOT people. `hospital-detail` and
//   pharmacies   `pharmacy-detail` respectively — see `openFacility` below,
//                which replaced the "deliberately not wired" FLAG on 2026-08-06
//                when both screens shipped.
//
// `providerKind` is the entry's `category` verbatim. This screen deliberately
// does NOT re-implement the bookability predicate: it forwards the category and
// the profile screen — the one that renders the CTA — owns the single decision
// (`BOOKABLE_KINDS` in PractitionerTelehealthProfileScreen.tsx). Two copies of
// that rule is how the directory ends up promising a booking the next screen
// withholds.

function PersonCard({ entry }: { entry: PersonEntry }) {
  // The Home Service badge glyph sits inside the `tertiary` badge tint, so it
  // takes `tertiary` — the same token its sibling label already uses. It is the
  // only glyph here that cannot be a class (Icon takes a colour string); the
  // `on-primary` one went with the message button below.
  const tertiary = useTokenColor("tertiary");
  return (
    <Card>
      <View className="flex-row gap-sm">
        {/* No `relative` wrapper any more — it existed only to position the
            presence dot. The avatar is the whole of this column now. */}
        {/* AvatarWithFallback replaces the raw <Image> (brief §5, §7) — guards a
            broken/empty avatarUri with an initials/silhouette fallback instead
            of a blank box. `avatarUri` is `""` for a clinician with no photo,
            which is exactly the case this chain is for; the adapter used to hand
            it a stock photograph of a stranger instead. */}
        <AvatarWithFallback
          uri={entry.avatarUri || null}
          initials={initialsFor(entry.name)}
          label={entry.name}
          size={64}
          className="rounded-xl"
          style={{ borderRadius: 12 }}
        />
        <View className="flex-1 justify-center">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            {entry.name}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">{entry.title}</Text>
        </View>
      </View>

      <View className="mt-sm flex-row flex-wrap gap-xs">
        {entry.badges.map((b, i) => {
          const s = PERSON_BADGE_STYLES[b.tone];
          // Tertiary tone gets the home icon when the label says
          // "Home Service" — matches the Stitch dump.
          const isHomeService = b.tone === "tertiary" && b.label === "Home Service";
          return (
            <View
              key={`${entry.id}-badge-${i}`}
              className={`flex-row items-center gap-xs rounded-full px-sm py-xs ${s.bg}`}
            >
              {isHomeService ? <Icon chrome="home" size={14} color={tertiary} /> : null}
              <Text className={`font-label-sm text-label-sm ${s.fg}`}>{b.label}</Text>
            </View>
          );
        })}
      </View>

      <View className="mt-sm flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${entry.name}'s profile`}
          accessibilityHint="Opens their profile"
          className="flex-1 items-center justify-center rounded-lg border border-primary py-sm active:opacity-80"
          // 44pt floor via style, not an arbitrary class: a `min-h-[44px]` that
          // fails to compile takes the WHOLE className with it (see the CTA note
          // in FacilityCard).
          style={{ minHeight: 44 }}
          onPress={() =>
            // Every param the destination needs to IDENTIFY this practitioner —
            // and `providerKind`, which is what stops it offering a Book CTA for
            // a provider `booking_service` cannot take a booking for. Without
            // these the profile falls back to DEFAULT_PROVIDER and the user
            // reads a different clinician's name than the card they tapped.
            router.push({
              pathname: "/(app)/practitioner-telehealth-profile",
              params: {
                id: entry.id,
                providerId: entry.id,
                providerName: entry.name,
                providerSpecialty: entry.title,
                providerAvatar: entry.avatarUri,
                providerKind: entry.category,
                // The fee, carried into the funnel so screen 2 can show a price
                // before the patient commits. Numbers do not survive a route
                // param, so it travels as its own string and exactly one place
                // (the review screen) divides by 100. Omitted when the record
                // has no fee — `undefined` here is dropped by expo-router, and
                // "no fee recorded" is not "free".
                ...(entry.consultationFeeCents !== null &&
                entry.consultationFeeCents !== undefined
                  ? { providerFeeCents: String(entry.consultationFeeCents) }
                  : null),
              },
            } as unknown as Href)
          }
        >
          <Text className="font-label-md text-label-md text-primary">View Profile</Text>
        </Pressable>
        {/* THE MESSAGE BUTTON IS DELETED. A filled primary square with a
            chat-bubble glyph and `onPress={() => {}}` under a "Message <name>"
            label — the loudest control on the card, and the only one that did
            nothing. It is also not a small wiring job: `inbox_service` threads
            are keyed on a user id and a directory entry carries a doctor /
            nurse / pharmacist PROFILE id, which is a different identifier with
            no resolution path from here. Removed rather than disabled, because a
            greyed control on every card reads as a temporary outage rather than
            a feature that does not exist. Logged in docs/api/README.md's gap
            register; "View Profile" now takes the row's full width, which is the
            action that works. */}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What a FACILITY's tap does — one destination per kind, resolved here.
//
// RESOLVED 2026-08-06. This replaces the FLAG that stood inside FacilityCard's
// CTA from 2026-08-02, which recorded that facilities were deliberately NOT
// routed: `src/app/(app)/` had no facility screen, and the two nearest
// candidates were both practitioner profiles, so any push would have put a
// building's name over a person's page — in one case above a "Book appointment"
// CTA. A no-op was the honest answer while that was true. Both screens now
// exist, designed (Figma page 1019:640 "Facilities"), so it no longer is.
//
// HOSPITALS AND PHARMACIES GO TO DIFFERENT SCREENS, and that is the same
// discipline the person-card block above states, not an exception to it. It is
// not laziness about a shared "facility" page: the two records overlap on name,
// address and phone and on nothing else. A hospital has accreditation, a care
// team roster and patient reviews; a pharmacy has a seven-day opening-hours
// table, a licence number, a live stock counter and a pharmacist list. They are
// also two different services with two different column sets — `contact_phone`
// on one, `phone` on the other. One screen with two thirds of itself switched
// off is not a shared screen, it is two screens sharing a bug surface.
//
// The param name is the one the destination reads, and it carries `entry.id`,
// which `adaptHospital` / `adaptPharmacy` set from `hospital_id` / `id` — i.e.
// the wire id the single-resource GET wants. NOT the slug, and not the name.
//
// `pharmacists` and the two person categories never reach here: they are
// `PersonEntry`, rendered by PersonCard. The `default` branch is unreachable
// today and is a compile-time exhaustiveness guard rather than a runtime one —
// if `DirectoryCategory` grows a sixth facility kind, this is where it has to
// be answered.

function openFacility(entry: FacilityEntry): void {
  const pathname =
    entry.category === "hospitals" ? "/(app)/hospital-detail" : "/(app)/pharmacy-detail";
  const params =
    entry.category === "hospitals" ? { hospitalId: entry.id } : { pharmacyId: entry.id };
  // Cast because expo-router's typed routes only regenerate on dev-server
  // start, so a route added in this pass is not in the generated union yet —
  // the same cast, for the same reason, as the PersonCard push above.
  router.push({ pathname, params } as unknown as Href);
}

function FacilityCard({ entry }: { entry: FacilityEntry }) {
  const { scheme } = useResolvedScheme();
  const iconBg = entry.iconTint === "tertiary" ? "bg-tertiary-container" : "bg-secondary-container";
  // The glyph sits ON the plate's container fill, so it takes that container's
  // own `on-*` pair. The literals it replaces were the LIGHT values of exactly
  // that pairing (`#fefcff` is `on-tertiary-container`; `#3a485b` was
  // `on-secondary-fixed-variant`, a near-neighbour of `on-secondary-container`
  // picked by eye) — so light is a no-op and dark stops drawing a near-white
  // glyph on #004395 and a near-black one on #3A485B.
  const iconColor = tokenColor(
    entry.iconTint === "tertiary" ? "on-tertiary-container" : "on-secondary-container",
    scheme,
  );
  const ctaPressed = blendTokens("tertiary", "on-tertiary", 0.12, scheme);
  const ctaIdle = tokenColor("tertiary", scheme);
  const ctaLabel = tokenColor("on-tertiary", scheme);

  return (
    <Card>
      <View className="flex-row items-center gap-sm">
        {/* Icon plate — classified as a TILE, so the `cardShadow` it carried is
            deleted outright. Its own container tint is the separation. */}
        <View className={`h-16 w-16 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon chrome={entry.icon} size={32} color={iconColor} />
        </View>
        <View className="flex-1 justify-center">
          <Text className="font-headline-md text-on-surface" style={{ fontSize: 18 }}>
            {entry.name}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            {entry.subtitle}
          </Text>
        </View>
      </View>

      <View className="mt-sm flex-row flex-wrap gap-xs">
        {entry.badges.map((b, i) =>
          b.tone === "open" ? (
            <View
              key={`${entry.id}-badge-${i}`}
              // "Open now" is a SUCCESS state, so it takes the success ramp's
              // container/on-container pair rather than Tailwind's green-100 /
              // green-700, which have no dark step. The dot is `success` itself
              // — an accent on its own container, legible in both modes.
              className="flex-row items-center gap-xs rounded-full bg-success-container px-sm py-xs"
            >
              <View className="h-2 w-2 rounded-full bg-success" />
              <Text className="font-label-sm text-label-sm text-on-success-container">
                {b.label}
              </Text>
            </View>
          ) : (
            <View
              key={`${entry.id}-badge-${i}`}
              className="rounded-full bg-tertiary-fixed px-sm py-xs"
            >
              <Text className="font-label-sm text-label-sm text-on-tertiary-fixed-variant">
                {b.label}
              </Text>
            </View>
          ),
        )}
      </View>

      {/* CTA — fully inline-styled.
          Its `buttonShadow(...)` is deleted: this is an action button INSIDE a
          card, not a floating surface, so BRAND's sheet / menu / dialog / toast
          / FAB exemption does not reach it.

          The two off-token palettes the previous pass flagged are now resolved.
          `facilityCtaPalette` is gone: it returned `#0058be`/`#004395` for
          `color: "tertiary"` and `#2563eb`/`#1d4ed8` for `color: "info"`, all
          four frozen light-mode values, under a `#ffffff` label. Both collapse
          to the `tertiary` ramp — `#0058be` IS light `tertiary`, and "info" maps
          to `tertiary` everywhere else in the system (see <Badge />'s TONE
          table). FLAGGED: blue-600 (`#2563eb`) is a Stitch value with no token
          and no BRAND entry, so the pharmacy CTA and the hospital CTA are now
          the same blue. That is a visible (small) change and a design call to
          confirm — the alternative was leaving a hex that cannot flip.
          Pressed is M3's state layer (`on-tertiary` over `tertiary` at 12%),
          the same derivation the shared <Button /> uses, so it moves the right
          direction in both modes instead of needing a hand-picked dark value.
          FLAGGED for a later pass: this should still become the shared
          <Button />.
          We're deliberately not using NativeWind classes here: when one
          arbitrary value (e.g. `active:scale-[0.98]`) fails to compile,
          NativeWind silently drops the entire className string for that
          element, leaving it with no width / no padding / no rounded
          corners, and the button collapses to a near-invisible sliver.
          Pure inline styles render identically on iOS / Android / web
          and can't be tripped up by class-name parsing. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.cta.label} — ${entry.name}`}
        style={({ pressed }) => [
          {
            marginTop: 12,
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            paddingHorizontal: 24,
            paddingVertical: 12,
            backgroundColor: pressed ? ctaPressed : ctaIdle,
          },
        ]}
        onPress={() => openFacility(entry)}
      >
        <Text
          style={{
            color: ctaLabel,
            fontFamily: "Inter",
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.14,
          }}
        >
          {entry.cta.label}
        </Text>
      </Pressable>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasActiveFilters,
  onClear,
}: {
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  const { scheme } = useResolvedScheme();
  // Muted glyph on the neutral `surface-container-low` plate. `#6d7a77` was
  // light `outline` — a HAIRLINE token; BRAND scopes `outline` to dividers and
  // borders, and a 26px glyph is content, so it takes `on-surface-variant`.
  const glyph = tokenColor("on-surface-variant", scheme);
  // Outline button: the border and the label are one piece and must share a
  // token. Pressed is the 8% `primary` state layer, expressed with the alpha
  // form of the SAME token rather than a second literal rgba().
  const primary = tokenColor("primary", scheme);
  const primaryPressed = tokenColor("primary", scheme, 0.08);
  return (
    // The taller `py-lg` inset goes through `style` rather than a class:
    // Card's own `p-md` is in its base className and `cn` has no tailwind-merge,
    // so a `py-lg` class would be a coin-flip. The inline value always wins.
    <Card className="items-center" style={{ paddingVertical: 48 }}>
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-low">
        <Icon chrome={hasActiveFilters ? "filter-list-off" : "search-off"} size={26} color={glyph} />
      </View>
      <Text className="mt-sm font-headline-md text-on-surface" style={{ fontSize: 18 }}>
        {hasActiveFilters ? "No matches" : "Nothing here yet"}
      </Text>
      <Text className="mt-xs text-center font-body-md text-body-md text-on-surface-variant">
        {hasActiveFilters
          ? "Try a different filter or clear them all to see everyone available."
          : "We couldn't find anyone in this directory right now. Check back soon."}
      </Text>
      {hasActiveFilters ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          onPress={onClear}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingHorizontal: 24,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: primary,
            backgroundColor: pressed ? primaryPressed : "transparent",
          })}
        >
          <Text
            style={{
              color: primary,
              fontFamily: "Inter",
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Clear filters
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton + error states
// ---------------------------------------------------------------------------

// A static skeleton card. No shimmer animation — first-paint
// perceived latency on a SDK 55 / RN 0.76 device is already ~250ms
// and the React Query 60s staleTime means most navigations show
// cached data anyway. If the skeleton ends up visible for >1s in
// practice, layer a Reanimated opacity loop on top.
function SkeletonCard() {
  return (
    <Card
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="flex-row gap-sm">
        <View className="h-16 w-16 rounded-xl bg-surface-container-low" />
        <View className="flex-1 justify-center gap-xs">
          <View className="h-4 w-2/3 rounded bg-surface-container-low" />
          <View className="h-3 w-1/2 rounded bg-surface-container-low" />
        </View>
      </View>
      <View className="mt-sm flex-row gap-xs">
        <View className="h-5 w-20 rounded-full bg-surface-container-low" />
        <View className="h-5 w-16 rounded-full bg-surface-container-low" />
      </View>
    </Card>
  );
}

// Shown when useDirectory returns an error AND we have no cached
// entries to fall back to. The retry button calls refetch() which
// React Query handles — no manual state to reset.
function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  const { scheme } = useResolvedScheme();
  // Same reasoning as EmptyState's glyph.
  const glyph = tokenColor("on-surface-variant", scheme);
  // Filled primary button. `#00685f`/`#005049` were light `primary` and light
  // `on-primary-fixed-variant` — a hand-picked "darker teal" that has no
  // meaning in dark mode, where `primary` is already light. Pressed is now M3's
  // state layer, matching the shared <Button />.
  const fill = tokenColor("primary", scheme);
  const fillPressed = blendTokens("primary", "on-primary", 0.12, scheme);
  const onFill = tokenColor("on-primary", scheme);
  return (
    <Card className="items-center" style={{ paddingVertical: 48 }}>
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-low">
        <Icon chrome="cloud-off" size={26} color={glyph} />
      </View>
      <Text className="mt-sm font-headline-md text-on-surface" style={{ fontSize: 18 }}>
        Unable to load directory
      </Text>
      <Text className="mt-xs text-center font-body-md text-body-md text-on-surface-variant">
        Check your connection and try again. We'll pick up where we left off.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading directory"
        onPress={onRetry}
        style={({ pressed }) => ({
          marginTop: 16,
          paddingHorizontal: 24,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: pressed ? fillPressed : fill,
        })}
      >
        <Text
          style={{
            color: onFill,
            fontFamily: "Inter",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Try again
        </Text>
      </Pressable>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Picker trigger — DELETED, along with the "Specialty" control it existed for.
//
// It was the last survivor of the two local chip components (`MainChip`,
// `FacetChip`), kept as a deliberate anomaly while the design system lacked a
// trigger primitive. That argument is now moot: its one caller is gone, because
// the chevron it drew promised a specialty menu and `/v1/doctors/specialties`
// does not exist, so the tap opened nothing. A component with no caller is not a
// primitive in waiting — it is the thing the next person wires back up to the
// same absent endpoint. It comes back with the endpoint, as part of the same
// job. See the facet-row comment above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shadows — there are none, and there is nothing here to reintroduce them with.
//
// `cardShadow` (six call sites), `buttonShadow()` (one) and, before them,
// `appBarShadow` all lived at the bottom of this file. Every caller is gone —
// the cards are the shared <Card />, which refuses elevation even through
// `style`, and the bar is the shared PatientAppBar (component 101:142 has no
// effects). The constants are deleted rather than left orphaned: a stranded
// `const cardShadow = Platform.select(...)` is how the next person concludes
// the sweep was abandoned halfway and wires it back up.
//
// Nothing on this screen is a sheet, menu, dialog, toast or FAB, so nothing
// here is entitled to BRAND's sanctioned floating pair.
// ---------------------------------------------------------------------------
