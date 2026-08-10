// Hospital detail — one hospital's record, its care team and its reviews.
//
// Figma: `hospital_detail` 1020:641 on page 1019:640 "Facilities"
// (dark proof 1022:17473, not-found / load-failed 1022:17252).
//
// This is the destination `find_care`'s hospital CTA has been a deliberate
// no-op for. The FLAG it replaces is quoted in FindCareScreen.tsx: there was no
// facility route, and the two nearest candidates were both practitioner
// profiles, which would have put a building's name over a person's page.
//
// ===========================================================================
// WHERE THE DATA COMES FROM — three single-resource GETs, no list endpoints
// ===========================================================================
//   GET /v1/hospitals/{id}          the record          careApi.getHospital
//   GET /v1/hospitals/{id}/reviews  bare array, public  careApi.listHospitalReviews
//   GET /v1/hospitals/{id}/staff    roster, authed      careApi.listHospitalStaff
//
// `listHospitals` is NOT one of them, and that is the trap this screen was
// written around: its adapter keeps four of fourteen columns and its route
// filters `is_active`, so resolving an id through it would render a hospital
// with no description, no accreditation and no contact details — or none at
// all. See the DETAIL SECTION header in `features/care/api.ts`.
//
// ===========================================================================
// THE CARE TEAM SECTION SUPERSEDES THE FRAME, AND SAYS SO
// ===========================================================================
// 1020:641 draws Care team as `EmptyState / Staff directory not published`
// (1020:16283), because when it was drawn `hospital_service` exposed only
// `POST /v1/hospitals/{id}/staff` — there was no GET at all, and
// `docs/PIPELINE.md` §5 (2026-08-05) recorded the CTA relabel that followed.
//
// `GET /v1/hospitals/{id}/staff` shipped 2026-08-06. What it returns is a real
// roster — `role`, `title`, `department` per row — and NO NAMES, because
// `user_service` has no batch name lookup, so the response carries
// `names_available: false` and a `names_unavailable_reason` instead. So:
//
//   * the EmptyState is GONE from the loaded state. Keeping it while real rows
//     exist would be the mirror of the "View Staff" defect — chrome outliving
//     its data, in the other direction.
//   * it survives as the EMPTY case, which is what it always described: a
//     hospital that has published no roster at all.
//   * no name is fabricated. The rows are roles and departments, and a callout
//     above them says in words why nobody is named — see `NamesCallout`.
//
// ===========================================================================
// WHAT THE BACKEND CANNOT SUPPLY, AND SO IS NOT DRAWN
// ===========================================================================
// Refused by name in `docs/PIPELINE.md` §5 and re-verified against
// `hospital_service`'s model and all three migrations before this build:
// opening hours, bed count, departments, wait time, "24/7 emergency", a
// hospital photo, distance in km, an aggregate rating or review count, staff
// names or photos, and review attribution (`reviewer_user_id` is a UUID and
// there is no lookup). None of them has a column. A field with no column must
// not appear here later either.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none directly; `@/lib/share` owns the ones it needs.

import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, type Href } from "expo-router";

import { DetailShell } from "@/components/shell";
import {
  Badge,
  Card,
  DockedActionBar,
  EmptyState,
  ErrorPanel,
  Icon,
  IconTile,
  InfoCallout,
  KeyValueRow,
  SectionHeader,
  type AnyIconName,
  type BadgeTone,
} from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { shareText } from "@/lib/share";
import { shareLinkLine } from "@/lib/share-links";
import type { HospitalDetail, HospitalStaffMember } from "@/features/care/api";
import {
  useHospital,
  useHospitalReviews,
  useHospitalStaff,
} from "@/features/care/hooks/use-hospital-detail";
import { HospitalReviewCard } from "@/features/care/components/HospitalReviewCard";
import {
  composeAddress,
  dialPhone,
  openWebsite,
  sendEmail,
} from "@/features/care/components/facility-links";

/** Clearance under the docked Call bar, matching PractitionerTelehealthProfileScreen. */
const DOCK_CLEARANCE = 112;
const SCROLL_PAD_BOTTOM = 32;

/**
 * The one substring of `names_unavailable_reason` this build knows how to word
 * for a patient. Matched rather than compared whole so a punctuation edit
 * server-side does not silently flip the screen into the fallback branch.
 *
 * Anything ELSE the server sends is rendered verbatim — see `NamesCallout`.
 */
const KNOWN_NAMES_REASON = "display names are not published by this endpoint";

/**
 * Accreditation is TWO columns and they say different things: `accreditation`
 * is free text naming the body, `accreditation_status` is a NOT NULL string
 * whose DB default is "pending". Rendering the first without the second turns
 * "we applied to HeFRA" into "HeFRA accredited", which is a regulatory claim
 * about a real hospital.
 *
 * So: the granted wordings get the badge the frame draws; every other value —
 * including ones this build has never seen, since the column has no enum and no
 * CHECK constraint — carries its own status in the label instead.
 */
const GRANTED_STATUSES = new Set(["accredited", "active", "approved", "valid", "certified"]);

function accreditationBadge(h: HospitalDetail): { label: string; tone: BadgeTone } | null {
  if (!h.accreditation?.trim()) return null;
  const body = h.accreditation.trim();
  if (GRANTED_STATUSES.has(h.accreditationStatus)) {
    return { label: `${body} accredited`, tone: "success" };
  }
  return { label: `${body} · ${h.accreditationStatus}`, tone: "neutral" };
}

/**
 * "doctor" -> "Doctor". The column is a free String(32) — the service's
 * `StaffRole` enum (doctor|nurse|admin|other) is NOT enforced on write — so
 * this has to cope with anything, including an already-capitalised value.
 */
function roleLabel(role: string): string {
  const cleaned = role.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Team member";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Health Icons where the vocabulary has one; chrome where it does not. */
function roleIcon(role: string): AnyIconName {
  switch (role.toLowerCase()) {
    case "doctor":
      return "doctor";
    case "nurse":
      return "nurse";
    case "admin":
      return "person";
    default:
      return "health-worker";
  }
}

/**
 * The two lines of a roster row.
 *
 * `title` is the specific thing ("Consultant Cardiologist") and `role` is the
 * coarse one ("doctor"). When both exist the title leads and the role stays
 * visible underneath, because the role is what the coarse filter on Find Care
 * matches and dropping it would make the two surfaces describe the same person
 * differently. When there is no title the role IS the line.
 */
function staffLines(s: HospitalStaffMember): { primary: string; secondary: string } {
  const role = roleLabel(s.role);
  const title = s.title?.trim();
  const primary = title || role;
  const rest = [s.department?.trim() || null, title ? role : null].filter(
    (p): p is string => !!p,
  );
  return { primary, secondary: rest.join(" · ") || role };
}

// ---------------------------------------------------------------------------

export function HospitalDetailScreen() {
  const params = useSearchParamsCompat();
  const hospitalId = params.hospitalId;
  const insets = useSafeAreaInsets();

  const hospitalQuery = useHospital(hospitalId);
  const hospital = hospitalQuery.data;
  // Both dependent sections wait for the record. A stale deep link then costs
  // ONE request and one 404, instead of three requests and three failures the
  // screen would have to reconcile into a single message.
  const hasRecord = !!hospital;
  const reviewsQuery = useHospitalReviews(hospitalId, hasRecord);
  const staffQuery = useHospitalStaff(hospitalId, hasRecord);

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    // Direct entry (a notification, a deep link) has no stack to pop. Find Care
    // is where this screen is reached from, so it is the honest fallback —
    // "/(app)" would land the user on Home, somewhere they never were.
    else router.replace("/(app)/find-care" as Href);
  }, []);

  const address = hospital
    ? composeAddress(hospital.addressLine1, hospital.city, hospital.country)
    : null;

  // The last line is a deep link back to THIS screen, keyed on the hospital id
  // and nothing else. It is safe to point at because this screen resolves from
  // the id alone — `useHospital` is `GET /v1/hospitals/{id}`, not a lookup
  // through the list adapter (see the header), so a recipient opening it cold
  // gets the record or an honest not-found panel, never a half-populated page.
  // `shareLinkLine` returns null wherever the URL would not resolve, and the
  // share then goes out as the text it always was.
  const onShare = useCallback(() => {
    if (!hospital) return;
    const lines = [
      hospital.name,
      address,
      hospital.contactPhone,
      hospital.websiteUrl,
      shareLinkLine({ kind: "hospital", id: hospital.hospitalId }),
    ].filter((l): l is string => !!l);
    void shareText(lines.join("\n"), { subject: hospital.name, dialogTitle: hospital.name });
  }, [hospital, address]);

  // ---- Chrome ------------------------------------------------------------
  // The bar names the hospital once loaded and "Hospital" before that, which is
  // what 1022:17252 titles the failure frame. Never a blank bar: a pushed screen
  // with no title reads as a broken back button.
  const title = hospital?.name ?? "Hospital";

  const phone = hospital?.contactPhone?.trim() || null;
  // 1020:16336 is a single-button dock reading "Call <name>". It does not render
  // at all without a number — `contact_phone` is nullable and a dead Call button
  // is worse than no button. When it is absent the shell reclaims the bottom
  // inset, so the last card is not left floating above a stripe of nothing.
  const showDock = !!phone;

  const shareAction = hospital ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Share ${hospital.name}`}
      onPress={onShare}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center active:opacity-70"
    >
      <ShareGlyph />
    </Pressable>
  ) : null;

  // ---- States ------------------------------------------------------------

  if (!hospitalId) {
    return (
      <FacilityShell title={title} onBack={onBack}>
        <ErrorPanel
          unrecoverable="no-identifier"
          title="We couldn't load this hospital"
          body="No hospital was selected. Go back to Find Care and choose one."
          testID="hospital-detail-error"
        />
      </FacilityShell>
    );
  }

  if (hospitalQuery.isPending) {
    return (
      <FacilityShell title={title} onBack={onBack}>
        <LoadingBody />
      </FacilityShell>
    );
  }

  if (hospitalQuery.isError || !hospital) {
    const status = (hospitalQuery.error as { status?: number } | null)?.status;
    // Two panels, not one with a retry: re-issuing the request behind a 404
    // returns the same 404, and the "Try again" the old shared panel drew there
    // refetched a failure the user could do nothing about.
    //
    // 1022:17260's body ended "GET /v1/hospitals/{id} returned 404." — a
    // designer's annotation that landed in the copy layer. Dropped, and kept
    // dropped: a route template is not patient-facing, and it is wrong for the
    // non-404 branch below, which also renders for a dropped connection.
    return (
      <FacilityShell title={title} onBack={onBack}>
        {status === 404 ? (
          <ErrorPanel
            unrecoverable="not-found"
            title="We couldn't load this hospital"
            body="It may no longer be listed. Go back to Find Care and try another."
            testID="hospital-detail-error"
          />
        ) : (
          <ErrorPanel
            title="We couldn't load this hospital"
            body="It may no longer be listed, or the connection dropped."
            retry={() => hospitalQuery.refetch()}
            testID="hospital-detail-error"
          />
        )}
      </FacilityShell>
    );
  }

  // ---- Loaded ------------------------------------------------------------

  const badge = accreditationBadge(hospital);
  const locality = [hospital.city, hospital.country].filter(Boolean).join(", ");
  const reviews = reviewsQuery.data ?? [];
  const staff = staffQuery.data;

  return (
    <DetailShell
      title={title}
      onBack={onBack}
      actions={shareAction}
      claimsBottomInset={!showDock}
      testID="hospital-detail"
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: showDock ? DOCK_CLEARANCE + insets.bottom : SCROLL_PAD_BOTTOM,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* -- Identity ------------------------------------------------------ */}
        <Card className="gap-4">
          <View className="flex-row items-center gap-4">
            {/* IconTile ships 40 and 32; 1020:651 is a 56 instance. Taking the
                shared component at 40 rather than adding a size the Design
                System page does not declare — noted as a deviation in the build
                report, not absorbed. */}
            <IconTile icon="hospital" />
            <View className="min-w-0 flex-1">
              <Text className="font-headline-md text-headline-md text-on-surface">
                {hospital.name}
              </Text>
              {/* `specialty` is the only column behind the frame's "General
                  Hospital" line; without one the noun stands alone rather than
                  being invented. */}
              <Text className="font-body-md text-body-md text-on-surface-variant">
                {[hospital.specialty ?? "Hospital", hospital.city].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          {badge || locality ? (
            <View className="flex-row flex-wrap gap-2">
              {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
              {locality ? <Badge label={locality} tone="neutral" /> : null}
            </View>
          ) : null}
        </Card>

        {/* -- About --------------------------------------------------------- */}
        {hospital.description?.trim() ? (
          <View className="gap-3">
            <SectionHeader title="About" />
            <Card>
              <Text className="font-body-md text-body-md text-on-surface-variant">
                {hospital.description.trim()}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* -- Location & contact -------------------------------------------
            Every row is conditional on its own nullable column. A labelled
            blank is worse than an absent row: "Phone —" reads as a number the
            app failed to load rather than one the hospital never gave. */}
        {address || phone || hospital.contactEmail || hospital.websiteUrl ? (
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
              {hospital.contactEmail ? (
                <KeyValueRow
                  label="Email"
                  value={hospital.contactEmail}
                  action={{
                    label: "Email",
                    onPress: () => void sendEmail(hospital.contactEmail as string),
                  }}
                />
              ) : null}
              {hospital.websiteUrl ? (
                <KeyValueRow
                  label="Website"
                  value={hospital.websiteUrl}
                  action={{
                    label: "Open",
                    onPress: () => void openWebsite(hospital.websiteUrl as string),
                  }}
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* -- Insurance ----------------------------------------------------- */}
        {hospital.insuranceAccepted.length > 0 ? (
          <View className="gap-3">
            <SectionHeader title="Insurance accepted" />
            <View className="flex-row flex-wrap gap-2">
              {hospital.insuranceAccepted.map((name) => (
                <Badge key={name} label={name} tone="neutral" />
              ))}
            </View>
          </View>
        ) : null}

        {/* -- Care team ----------------------------------------------------- */}
        <View className="gap-3" testID="hospital-care-team">
          <SectionHeader title="Care team" />
          <CareTeam
            hospitalName={hospital.name}
            isPending={staffQuery.isPending}
            isError={staffQuery.isError}
            roster={staff}
          />
        </View>

        {/* -- Patient reviews -----------------------------------------------
            Omitted entirely when there are none. The frame draws no empty state
            for this section, and an empty "Patient reviews" heading invites the
            reader to wonder what was hidden. */}
        {reviews.length > 0 ? (
          <View className="gap-3" testID="hospital-reviews">
            <SectionHeader title="Patient reviews" />
            {reviews.map((r) => (
              <HospitalReviewCard
                key={r.reviewId}
                rating={r.rating}
                title={r.title}
                body={r.body}
                createdAt={r.createdAt}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {showDock ? (
        <DockedActionBar
          primary={{ label: `Call ${hospital.name}`, onPress: () => void dialPhone(phone) }}
          testID="hospital-detail-dock"
        />
      ) : null}
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Care team
// ---------------------------------------------------------------------------

function CareTeam({
  hospitalName,
  isPending,
  isError,
  roster,
}: {
  hospitalName: string;
  isPending: boolean;
  isError: boolean;
  roster:
    | { items: HospitalStaffMember[]; namesAvailable: boolean; namesUnavailableReason: string | null }
    | undefined;
}) {
  if (isPending) {
    return (
      <Card
        accessibilityLabel="Loading care team"
        accessibilityRole="progressbar"
        className="gap-4"
      >
        <ValueBar width="60%" />
        <ValueBar width="45%" />
        <ValueBar width="52%" />
      </Card>
    );
  }

  if (isError || !roster) {
    // The roster is the ONE authenticated GET on this screen, so it is the one
    // that fails on its own — an expired token 401s here while the record and
    // the reviews (public at the service) still render. Saying so beats an
    // empty section that reads as "this hospital has no staff".
    return (
      <ErrorPanel
        unrecoverable="section-unavailable"
        title="Care team unavailable"
        body={`We couldn't load ${hospitalName}'s care team just now. The rest of this page is up to date.`}
        icon="info-outline"
        testID="hospital-care-team-error"
      />
    );
  }

  if (roster.items.length === 0) {
    // `EmptyState / Staff directory not published` 1020:16283, kept for the case
    // it actually describes. See the header: it is no longer the loaded state.
    return (
      <EmptyState
        icon="person-search"
        title="Staff directory not published"
        body={`${hospitalName} has not published its clinician list, so there is nobody to show here yet. Use the Doctors or Nurses tabs in Find Care to search by name or specialty.`}
        testID="hospital-care-team-empty"
      />
    );
  }

  return (
    <Card className="gap-4">
      {!roster.namesAvailable ? (
        <NamesCallout hospitalName={hospitalName} reason={roster.namesUnavailableReason} />
      ) : null}
      {roster.items.map((s) => {
        const { primary, secondary } = staffLines(s);
        return (
          <View key={s.staffId} className="w-full flex-row items-center gap-4">
            <IconTile icon={roleIcon(s.role)} />
            <View className="min-w-0 flex-1">
              <KeyValueRow label={primary} value={secondary} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/**
 * Why nobody in the roster has a name.
 *
 * `names_available: false` is the server volunteering that its payload is
 * incomplete, and a roster of anonymous roles with no explanation reads as a
 * hospital withholding something. The words are the app's, not the server's:
 * the reason the endpoint currently sends is service-speak — it names
 * `hospital_service` and "this endpoint" — and an internal service name is not
 * something to put in front of a patient.
 *
 * But it is not IGNORED either. If the server ever sends a DIFFERENT reason
 * (the hospital opted out, say) the app's sentence would be a confident wrong
 * answer, so an unrecognised reason is passed through verbatim. That is the
 * only branch in which the raw string is shown, and it is the branch where it
 * is the only true thing available.
 */
function NamesCallout({
  hospitalName,
  reason,
}: {
  hospitalName: string;
  reason: string | null;
}) {
  const recognised = !reason || reason.includes(KNOWN_NAMES_REASON);
  return (
    <InfoCallout testID="hospital-care-team-names-callout">
      {recognised
        ? `Names aren't published for this roster. ${hospitalName} lists the roles on its care team but not who fills them, so these rows show role, title and department only. To find a clinician by name, use the Doctors or Nurses tabs in Find Care.`
        : `Names aren't published for this roster. ${reason}`}
    </InfoCallout>
  );
}

// ---------------------------------------------------------------------------
// Chrome helpers
// ---------------------------------------------------------------------------

/** The app-bar share glyph. Its colour is the bar's own `on-surface`. */
function ShareGlyph() {
  const color = useTokenColor("on-surface");
  return <Icon chrome="ios-share" size={22} color={color} />;
}

/**
 * The failure and loading states still get the bar, the back button and the
 * page padding — only the body differs. Extracted so the three early returns
 * cannot drift from each other on inset handling, which is exactly how one of
 * them ends up scrolling under the gesture bar.
 */
function FacilityShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <DetailShell title={title} onBack={onBack} testID="hospital-detail-shell">
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

/**
 * The loading body reserves the loaded page's SECTION STRUCTURE — the headers
 * are the parts whose height is not in question, so only the values are line
 * boxes. Same stance as MedicationDetailsScreen's skeleton: content must not
 * jump under the reader's thumb as it arrives.
 */
function LoadingBody() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading hospital details"
      className="gap-6"
      testID="hospital-detail-loading"
    >
      <Card className="gap-4">
        <View className="flex-row items-center gap-4">
          <View className="h-10 w-10 rounded-md bg-surface-container-low" />
          <View className="min-w-0 flex-1 gap-2">
            <ValueBar width="70%" />
            <ValueBar width="45%" />
          </View>
        </View>
      </Card>
      <View className="gap-3">
        <SectionHeader title="About" />
        <Card className="gap-2">
          <ValueBar width="100%" />
          <ValueBar width="92%" />
          <ValueBar width="60%" />
        </Card>
      </View>
      <View className="gap-3">
        <SectionHeader title="Location & contact" />
        <Card className="gap-4">
          <ValueBar width="80%" />
          <ValueBar width="55%" />
          <ValueBar width="65%" />
        </Card>
      </View>
    </View>
  );
}

/**
 * One reserved line box. Height comes off the type ramp (`label-sm` is 12 at
 * 1.3) rather than a pre-computed number, so it stays in step if the ramp moves.
 */
function ValueBar({ width }: { width: `${number}%` }) {
  return (
    <View className="rounded bg-surface-container-low" style={{ width, height: 12 * 1.3 }} />
  );
}

/**
 * `useLocalSearchParams` with the one normalisation every param needs: expo
 * -router hands back `string | string[] | undefined`, and a repeated query key
 * ("?hospitalId=a&hospitalId=b") arrives as an array that would be interpolated
 * into a URL as "a,b". Empty and whitespace-only both collapse to undefined so
 * the screen's "no id" branch is one condition rather than three.
 */
function useSearchParamsCompat(): { hospitalId: string | undefined } {
  const raw = useLocalSearchParams<{ hospitalId?: string | string[] }>();
  const value = Array.isArray(raw.hospitalId) ? raw.hospitalId[0] : raw.hospitalId;
  return { hospitalId: value?.trim() ? value.trim() : undefined };
}
