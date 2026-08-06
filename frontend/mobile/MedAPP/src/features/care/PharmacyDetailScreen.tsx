// Pharmacy detail — one pharmacy's record, its week, its live stock and its
// pharmacists.
//
// Figma: `pharmacy_detail` 1022:16476 on page 1019:640 "Facilities"
// (dark proof 1022:17511, no-pharmacists 1022:17278).
//
// The other half of the FLAG quoted in FindCareScreen.tsx: a pharmacy's "View
// Store" was a deliberate no-op because the only routes that existed were
// practitioner profiles. Hospitals and pharmacies go to DIFFERENT screens —
// the per-kind routing discipline that block documents is preserved, not
// collapsed into one generic "facility" page. They share almost no sections:
// a pharmacy has opening hours, a licence and a stock counter; a hospital has
// accreditation, a care team and reviews. One screen with two thirds of it
// switched off is not a shared screen.
//
// ===========================================================================
// WHERE THE DATA COMES FROM — the single-resource GET, and the trap
// ===========================================================================
//   GET /v1/pharmacies/{id}                    careApi.getPharmacy
//   GET /v1/pharmacies/{id}/stock?drug_name=   careApi.checkStock  (on demand)
//   GET /v1/pharmacists?pharmacy_id={id}       careApi.listPharmacists
//
// NOT `listPharmacies`. That route defaults `only_listable=true` while the
// `is_listable` COLUMN defaults to false, so the pharmacy the user just tapped
// can be legitimately missing from every page of the list; and its adapter
// keeps five of twenty columns, dropping every field this screen is made of.
// The detail route also 404s a deactivated pharmacy, which is the answer this
// screen wants — see `features/care/api.ts`.
//
// ===========================================================================
// WHAT THE BACKEND CANNOT SUPPLY, AND SO IS NOT DRAWN
// ===========================================================================
// Refused by name in `docs/PIPELINE.md` §5 and re-verified against
// `pharmacy_service`'s model before this build: "open now" (timezone-unsafe
// without the user's zone — the seven-day table with a Today row is the honest
// version of the same information), delivery, distance in km, ratings, reviews,
// pharmacist ratings, and verified ticks (`is_listable` is a publishing flag,
// not verification). `pms_base_url` and `pms_partner_secret_id` are in the
// response and are not typed by the client at all.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none directly; `@/lib/share` owns the ones it needs.

import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, type Href } from "expo-router";

import { DetailShell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  DockedActionBar,
  Icon,
  IconTile,
  InfoCallout,
  Input,
  KeyValueRow,
  PractitionerSummaryRow,
  SectionHeader,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { shareText } from "@/lib/share";
import type { StockCheck } from "@/features/care/api";
import type { PersonEntry } from "@/features/care/types";
import {
  usePharmacy,
  usePharmacyPharmacists,
  usePharmacyStockCheck,
} from "@/features/care/hooks/use-pharmacy-detail";
import { HoursRow } from "@/features/care/components/HoursRow";
import {
  FacilityEmptyCard,
  FacilityErrorPanel,
} from "@/features/care/components/FacilityStatePanels";
import {
  composeAddress,
  dialPhone,
  openDirections,
  sendEmail,
} from "@/features/care/components/facility-links";

/** Pair variant of the dock is taller than the single. ReviewAppointment uses 168. */
const DOCK_CLEARANCE_PAIR = 168;
const DOCK_CLEARANCE_SINGLE = 112;
const SCROLL_PAD_BOTTOM = 32;
/** 1022:16484 draws the storefront plate at 160 tall. */
const STOREFRONT_HEIGHT = 160;

/**
 * The week, in reading order, with the `Date.getDay()` index each row is
 * "today" for.
 *
 * Monday-first because that is what 1022:16519 draws and what a Ghanaian
 * opening-hours board reads like; `getDay()` is Sunday-first, which is why the
 * two numbers are carried side by side rather than derived from each other.
 *
 * The KEYS are the convention `pharmacy_service` documents on the column
 * (`{"monday": "08:00-22:00", ..., "sunday": "closed"}`) and nothing enforces
 * — the column is plain JSON and the schema is `dict[str, str]`. So lookup is
 * case-insensitive and a missing key is a real, handled case.
 */
const WEEK: { key: string; label: string; jsDay: number }[] = [
  { key: "monday", label: "Monday", jsDay: 1 },
  { key: "tuesday", label: "Tuesday", jsDay: 2 },
  { key: "wednesday", label: "Wednesday", jsDay: 3 },
  { key: "thursday", label: "Thursday", jsDay: 4 },
  { key: "friday", label: "Friday", jsDay: 5 },
  { key: "saturday", label: "Saturday", jsDay: 6 },
  { key: "sunday", label: "Sunday", jsDay: 0 },
];

/**
 * "08:00-22:00" -> "08:00 – 22:00", "closed" -> "Closed", absent -> "Not
 * listed", anything else -> verbatim.
 *
 * The last branch matters: the server validates nothing beyond "string", so
 * "By appointment" or "24 hours" are both possible values, and a parser that
 * only understood two shapes would blank them. Showing the pharmacy's own words
 * is always truthful; guessing is not.
 */
export function formatDayHours(raw: string | undefined): string {
  const v = raw?.trim();
  if (!v) return "Not listed";
  if (/^closed$/i.test(v)) return "Closed";
  const range = v.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
  return range ? `${range[1]} – ${range[2]}` : v;
}

/** Case-insensitive view of the raw hours map, built once per record. */
function normaliseHours(map: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map) return out;
  for (const [k, v] of Object.entries(map)) out[k.trim().toLowerCase()] = v;
  return out;
}

/** "retail dispensing" -> "Retail dispensing". Sentence case, not Title Case:
 *  the values are phrases, and "Controlled Substances" reads as a proper noun. */
function sentenceCase(s: string): string {
  const t = s.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Minor units + an optional ISO code -> "GHS 42.00". */
function formatPrice(cents: number, currency: string | null): string {
  const amount = (cents / 100).toFixed(2);
  return currency ? `${currency} ${amount}` : amount;
}

// ---------------------------------------------------------------------------

export function PharmacyDetailScreen() {
  const raw = useLocalSearchParams<{ pharmacyId?: string | string[] }>();
  // Same normalisation as hospital-detail: a repeated query key arrives as an
  // array and would interpolate into the URL as "a,b".
  const rawId = Array.isArray(raw.pharmacyId) ? raw.pharmacyId[0] : raw.pharmacyId;
  const pharmacyId = rawId?.trim() ? rawId.trim() : undefined;

  const insets = useSafeAreaInsets();
  const pharmacyQuery = usePharmacy(pharmacyId);
  const pharmacy = pharmacyQuery.data;
  const pharmacistsQuery = usePharmacyPharmacists(pharmacyId, !!pharmacy);
  const stock = usePharmacyStockCheck(pharmacyId);

  const [drugName, setDrugName] = useState("");

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/find-care" as Href);
  }, []);

  const address = pharmacy
    ? composeAddress(pharmacy.addressLine1, pharmacy.city, pharmacy.country)
    : null;

  const onShare = useCallback(() => {
    if (!pharmacy) return;
    const lines = [pharmacy.name, address, pharmacy.phone].filter((l): l is string => !!l);
    void shareText(lines.join("\n"), { subject: pharmacy.name, dialogTitle: pharmacy.name });
  }, [pharmacy, address]);

  const hours = useMemo(
    () => normaliseHours(pharmacy?.operatingHours ?? null),
    [pharmacy?.operatingHours],
  );
  const hasHours = Object.keys(hours).length > 0;
  // Resolved once per render from the device clock. There is no server-side
  // "today" and no timezone on the record — which is exactly why "open now" was
  // refused. Highlighting the day is safe where computing open/closed is not:
  // the worst case at a date boundary is that the wrong row is tinted, and the
  // whole week is visible either way.
  const todayJsDay = new Date().getDay();

  const title = pharmacy?.name ?? "Pharmacy";
  const phone = pharmacy?.phone?.trim() || null;
  // 1022:17219 is the PAIR dock, Directions + Call. Each half is conditional on
  // its own nullable column: `phone` and the three address columns are all
  // nullable, and a dock button that cannot do anything is worse than a dock
  // with one button — or no dock at all.
  const canCall = !!phone;
  const canRoute = !!address;
  const dockClearance = canCall && canRoute ? DOCK_CLEARANCE_PAIR : DOCK_CLEARANCE_SINGLE;
  const showDock = canCall || canRoute;

  const shareAction = pharmacy ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Share ${pharmacy.name}`}
      onPress={onShare}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center active:opacity-70"
    >
      <ShareGlyph />
    </Pressable>
  ) : null;

  // ---- States ------------------------------------------------------------

  if (!pharmacyId) {
    return (
      <PharmacyShell title={title} onBack={onBack}>
        <FacilityErrorPanel
          title="We couldn't load this pharmacy"
          body="No pharmacy was selected. Go back to Find Care and choose one."
          testID="pharmacy-detail-error"
        />
      </PharmacyShell>
    );
  }

  if (pharmacyQuery.isPending) {
    return (
      <PharmacyShell title={title} onBack={onBack}>
        <LoadingBody />
      </PharmacyShell>
    );
  }

  if (pharmacyQuery.isError || !pharmacy) {
    const status = (pharmacyQuery.error as { status?: number } | null)?.status;
    return (
      <PharmacyShell title={title} onBack={onBack}>
        <FacilityErrorPanel
          title="We couldn't load this pharmacy"
          body={
            status === 404
              ? "It may no longer be listed. Go back to Find Care and try another."
              : "It may no longer be listed, or the connection dropped."
          }
          onRetry={() => {
            void pharmacyQuery.refetch();
          }}
          testID="pharmacy-detail-error"
        />
      </PharmacyShell>
    );
  }

  // ---- Loaded ------------------------------------------------------------

  const pharmacists = (pharmacistsQuery.data ?? []).filter(
    (e): e is PersonEntry => e.kind === "person",
  );
  const stockStatus = (stock.error as { status?: number } | null)?.status;

  return (
    <DetailShell
      title={title}
      onBack={onBack}
      actions={shareAction}
      claimsBottomInset={!showDock}
      testID="pharmacy-detail"
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: showDock ? dockClearance + insets.bottom : SCROLL_PAD_BOTTOM,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* -- Storefront ---------------------------------------------------- */}
        <Storefront name={pharmacy.name} photoUrl={pharmacy.photoUrl} />

        {/* -- Identity ------------------------------------------------------ */}
        <Card className="gap-4">
          <View>
            <Text className="font-headline-md text-headline-md text-on-surface">
              {pharmacy.name}
            </Text>
            {/* "Pharmacy" is the app's own noun for the collection this record
                came from, the way `getDoctor` applies "Dr." — NOT a claim about
                the kind of pharmacy it is. The frame reads "Community Pharmacy";
                `pharmacy_profiles` has no type or category column, so
                "Community" is dropped rather than invented. */}
            <Text className="font-body-md text-body-md text-on-surface-variant">
              {["Pharmacy", pharmacy.city].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {pharmacy.licenseCategories.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {pharmacy.licenseCategories.map((c) => (
                <Badge key={c} label={sentenceCase(c)} tone="neutral" />
              ))}
            </View>
          ) : null}
        </Card>

        {/* -- About ---------------------------------------------------------
            Not in 1022:16476, which has no About section — but `description`
            is a real column and the hospital frame proves the treatment. Kept
            conditional so a pharmacy without one loses nothing. */}
        {pharmacy.description?.trim() ? (
          <View className="gap-3">
            <SectionHeader title="About" />
            <Card>
              <Text className="font-body-md text-body-md text-on-surface-variant">
                {pharmacy.description.trim()}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* -- Opening hours -------------------------------------------------
            All seven days, always, when the map exists at all — a table with
            gaps in it is how a reader concludes the pharmacy is shut on the
            days nobody typed. `Not listed` says which is which. */}
        {hasHours ? (
          <View className="gap-3" testID="pharmacy-hours">
            <SectionHeader title="Opening hours" />
            <Card className="gap-1">
              {WEEK.map((d) => (
                <HoursRow
                  key={d.key}
                  day={d.label}
                  hours={formatDayHours(hours[d.key])}
                  emphasis={d.jsDay === todayJsDay ? "today" : "default"}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {/* -- Location & contact -------------------------------------------- */}
        {address || phone || pharmacy.email || pharmacy.licenseNumber ? (
          <View className="gap-3">
            <SectionHeader title="Location & contact" />
            <Card className="gap-4">
              {address ? <KeyValueRow label="Address" value={address} /> : null}
              {phone ? (
                <KeyValueRow
                  label="Phone"
                  value={phone}
                  action={{ label: "Call", onPress: () => void dialPhone(phone) }}
                />
              ) : null}
              {pharmacy.email ? (
                <KeyValueRow
                  label="Email"
                  value={pharmacy.email}
                  action={{
                    label: "Email",
                    onPress: () => void sendEmail(pharmacy.email as string),
                  }}
                />
              ) : null}
              {pharmacy.licenseNumber ? (
                <KeyValueRow label="Licence number" value={pharmacy.licenseNumber} />
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* -- Check medicine availability ----------------------------------- */}
        <View className="gap-3" testID="pharmacy-stock">
          <SectionHeader title="Check medicine availability" />
          <InfoCallout>
            {`Stock comes from ${pharmacy.name}'s own dispensing system and can change during the day. Call to reserve.`}
          </InfoCallout>
          <Input
            value={drugName}
            onChangeText={setDrugName}
            accessibilityLabel="Medicine name"
            placeholder="Medicine name, e.g. Amoxicillin 500mg"
            icon="medication"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => {
              if (drugName.trim()) stock.mutate({ drugName: drugName.trim() });
            }}
          />
          <Button
            label="Check availability"
            size="docked"
            pill={false}
            fullWidth
            shadow={false}
            // The endpoint requires a non-empty `drug_name` (min_length=1), so
            // an empty submit is a guaranteed 422. Disabled is the honest state.
            disabled={!drugName.trim() || stock.isPending}
            loading={stock.isPending}
            onPress={() => stock.mutate({ drugName: drugName.trim() })}
          />
          <StockResult
            pharmacyName={pharmacy.name}
            result={stock.data}
            isError={stock.isError}
            errorStatus={stockStatus}
          />
        </View>

        {/* -- Pharmacists here ---------------------------------------------- */}
        <View className="gap-3" testID="pharmacy-pharmacists">
          <SectionHeader title="Pharmacists here" />
          <Pharmacists
            pharmacyName={pharmacy.name}
            isPending={pharmacistsQuery.isPending}
            isError={pharmacistsQuery.isError}
            entries={pharmacists}
          />
        </View>
      </ScrollView>

      {showDock ? (
        <DockedActionBar
          // Pair when both columns are populated; otherwise whichever one is,
          // as the single primary. `primary` is required by the component, so
          // "Directions only" is expressed as Directions BEING the primary
          // rather than as a pair with a dead left half.
          primary={
            canCall
              ? { label: "Call", onPress: () => void dialPhone(phone as string) }
              : {
                  label: "Directions",
                  onPress: () => void openDirections(address as string, pharmacy.name),
                }
          }
          secondary={
            canCall && canRoute
              ? {
                  label: "Directions",
                  onPress: () => void openDirections(address as string, pharmacy.name),
                }
              : undefined
          }
          testID="pharmacy-detail-dock"
        />
      ) : null}
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

/**
 * The photo plate, and the fallback that is drawn as a first-class state rather
 * than left as a broken-image box.
 *
 * `photo_url` is nullable and — separately — a URL that resolves today can 404
 * tomorrow, so `onError` collapses to the same plate. One fallback, two causes:
 * a screen that handles null but not a dead link ships the grey box anyway.
 */
function Storefront({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const uri = photoUrl?.trim();

  if (uri && !broken) {
    return (
      <Image
        accessibilityLabel={`${name} storefront`}
        source={{ uri }}
        onError={() => setBroken(true)}
        resizeMode="cover"
        className="w-full rounded-card"
        style={{ height: STOREFRONT_HEIGHT }}
      />
    );
  }

  return (
    <View
      className="w-full items-center justify-center rounded-card bg-surface-container"
      style={{ height: STOREFRONT_HEIGHT }}
      testID="pharmacy-photo-fallback"
    >
      {/* No Health Icon exists for a pharmacy — the registry's `places` group is
          hospital / clinic / home / ambulance — so this is the chrome glyph
          `find_care`'s pharmacy cards already use. */}
      <IconTile icon="local-pharmacy" />
      <Text className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
        No storefront photo provided
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * THE THREE ANSWERS THIS ENDPOINT GIVES, AND WHY THEY MUST NOT LOOK ALIKE.
 *
 *   200 available:true                 in stock
 *   200 available:false source:"pms"   the pharmacy answered: not stocked
 *   200 available:false source:"unknown"   we could not reach them — UNKNOWN
 *   404                                the pharmacy publishes no live stock
 *
 * Collapsing the third into "Out of stock" tells a patient a pharmacy does not
 * have their medicine when what actually happened is a timeout. On a medicine
 * search that is the difference between calling ahead and driving elsewhere.
 */
function StockResult({
  pharmacyName,
  result,
  isError,
  errorStatus,
}: {
  pharmacyName: string;
  result: StockCheck | undefined;
  isError: boolean;
  errorStatus: number | undefined;
}) {
  if (isError) {
    return (
      <InfoCallout tone="error" testID="pharmacy-stock-error">
        {errorStatus === 404
          ? `${pharmacyName} doesn't publish live stock. Call the counter to check.`
          : `We couldn't check stock just now. Try again, or call ${pharmacyName}.`}
      </InfoCallout>
    );
  }

  if (!result) return null;

  if (result.source === "unknown") {
    return (
      <InfoCallout tone="error" testID="pharmacy-stock-unknown">
        {`We couldn't reach ${pharmacyName}'s dispensing system, so this isn't confirmed either way. Call the counter to check ${result.drugName}.`}
      </InfoCallout>
    );
  }

  return (
    <Card className="gap-4" testID="pharmacy-stock-result">
      <KeyValueRow
        label={result.drugName}
        value={result.available ? "In stock" : "Out of stock"}
        badge={{ label: "Live from pharmacy", tone: result.available ? "success" : "neutral" }}
      />
      {/* Quantity and price are BOTH nullable even on a successful answer — the
          upstream row may carry neither — so each row is conditional on its own
          field rather than on `available`. */}
      {result.quantity !== null ? (
        <KeyValueRow label="Quantity on hand" value={String(result.quantity)} />
      ) : null}
      {result.priceCents !== null ? (
        <KeyValueRow label="Price" value={formatPrice(result.priceCents, result.currency)} />
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pharmacists
// ---------------------------------------------------------------------------

function Pharmacists({
  pharmacyName,
  isPending,
  isError,
  entries,
}: {
  pharmacyName: string;
  isPending: boolean;
  isError: boolean;
  entries: PersonEntry[];
}) {
  if (isPending) {
    return (
      <Card
        accessibilityRole="progressbar"
        accessibilityLabel="Loading pharmacists"
        className="gap-4"
      >
        <ValueBar width="55%" />
        <ValueBar width="40%" />
      </Card>
    );
  }

  if (isError) {
    return (
      <FacilityEmptyCard
        title="Pharmacists unavailable"
        body={`We couldn't load ${pharmacyName}'s pharmacists just now. The rest of this page is up to date.`}
        icon="info-outline"
        testID="pharmacy-pharmacists-error"
      />
    );
  }

  if (entries.length === 0) {
    // `EmptyState / No pharmacists listed` 1022:17448 — and the case the seed
    // guarantees today, since it contains no pharmacists at all
    // (docs/PIPELINE.md §5). `only_listable` defaults true server-side, so this
    // also covers "they exist but are unpublished", which is the same sentence
    // from the reader's side.
    return (
      <FacilityEmptyCard
        title="No pharmacists listed"
        body={`${pharmacyName} has not listed any pharmacists yet. You can still call the counter for dispensing advice.`}
        testID="pharmacy-pharmacists-empty"
      />
    );
  }

  return (
    <View className="gap-3">
      {entries.map((p) => (
        <PractitionerSummaryRow
          key={p.id}
          name={p.name}
          specialty={p.title}
          avatarUri={p.avatarUri}
          // Deliberately no `rating` and no `verified`: pharmacist_service has
          // no rating column, and `is_listable` is a publishing flag, not a
          // credential check. Both refused in docs/PIPELINE.md §5.
          tags={p.badges.map((b) => b.label)}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chrome helpers
// ---------------------------------------------------------------------------

function ShareGlyph() {
  const color = useTokenColor("on-surface");
  return <Icon chrome="ios-share" size={22} color={color} />;
}

function PharmacyShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <DetailShell title={title} onBack={onBack} testID="pharmacy-detail-shell">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: SCROLL_PAD_BOTTOM,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </DetailShell>
  );
}

function LoadingBody() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading pharmacy details"
      className="gap-6"
      testID="pharmacy-detail-loading"
    >
      <View
        className="w-full rounded-card bg-surface-container-low"
        style={{ height: STOREFRONT_HEIGHT }}
      />
      <Card className="gap-2">
        <ValueBar width="65%" />
        <ValueBar width="40%" />
      </Card>
      <View className="gap-3">
        <SectionHeader title="Opening hours" />
        <Card className="gap-3">
          {WEEK.map((d) => (
            <ValueBar key={d.key} width="100%" />
          ))}
        </Card>
      </View>
      <View className="gap-3">
        <SectionHeader title="Location & contact" />
        <Card className="gap-4">
          <ValueBar width="80%" />
          <ValueBar width="55%" />
        </Card>
      </View>
    </View>
  );
}

/** See HospitalDetailScreen — height off the `label-sm` ramp, not a literal. */
function ValueBar({ width }: { width: `${number}%` }) {
  return (
    <View className="rounded bg-surface-container-low" style={{ width, height: 12 * 1.3 }} />
  );
}
