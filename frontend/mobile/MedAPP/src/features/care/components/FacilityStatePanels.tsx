// The two panels both facility screens need: "we could not load this" and
// "there is nothing in this section".
//
// Figma: `ErrorPanel / hospital 404` 1022:17260 (inside frame
// `hospital_detail — not found · load failed` 1022:17252), `EmptyState / Staff
// directory not published` 1020:16283, `EmptyState / No pharmacists listed`
// 1022:17448.
//
// ---------------------------------------------------------------------------
// WHY THESE ARE LOCAL AND NOT IMPORTED FROM `src/components/ui/`
// ---------------------------------------------------------------------------
// Because there is nothing there to import. `EmptyState 517:1773` and
// `ErrorPanel 517:2111` are APPROVED IN FIGMA AND UNCODED — logged in
// docs/PIPELINE.md §5 and noted in AppointmentManagementScreen.tsx. Four
// screens currently carry a private copy each (FindCareScreen has two of them,
// at :850 and :947; ActivePatientRoster2Screen and SelectTimeSlotScreen have
// their own). This file is deliberately a FIFTH-and-sixth-avoiding move rather
// than a fifth copy: one definition shared by the two new screens, sitting in
// the feature that owns them, ready to be deleted wholesale when the shared
// components are built. It is NOT put in `src/components/ui/` now, because
// `docs/PIPELINE.md` §2 makes the Design System page the source of truth for
// what may live there and 517:1773 has not been coded from its own frame yet.
//
// ---------------------------------------------------------------------------
// COPY THAT WAS CHANGED FROM THE FRAME, AND WHY
// ---------------------------------------------------------------------------
// 1022:17260's body reads "It may no longer be listed, or the connection
// dropped. GET /v1/hospitals/{id} returned 404." The second sentence is a
// designer's annotation that ended up inside the copy layer: an HTTP verb, a
// route template and a status code are not something to show a patient looking
// for a hospital, and it would be wrong half the time anyway (the same panel
// renders for a dropped connection, which is status 0). Dropped, and FLAGGED in
// the build report rather than absorbed silently.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { Text, View } from "react-native";
import { Button, Card, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/** The frames draw a 48 plate with a 26 glyph — matches FindCareScreen's panels. */
const PLATE_GLYPH = 26;

export type FacilityErrorPanelProps = {
  /** e.g. "We couldn't load this hospital". */
  title: string;
  body: string;
  /** Omitted when there is nothing to retry — a missing route param, say. */
  onRetry?: () => void;
  testID?: string;
};

export function FacilityErrorPanel({ title, body, onRetry, testID }: FacilityErrorPanelProps) {
  // On the `error-container` plate, so it takes that plate's own on-colour
  // rather than bare `error`, which is tuned for text on `surface`.
  const glyph = useTokenColor("on-error-container");

  return (
    <Card className="items-center" style={{ paddingVertical: 32 }} testID={testID}>
      <View className="h-12 w-12 items-center justify-center rounded-full bg-error-container">
        {/* Decorative: the heading below says the same thing in words, so the
            failure is never carried by a red circle alone. */}
        <Icon chrome="error-outline" size={PLATE_GLYPH} color={glyph} />
      </View>
      <Text
        accessibilityRole="header"
        className="mt-4 text-center font-headline-md text-headline-md text-on-surface"
      >
        {title}
      </Text>
      <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
        {body}
      </Text>
      {onRetry ? (
        <View className="mt-6 w-full">
          <Button label="Try again" size="docked" pill={false} fullWidth onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

export type FacilityEmptyCardProps = {
  title: string;
  body: string;
  /** Defaults to the person-search glyph both EmptyState instances draw. */
  icon?: "person-search" | "storefront" | "info-outline";
  testID?: string;
};

export function FacilityEmptyCard({
  title,
  body,
  icon = "person-search",
  testID,
}: FacilityEmptyCardProps) {
  const glyph = useTokenColor("primary");

  return (
    <Card className="items-center" style={{ paddingVertical: 32 }} testID={testID}>
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-tint">
        <Icon chrome={icon} size={PLATE_GLYPH} color={glyph} />
      </View>
      <Text
        accessibilityRole="header"
        className="mt-4 text-center font-headline-md text-headline-md text-on-surface"
      >
        {title}
      </Text>
      <Text className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">
        {body}
      </Text>
    </Card>
  );
}
