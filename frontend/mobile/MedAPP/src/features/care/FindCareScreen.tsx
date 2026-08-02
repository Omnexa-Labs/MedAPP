// Find Care screen — translated from the Stitch "MedApp Directory" HTML.
//
// Reached from HomeScreen's Quick Services → "Find Care" tile, NOT from the
// bottom tab bar (the tab bar is the 5-slot set from the Home dump; Find
// Care is a stack-pushed screen).
//
// ============================================================================
// SHELL MIGRATION (2026-07-30) — inline app bar gone, and READ THE FLAG
// ============================================================================
// Approved frame: **144:108 "find_care_enhanced_directory_updated_nav"**. Its
// first child is an instance of "Patient AppBar (Avatar + Logo + Bell)"
// (144:109 → 101:142) and it also instances "Patient BottomTabBar" (145:320 →
// 101:143), so the chrome is the shared patient shell's, not this screen's.
//
// Removed with the bar: the back Pressable, the `<Logo variant="wordmark"
// height={22} />`, the bell Pressable, their two literal `color="#00685f"`
// glyph values, and the now-orphaned `appBarShadow` Platform.select constant
// (deleted, not tokenised — the bar was its only user, component 101:142
// carries no effects at all, and docs/BRAND.md §Elevation: "Separation comes
// from surface tone and a hairline, never from a blur").
//
// ---------------------------------------------------------------------------
// FLAGGED — the approved frame DROPS this screen's back button
// ---------------------------------------------------------------------------
// The old bar was back + logo + bell with NO avatar. Frame 144:108 is the
// canonical patient bar: logo left, avatar + bell right, **no back slot** — and
// the designer clearly worked it deliberately, since the frame carries explicit
// 44x44 tap-target override children for both the bell (149:148) and the avatar
// (444:881). So this is the approved design, not an omission, and forcing a
// back button back in would mean either displacing the left-hand logo (which
// docs/BRAND.md forbids outright) or inventing a bar variant that does not
// exist.
//
// Find Care is nonetheless a PUSHED screen, so losing the top-left back is a
// real reduction in affordance. It is not a dead end: the bottom nav's "home"
// tab goes to Home (via PatientShell's shared tab map — it used to call
// `router.back()`, which is a different thing and went wherever you came from)
// and Android hardware/gesture back is unaffected. But per docs/MOBILE_UX.md §Platform
// conventions, "back affordance top-left" — this screen no longer has one, and
// that needs a designer call, most likely the same `Patient AppBar (Back + …)`
// variant the eight patient detail screens are already blocked on. Raised, not
// silently absorbed.
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
// The BottomNav is kept visible with `active="home"` — this is a pushed
// screen, so on iOS the parent tab stays highlighted (matches Material 3
// + iOS conventions both).
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
import { PatientShell } from "@/components/shell";
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/features/care/hooks/use-debounced-value";
import { useDirectory, type DirectoryChip } from "@/features/care/hooks/use-directory";
import type {
  AvailabilityTone,
  FacilityEntry,
  IconName,
  PersonEntry,
} from "@/features/care/types";

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

// Sub-row facets. Specialty is a dropdown trigger (no menu yet — that's
// a follow-up once specialties exist in the backend); the rest are
// togglable filter chips.
const SUB_FACETS: string[] = ["Available Now", "Home Service", "Nearest"];

/**
 * This screen's scroll gutter and BRAND's screen gutter. Named so the full-bleed
 * pulls on the two chip rows read as intent rather than bare `-16`s.
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
  // New: the old bar had no avatar, but frame 144:108's does (AvatarWrapper
  // 444:881). `initialsFor` is the same helper the provider cards already use,
  // so the fallback chain is photo → initials → silhouette, per docs/BRAND.md
  // ("Avatars always need a real fallback").
  const user = useCurrentUser();
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
    // Chrome is the shell's. `active="home"` is preserved verbatim: this is a
    // pushed screen, so the parent tab stays highlighted (Material 3 and iOS
    // agree), and its "home" tab still pops rather than pushing.
    <PatientShell
      activeTab="home"
      avatarUri={user?.avatarUrl}
      avatarInitials={user?.displayName ? initialsFor(user.displayName) : null}
      avatarLabel={user?.displayName ?? "Your profile"}
      // `isTabRoot={false}` — this is a PUSHED screen that borrows the Home
      // highlight (see the BottomNav note at the top of the file), so it is not
      // the Home tab and Home must still navigate. Without this the shell would
      // treat the highlighted tab as "already here" and swallow the press.
      //
      // No `onTabPress`: PatientShell owns the tab map now. The switch that was
      // here handled TWO of five — overview, community and lifestyle all did
      // nothing — and sent Home through `router.back()`, which from a screen
      // reachable from more than one place goes wherever you came from rather
      // than Home. See PatientShell.tsx.
      isTabRoot={false}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page title */}
        <Text className="mt-md font-headline-xl text-headline-xl text-on-surface">Find Care</Text>

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
        <View className="mt-md">
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

            `marginHorizontal: -GUTTER` breaks the row out of the 16px scroll
            gutter so the scrollable ChoiceChipRow can apply that gutter as its
            own CONTENT inset, per BRAND §"Horizontal strips and carousels". */}
        <View style={{ marginHorizontal: -GUTTER, marginTop: 16 }}>
          <ChoiceChipRow scrollable>
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

        {/* Sub-row facets. The three TOGGLES are now the shared ChoiceChip —
            multi-select, so `role` stays the default "filter" (a `button` with a
            selected state), not "radio".

            "Specialty" is deliberately NOT a ChoiceChip and is FLAGGED instead
            of forced: its trailing chevron means "opens a picker", so it is a
            PICKER TRIGGER, not a choice. It never holds a selected state and its
            tap opens a menu. Giving ChoiceChip a `trailing` slot to absorb it
            would let any screen hang arbitrary chrome off a chip, which is the
            drift the extraction removed. It needs either a `SelectField`-style
            trigger primitive or a `trailing` property added to 11:104 — a
            design-system decision. Until then it keeps a local component,
            renamed from `FacetChip` to `PickerTrigger` so nobody mistakes it for
            a second chip, and narrowed to the one job it actually does. */}
        <View style={{ marginHorizontal: -GUTTER, marginTop: 8 }}>
          <ChoiceChipRow scrollable>
            <PickerTrigger
              label="Specialty"
              onPress={() => {
                // TODO: open specialty picker. Needs the specialty list
                // from /v1/doctors/specialties (not exposed yet).
              }}
            />
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
    </PatientShell>
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

// Presence dot. Green/red/grey rather than the old Tailwind green-500 /
// red-500 / orange-400, which froze the light-mode values of a palette that
// isn't ours: `success` and `error` both have dark-mode steps tuned to sit on
// #0E1514, and the ring around the dot is `border-card-surface`, which flips.
//
// FLAGGED (`away`): same missing-amber gap as `warn`. `outline` is the honest
// choice — a neutral grey is the conventional "absent" presence colour and it
// stays distinguishable from the other two in both modes. The dot is never the
// only signal: the wrapper carries `accessibilityLabel="<name> is <tone>"`.
// Also currently unreachable — every adapter hardcodes `availability: "online"`.
const AVAILABILITY_DOT: Record<AvailabilityTone, string> = {
  online: "bg-success",
  busy: "bg-error",
  away: "bg-outline",
};

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
//   hospitals    Facilities. FLAGGED, deliberately not wired — see FacilityCard.
//   pharmacies
//
// `providerKind` is the entry's `category` verbatim. This screen deliberately
// does NOT re-implement the bookability predicate: it forwards the category and
// the profile screen — the one that renders the CTA — owns the single decision
// (`BOOKABLE_KINDS` in PractitionerTelehealthProfileScreen.tsx). Two copies of
// that rule is how the directory ends up promising a booking the next screen
// withholds.

function PersonCard({ entry }: { entry: PersonEntry }) {
  // Two glyphs that can't be classes (Icon takes a colour string):
  //  - the Home Service badge glyph sits inside the `tertiary` badge tint, so it
  //    takes `tertiary` — the same token its sibling label already uses;
  //  - the message button's glyph sits ON `bg-primary`, so it takes `on-primary`.
  //    Its old `#ffffff` is on-primary's LIGHT value; in dark mode that put white
  //    on #6BD8CB.
  const tertiary = useTokenColor("tertiary");
  const onPrimary = useTokenColor("on-primary");
  return (
    <Card>
      <View className="flex-row gap-sm">
        <View className="relative">
          {/* AvatarWithFallback replaces the raw <Image> (brief §5, §7) —
              guards a broken/empty avatarUri with an initials/silhouette
              fallback instead of a blank box. */}
          <AvatarWithFallback
            uri={entry.avatarUri}
            initials={initialsFor(entry.name)}
            label={entry.name}
            size={64}
            className="rounded-xl"
            style={{ borderRadius: 12 }}
          />
          <View
            accessibilityLabel={`${entry.name} is ${entry.availability}`}
            // `border-card-surface`, not the old fixed `surface-container-lowest`:
            // the separation ring has to match the CARD's fill, and the card now
            // takes the `card-surface` role, which is a different step in dark mode.
            className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card-surface ${AVAILABILITY_DOT[entry.availability]}`}
          />
        </View>
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
              },
            } as unknown as Href)
          }
        >
          <Text className="font-label-md text-label-md text-primary">View Profile</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message ${entry.name}`}
          className="items-center justify-center rounded-lg bg-primary px-md py-sm active:scale-95"
          onPress={() => {
            // TODO: open chat thread. Wires to /v1/social once exposed.
          }}
        >
          <Icon chrome="chat-bubble" size={20} color={onPrimary} />
        </Pressable>
      </View>
    </Card>
  );
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
        onPress={() => {
          // ------------------------------------------------------------------
          // FLAGGED — facilities are deliberately NOT routed, and specifically
          // not into a practitioner profile.
          //
          // A hospital's "View Staff" and a pharmacy's "View Store" want a
          // FACILITY detail screen. `src/app/(app)/` has no such route: the two
          // nearest candidates are `practitioner-telehealth-profile`, which is a
          // named clinician with a booking dock, and
          // `practitioner-social-profile`, which renders a seeded dietitian and
          // her seeded reviews and does not read params at all. Sending a
          // pharmacy to either one would put a building's name over a person's
          // profile, and in the first case over a "Book appointment" CTA.
          //
          // So this stays a no-op, which is honest, rather than a plausible
          // push, which would not be. What it needs is a designed
          // `hospital-detail` / `pharmacy-detail` frame plus routes — out of
          // scope for the booking funnel, raised rather than absorbed.
          //
          // The one adjacent thing the backend already supports is
          // `careApi.listPharmacists({ pharmacyId })` — i.e. a pharmacy's staff
          // list is one query away once there is a screen to put it on.
          // ------------------------------------------------------------------
        }}
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
// Picker trigger
//
// All that survives of the two local chip components (`MainChip`, `FacetChip`),
// both of which are now the shared ChoiceChip. See the FLAG at the facet row:
// this is a PICKER TRIGGER, not a chip — it holds no selected state and its
// chevron means "opens a menu". It is kept local, and deliberately visible as an
// anomaly, until the design system has a real trigger primitive (or 11:104 gains
// a `trailing` property).
//
// Tokenised on the way past, since the copy it came from is gone: the chevron
// was `#6d7a77` / `#00685f`, both light-mode literals. Height now clears the
// 44pt floor, which `py-xs` did not.
// ---------------------------------------------------------------------------

function PickerTrigger({ label, onPress }: { label: string; onPress: () => void }) {
  const glyph = useTokenColor("on-surface-variant");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens a picker"
      onPress={onPress}
      className="flex-row items-center gap-xs self-start rounded-md border border-outline-variant px-4 py-3 active:scale-[0.98]"
      style={{ minHeight: 44, minWidth: 44 }}
    >
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
      <Icon chrome="arrow-drop-down" size={20} color={glyph} />
    </Pressable>
  );
}

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
