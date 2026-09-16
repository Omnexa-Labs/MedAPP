// Smart Sync — connect devices.
//
// Frame: UI_screens/Patient_facing_screens/smart_sync_connect_devices. Three rows
// (Apple Health, Google Fit, Fitbit), each reading "Not Connected".
//
// ===========================================================================
// THE DEVICE LIST IS REAL. THE "CONNECT" BUTTON CANNOT BE.
// ===========================================================================
// `GET /v1/wearables/devices` exists, is routed to wearable_sync_service, and
// returns the devices actually registered for this patient — so the connected /
// not-connected state on this screen is genuine, not a sample. That is a first
// for this batch of screens.
//
// Pairing is a different matter, and api.ts already documents why:
//
//     "POST /v1/wearables/sync takes a device AND the samples to store — the
//      CALLER supplies the readings. It does not go and fetch anything from
//      Fitbit or Apple Health; nothing in this product talks to a vendor API."
//
// There is no vendor OAuth, no HealthKit bridge and no Health Connect bridge —
// none of those SDKs is a dependency. A "Connect" button would open nothing,
// register nothing, and leave the row reading "Not Connected" afterwards. That is
// the "Request refill" control ActiveMedicationsScreen deleted, so the rows carry
// STATUS and the screen says plainly what pairing needs, instead of offering a
// button that cannot do it.
//
// What the rows DO offer, when a device is genuinely connected, is its last sync
// time — a real fact from a real endpoint.
//
// ===========================================================================
// A FAILED FETCH MUST NEVER RENDER AS "NOT CONNECTED"
// ===========================================================================
// See ./connect-state.ts. Three rows confidently reading "Not Connected" during
// an outage would send a patient off to re-pair a watch that was already paired.
// The screen switches on `state.kind` and never tests the device array itself.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Badge, BrandMark, Card, Icon, InfoCallout, SectionHeader } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { deriveConnectState, type ConnectState, type ProviderRow } from "./connect-state";
import { useWearableDevices } from "./hooks/use-devices";

export function ConnectDevicesScreen() {
  const query = useWearableDevices();
  return <ConnectDevices state={deriveConnectState(query)} />;
}

/**
 * The list as a function of the state and nothing else, so every branch —
 * loading, error, offline, all-disconnected, an unrecognised provider — is
 * reachable in a test without a fake network.
 */
export function ConnectDevices({ state }: { state: ConnectState }) {
  return (
    <DetailShell
      title="Smart Sync"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/lifestyle" as Href);
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="font-headline-xl text-headline-xl text-on-surface">Connect devices</Text>
        <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Link a health app so your readings appear alongside the rest of your record.
        </Text>

        {/* Stated once, at the top, rather than repeated as a disabled button on
            every row. It describes the product, not this request. */}
        <View className="mt-4">
          <InfoCallout tone="error" testID="connect-devices-pairing-notice">
            Pairing is not available yet — MedApp cannot talk to Apple Health, Google Fit or Fitbit.
            Devices already linked to your account are shown below with their real status.
          </InfoCallout>
        </View>

        <View className="mt-6">
          <SectionHeader title="Health apps" icon="device" />
        </View>

        {state.kind === "loading" ? <DeviceSkeleton /> : null}
        {state.kind === "error" ? <DevicesError offline={state.offline} /> : null}
        {state.kind === "ready" ? (
          <View className="mt-2 gap-3" testID="connect-devices-rows">
            {state.rows.map((row) => (
              <ProviderCard key={row.key} row={row} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </DetailShell>
  );
}

/**
 * The brand mark, where the design system has one.
 *
 * `BrandMarkName` is `"google" | "apple"` — there is no Fitbit mark, and
 * components/ui/brand exists precisely because brand marks are NOT part of the
 * Health Icons clinical vocabulary. So Fitbit and any unrecognised provider get
 * the neutral `device` health icon rather than an invented logo.
 */
function ProviderGlyph({ row }: { row: ProviderRow }) {
  const primary = useTokenColor("primary");
  if (row.key === "apple_health") return <BrandMark name="apple" size={22} />;
  if (row.key === "google_fit") return <BrandMark name="google" size={22} />;
  return <Icon name="device" size={22} color={primary} />;
}

function ProviderCard({ row }: { row: ProviderRow }) {
  return (
    <Card className="p-4" testID={`provider-${row.key}`}>
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-md bg-primary-tint">
          <ProviderGlyph row={row} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface" numberOfLines={1}>
            {row.label}
          </Text>
          <Text className="mt-0.5 font-label-sm text-label-sm text-on-surface-variant">
            {describeRow(row)}
          </Text>
        </View>
        <Badge
          tone={row.connected ? "success" : "neutral"}
          label={row.connected ? "Connected" : "Not connected"}
        />
      </View>

      {/* Only for a provider this screen has no row for. Says why it is here, so
          an unfamiliar name does not read as a bug. */}
      {row.unrecognised ? (
        <Text className="mt-3 font-label-sm text-label-sm text-on-surface-variant">
          Linked to your account, but not one of the apps listed above.
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * The row's second line. Every branch is a fact from the endpoint; there is no
 * "Last synced just now" for a device with a null timestamp.
 */
function describeRow(row: ProviderRow): string {
  if (!row.connected) return "Not linked to your account";
  const suffix = row.deviceCount > 1 ? ` · ${row.deviceCount} devices` : "";
  const device = row.device;
  if (!device) return `Linked${suffix}`;
  if (!device.lastSyncedAtIso) return `Linked · never synced${suffix}`;
  return `Last synced ${formatSyncedAt(device.lastSyncedAtIso)}${suffix}`;
}

/**
 * An ISO instant as a short local date-time.
 *
 * `new Date(iso)` is correct HERE and wrong for the bare `YYYY-MM-DD` dates in
 * features/scripts/prescriptions.ts: a full ISO instant carries a zone, so
 * parsing it is unambiguous, whereas a bare date is parsed as UTC midnight and
 * shifts a day. Returns the raw string if the instant will not parse, rather than
 * rendering "Invalid Date" on a clinical screen.
 */
export function formatSyncedAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A failure says the list could not be loaded. It shows NO provider rows beneath
 * itself — that absence is the whole point of ./connect-state.ts.
 */
function DevicesError({ offline }: { offline: boolean }) {
  return (
    <View
      accessibilityRole="alert"
      testID="connect-devices-error"
      className="mt-2 rounded-md bg-error-container p-4"
    >
      <Text className="font-label-md text-label-md text-on-error-container">
        {offline ? "You’re offline" : "Couldn’t load your devices"}
      </Text>
      <Text className="mt-1 font-body-md text-body-md text-on-error-container">
        Your linked devices could not be loaded, so none are shown. This does not mean nothing is
        connected.
      </Text>
    </View>
  );
}

function DeviceSkeleton() {
  return (
    <View
      className="mt-2 gap-3"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading devices"
    >
      {[0, 1, 2].map((row) => (
        <Card key={row} className="p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 rounded-md bg-surface-container-high" />
            <View className="flex-1 gap-2">
              <View className="h-4 w-1/2 rounded-md bg-surface-container-high" />
              <View className="h-3 w-1/3 rounded-md bg-surface-container-high" />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}
