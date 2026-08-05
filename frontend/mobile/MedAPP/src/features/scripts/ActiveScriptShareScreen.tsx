// Active Script — Share screen. Translated from the Stitch "Share
// Prescription" HTML.
//
// Reached from the Overview screen's Active Scripts list: tapping
// "Share" on a script pushes this route with the script's details as
// params. There will be several "share" surfaces in the app (lab
// results, clinical records, etc.) — this one is specifically the
// active-prescription share, hence the ActiveScriptShare* naming. Keep
// future share screens parallel (e.g. LabResultShareScreen).
//
// Translation rules (same as HomeScreen / OverviewScreen):
//   - glass-header backdrop-blur → the shared DetailAppBar; no blur, no shadow.
//   - hover:* / group-hover:* / focus:ring → dropped (no hover on RN).
//   - The two CSS overlay modals (#success-modal, #qr-modal) become
//     React Native <Modal> components, following the bottom-sheet /
//     centered-dialog pattern already used by CountryPickerModal in
//     SignUpVerifyScreen.
//   - active-pill gradient → a flat primary fill (RN has no CSS
//     gradient without a lib; the brand primary reads the same at this
//     size). The QR hero keeps a two-tone look via a tinted overlay.
//   - The 5-minute QR countdown is real local state (setInterval),
//     mirroring the script in the comp. No network — design-only pass.
//
// "Other Options" — ONE of the three is real, and the labels say which.
// "Download PDF" here was a Pressable with no `onPress` at all: a full-width
// control that did nothing on tap. It writes a real text file now, through the
// same @/lib/documents path as the sibling view screen, and is relabelled with
// the extension it actually produces — there is no PDF generator in this project
// and `expo-print` is not a dependency. "Print Script" and "Copy Clinical Link"
// are still inert and are FLAGGED, not fixed, in this pass: printing needs the
// same missing render pipeline, and there is no clinical-link endpoint to copy.
// They are the next two controls that need either an implementation or an honest
// disabled state.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import { Card, Icon } from "@/components/ui";
import {
  buildPrescriptionDocument,
  describeSaveResult,
  formatDocumentTimestamp,
  prescriptionFileName,
  saveTextDocument,
} from "@/lib/documents";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, useTokenColor, type ColorScheme } from "@/lib/tokens";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

/**
 * The scroll reserve, after the forbidden `<BottomNav>` was deleted.
 *
 * It used to be 140 = the nav's 80 outer height (8 + 48 + 24, per BottomNav.tsx)
 * + 60 under the security footer. The nav is gone and DetailShell claims the
 * bottom inset, so only the 60 remains.
 */
const SCROLL_RESERVE = 60;

// ---------------------------------------------------------------------------
// Gradients, resolved by token for the current mode.
//
// Both used to be frozen literal pairs (`#006a61 → #008378` and
// `#00685f → #008378`), which is why every teal on this screen stayed
// light-mode teal while the page around it went near-black —
// dark-28-active-script-share.png.
//
// Neither can be expressed as a straight `primary → primary-container` pair,
// and that is a real gap worth naming: M3 tones those two in OPPOSITE
// directions between modes (primary 40→80 goes light, primary-container 30
// goes dark), so the honest-looking pair produces a mint-to-deep-teal ramp in
// dark with no single label colour that reads across it. There is no
// "gradient/*" token in docs/BRAND.md. Rather than keep the hexes, each ramp is
// derived from ONE token plus its own tone step, so the ramp direction is the
// same in both modes and the `on-*` pair stays valid across the whole sweep.
// ---------------------------------------------------------------------------

/**
 * The Stitch "active-pill" — a filled primary CTA. Fill and label are exactly
 * what the shared `Button` uses (`primary` / `on-primary`); the second stop is
 * the fill stepped 15% toward the page, which reproduces the shipped light ramp
 * (#00685f → ~#257e76 against the original #006a61 → #008378) and, in dark,
 * keeps both ends mint so the `on-primary` label reads across the pill.
 */
const pillGradient = (scheme: ColorScheme) =>
  [tokenColor("primary", scheme), blendTokens("primary", "surface", 0.15, scheme)] as const;

/**
 * The QR hero — an always-teal brand panel. It is a `primary-container` surface
 * with `on-primary-container` content (near-white in light, mint in dark), the
 * darker stop derived by stepping the container 30% toward `shadow`. Light lands
 * on ~#04635b → #008378, i.e. the ramp that shipped; dark lands on a deep teal
 * panel instead of a light-mode teal slab frozen onto a near-black page.
 */
const heroGradient = (scheme: ColorScheme) =>
  [
    blendTokens("primary-container", "shadow", 0.3, scheme),
    tokenColor("primary-container", scheme),
  ] as const;

const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;

// ---------------------------------------------------------------------------
// Params. All optional strings (route params arrive as strings); we
// fall back to the comp's sample values so the screen is never blank
// during design review or deep-linking without context.
// ---------------------------------------------------------------------------

interface NearbyPharmacy {
  id: string;
  name: string;
  detail: string;
}

const NEARBY_PHARMACIES: NearbyPharmacy[] = [
  { id: "cvs", name: "CVS Pharmacy", detail: "0.8 miles away • Open until 10 PM" },
  { id: "walgreens", name: "Walgreens", detail: "1.2 miles away • 24 Hours" },
];

const QR_TTL_SECONDS = 300; // 5:00, matches the comp

export function ActiveScriptShareScreen() {
  const params = useLocalSearchParams<{
    drug?: string;
    patient?: string;
    scriptId?: string;
    prescriber?: string;
    issuedDate?: string;
  }>();

  const drug = params.drug ?? "Lisinopril 10mg";
  const patient = params.patient ?? "Alex Rivers";
  const scriptId = params.scriptId ?? "#8829-X";
  // Same seeded cardiologist the view screen falls back to — these two are a
  // pair and the view screen forwards `prescriber` here, so the defaults must
  // not disagree. See ActiveScriptViewScreen for the reasoning.
  const prescriber = params.prescriber ?? "Dr. Adjoa Boateng";
  const issuedDate = params.issuedDate ?? "Oct 12, 2023";

  // Which pharmacy card is mid-send (shows a spinner). null = none.
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);

  // Track timers so we can clear them on unmount — leaking a setTimeout
  // that calls setState after unmount throws a warning.
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
      if (qrInterval.current) clearInterval(qrInterval.current);
    };
  }, []);

  const handleSend = (id: string) => {
    if (sendingId) return; // ignore double-taps mid-send
    setSendingId(id);
    // Simulated transmit — design-only. Real send hits the share API
    // in the wiring pass.
    sendTimer.current = setTimeout(() => {
      setSendingId(null);
      setSuccessVisible(true);
    }, 1500);
  };

  const openQr = () => {
    setSecondsLeft(QR_TTL_SECONDS);
    setQrVisible(true);
    if (qrInterval.current) clearInterval(qrInterval.current);
    qrInterval.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (qrInterval.current) clearInterval(qrInterval.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const closeQr = () => {
    setQrVisible(false);
    if (qrInterval.current) clearInterval(qrInterval.current);
  };

  // Download — a real write, reported by the shared toast. See the note at the
  // head of this file for why the label names ".txt".
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();
  const [saving, setSaving] = useState(false);

  const onDownload = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // This screen carries a SUBSET of the Rx fields — it has no quantity,
      // refills, license or DOB in its params. The builder omits what it isn't
      // given rather than substituting sample values, so the file is a shorter
      // record here, not an invented one.
      const body = buildPrescriptionDocument({
        drug,
        patient,
        scriptId,
        prescriber,
        issuedDate,
        generatedAt: formatDocumentTimestamp(),
      });
      const result = await saveTextDocument({
        fileName: prescriptionFileName({ drug, scriptId }),
        body,
        dialogTitle: "Save or send your prescription",
      });
      const { tone, message } = describeSaveResult(result);
      showToast(tone, message);
    } finally {
      setSaving(false);
    }
  }, [saving, drug, patient, scriptId, prescriber, issuedDate, showToast]);

  // The bar's verified glyph, resolved by token name instead of the `#00685f`
  // (light-mode color/primary) the hand-rolled bar froze.
  const primary = useTokenColor("primary");
  const { scheme } = useResolvedScheme();
  const pill = pillGradient(scheme);
  const hero = heroGradient(scheme);
  // Every remaining glyph colour, by ROLE rather than by matching the hex:
  //   #00685f  was doing FOUR jobs — the SECURE SCRIPT lock, the "View Nearby"
  //            map glyph, the pharmacy plate glyph and the success tick. All
  //            four are accents on a neutral surface, so all four are `primary`.
  //   #3d4947  the patient glyph beside the name: secondary content on a card.
  //   #6d7a77  the modal close and the security footer: `outline`, its own token.
  //   #ffffff  was BOTH the label on a filled pill (`on-primary`) and the
  //            content on the teal hero (`on-primary-container`) — the same
  //            literal in two roles, which is exactly the trap here.
  //   #005049  the IDENTITY VERIFIED tick, already correctly paired with a
  //            `*-fixed` surface, so it stays in the fixed family by name.
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const outline = useTokenColor("outline");
  const onPrimary = useTokenColor("on-primary");
  const onPrimaryContainer = useTokenColor("on-primary-container");
  const onPrimaryFixedVariant = useTokenColor("on-primary-fixed-variant");
  // A 40% overlay behind each dialog. `scrim` is the token for exactly this;
  // the frozen rgba(44,49,48,0.4) was `inverse-surface`'s LIGHT value, which
  // would have gone pale over a dark page.
  const scrim = useTokenColor("scrim", 0.4);
  // The hero's decorative blob: the panel's own content colour at 10%.
  const heroBlob = useTokenColor("on-primary-container", 0.1);

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timerLabel = `${mm}:${ss < 10 ? "0" : ""}${ss}`;

  return (
    <DetailShell
      title="Share Prescription"
      actions={
        <View className="flex-row items-center gap-sm">
          <Icon chrome="verified-user" size={22} color={primary} label="Verified script" />
          <Image
            source={{
              uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuD6LAeX-YlXMlQGv0_wVk0DJGPhlaIcEgvqYrSVhPJeWnOwGnFALF3S-hBNLRbVXmsiOpbXZup8mZCqfByqANRcBBUJWzCRxNcYXQRDQX90x2cY4i6jue6aOc67_2Z1WQp1QY7uaqHLQo11jMgaFLIQnHHYcoRB55mqmVBoMt0AN-RFmPYz3Jn8qxe7KP4pDiHhFU7x5v5uSszvhkBWdFM62k1XSp2si-CpfpaJ0pPT_oMa0nlkHCtvoNBiwMgqirk01MAAmTKQr3oq",
            }}
            className="h-8 w-8 rounded-full border border-outline-variant"
            accessibilityLabel="Your profile"
          />
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: SCROLL_RESERVE }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <Card className="mt-md">
          <View className="mb-sm flex-row items-start justify-between">
            <View className="flex-1 pr-sm">
              <Text className="font-headline-md text-headline-md mb-xs text-primary">{drug}</Text>
              <View className="flex-row items-center gap-xs">
                <MaterialIcons name="person" size={16} color={onSurfaceVariant} />
                <Text className="font-body-md text-on-surface-variant">
                  {patient} • ID: {scriptId}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-xs rounded-full bg-primary/10 px-sm py-xs">
              <MaterialIcons name="lock" size={16} color={primary} />
              <Text className="font-label-sm text-label-sm text-primary">SECURE SCRIPT</Text>
            </View>
          </View>
          <View className="mt-sm flex-row gap-md border-t border-outline-variant pt-sm">
            <View className="flex-1">
              <Text className="text-label-sm uppercase text-outline" style={{ letterSpacing: 1 }}>
                Prescriber
              </Text>
              <Text className="font-label-md text-label-md mt-xs text-on-surface">
                {prescriber}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-label-sm uppercase text-outline" style={{ letterSpacing: 1 }}>
                Issued Date
              </Text>
              <Text className="font-label-md text-label-md mt-xs text-on-surface">
                {issuedDate}
              </Text>
            </View>
          </View>
        </Card>

        {/* Quick Send */}
        <View className="mt-lg">
          <View className="mb-sm flex-row items-center justify-between">
            <Text className="font-headline-md text-headline-md text-on-surface">Quick Send</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View nearby pharmacies"
              hitSlop={6}
              className="flex-row items-center gap-xs active:opacity-70"
            >
              <MaterialIcons name="map" size={16} color={primary} />
              <Text className="font-label-sm text-label-sm text-primary">View Nearby</Text>
            </Pressable>
          </View>
          {/* Each pharmacy is a compact list row, not a card: it keeps `p-sm`
              and `radius/12` rather than the shared `Card`'s 24/24, so it
              stays a View. Shadow deleted; the full-strength hairline it
              already carried is the separation. */}
          <View className="gap-sm">
            {NEARBY_PHARMACIES.map((p) => (
              <View
                key={p.id}
                className="flex-row items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-sm"
              >
                <View className="flex-1 flex-row items-center gap-md">
                  <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-container">
                    <MaterialIcons name="local-pharmacy" size={28} color={primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-label-md text-label-md text-on-surface">{p.name}</Text>
                    <Text className="font-label-sm text-label-sm text-outline">{p.detail}</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${drug} to ${p.name}`}
                  disabled={sendingId !== null}
                  onPress={() => handleSend(p.id)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    overflow: "hidden",
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                    opacity: sendingId && sendingId !== p.id ? 0.5 : 1,
                  })}
                >
                  <LinearGradient
                    colors={pill}
                    start={GRADIENT_START}
                    end={GRADIENT_END}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                    }}
                  >
                    {sendingId === p.id ? (
                      <MaterialIcons name="autorenew" size={16} color={onPrimary} />
                    ) : null}
                    <Text className="font-label-md text-label-md text-on-primary">
                      {sendingId === p.id ? "Sending…" : "Send Now"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {/* Share Securely (QR hero) */}
        <View className="mt-lg">
          <Text className="font-headline-md text-headline-md mb-sm text-on-surface">
            Share Securely
          </Text>
          <LinearGradient
            colors={hero}
            start={GRADIENT_START}
            end={GRADIENT_END}
            // A tinted hero panel, not a floating surface — the gradient
            // against the page is its own separation, so no shadow.
            style={{ borderRadius: 24, overflow: "hidden", padding: 24 }}
          >
            {/* Decorative blurred blob → a soft translucent circle. */}
            <View
              style={{
                position: "absolute",
                right: -48,
                top: -48,
                width: 192,
                height: 192,
                borderRadius: 96,
                backgroundColor: heroBlob,
              }}
            />
            <View className="items-center">
              {/* Content ON the teal panel takes the panel's `on-*` pair, not a
                  literal white: near-white in light, mint in dark. */}
              <View className="mb-md h-16 w-16 items-center justify-center rounded-full bg-on-primary-container/20">
                <MaterialIcons name="qr-code-2" size={36} color={onPrimaryContainer} />
              </View>
              <Text className="font-headline-md text-headline-md mb-xs text-on-primary-container">
                In-Person Dispensing
              </Text>
              <Text className="font-body-md text-body-md mb-md text-center text-on-primary-container/80">
                Generate a temporary, encrypted QR code for a pharmacist to scan directly from your
                device.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Generate one-time QR code"
                onPress={openQr}
                className="rounded-xl bg-surface-container-lowest px-lg py-sm active:scale-95"
              >
                <Text className="font-label-md text-label-md text-primary">
                  Generate One-Time QR Code
                </Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Other Options */}
        <View className="mt-lg">
          <Text className="font-headline-md text-headline-md mb-sm text-on-surface">
            Other Options
          </Text>
          <View className="gap-sm">
            {/* `picture-as-pdf` went with the word PDF — the glyph asserted the
                format just as loudly as the label did. */}
            <OtherOption
              icon="download"
              label={saving ? "Saving…" : "Download Copy (.txt)"}
              accessibilityLabel="Download a text copy of this prescription"
              onPress={onDownload}
              disabled={saving}
            />
            <OtherOption icon="print" label="Print Script" />
            <OtherOption icon="link" label="Copy Clinical Link" />
          </View>
        </View>

        {/* Security footer */}
        <View className="mt-lg flex-row items-center justify-center gap-sm border-t border-outline-variant/30 pt-lg">
          <MaterialIcons name="health-and-safety" size={16} color={outline} />
          <Text className="text-label-sm text-outline">
            HIPAA Compliant • 256-bit AES Encryption • Clinical Grade Security
          </Text>
        </View>
      </ScrollView>

      {/* Download outcome. Sibling of the ScrollView inside DetailShell, which is
          where the view screen's toast sits too — 30 clears the shell's bottom
          inset, and a detail screen has no BottomNav to clear. */}
      <Toast message={toastMessage} tone={toastTone} onDismiss={clearToast} bottom={30} />

      {/* Success modal */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: scrim,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View className="w-full max-w-sm items-center rounded-2xl bg-surface-container-lowest p-lg">
            <View className="mb-md h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <MaterialIcons name="check-circle" size={48} color={primary} />
            </View>
            <Text className="font-headline-md text-headline-md mb-xs text-primary">Script Sent!</Text>
            <Text className="font-body-md text-body-md mb-lg text-center text-on-surface-variant">
              Your prescription has been securely transmitted to the pharmacy. You will receive a
              notification when it's ready for pickup.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setSuccessVisible(false)}
              style={({ pressed }) => ({
                width: "100%",
                borderRadius: 12,
                overflow: "hidden",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <LinearGradient
                colors={pill}
                start={GRADIENT_START}
                end={GRADIENT_END}
                style={{ paddingVertical: 14, alignItems: "center" }}
              >
                <Text className="font-label-md text-label-md text-on-primary">Done</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* QR modal */}
      <Modal
        visible={qrVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeQr}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: scrim,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-lg">
            <View className="mb-md flex-row items-center justify-between">
              <Text className="font-label-md text-label-md text-primary">One-Time Access Code</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close QR code"
                hitSlop={8}
                onPress={closeQr}
              >
                <MaterialIcons name="close" size={24} color={outline} />
              </Pressable>
            </View>
            {/* The QR's quiet-zone plate is a SURFACE inside the dialog, not a
                white label — `surface-container-lowest`, which is #ffffff in
                light (unchanged) and recesses in dark. The code image itself
                carries its own light field, so the ring around it may tone. */}
            <View className="mb-md rounded-2xl border-2 border-primary/20 bg-surface-container-lowest p-md">
              <Image
                source={{
                  uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuDScQEMTVEwwlBgYyUNaJDZSI3snGuaNa827BojWmmZ7yxrveOXdFB6HFNurnZ5KF1pVPwXSOGcPXOcQ2YQRu88no-poClduBgyCFTlrjZLr9_mEWzRvsVWfkOJfYUenzk86ivinUw4veKhh9X6wVy5S-o9C-eaAt1RhNvB_nqDNQ-Q9Oe_oFsBirqfzRl74iK5vWAbc-OxVrCLa6Kmyi0_-w2l5sVGHOUxKVUW_E9V7dblIM-vq7gYhtEnZ7qWDJlvPYGHglkZKlcS",
                }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: 8 }}
                resizeMode="contain"
                accessibilityLabel="Encrypted one-time QR code"
              />
            </View>
            <Text className="text-label-sm mb-base text-center text-outline">
              This code expires in{" "}
              <Text className="font-bold text-primary">{timerLabel}</Text>
            </Text>
            <View className="flex-row items-center justify-center gap-xs rounded-lg bg-primary-fixed p-xs">
              <MaterialIcons name="verified" size={16} color={onPrimaryFixedVariant} />
              <Text className="text-label-sm text-on-primary-fixed-variant">IDENTITY VERIFIED</Text>
            </View>
          </View>
        </View>
      </Modal>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * A full-width option row.
 *
 * `onPress` is optional and `accessibilityLabel` now separable from the visible
 * label — the download row's label changes to "Saving…" mid-write, and letting
 * that string double as the accessible name would rename the control under a
 * screen reader while it worked.
 *
 * FLAGGED: two of the three rows still pass no `onPress`. That is pre-existing
 * and deliberately left visible rather than papered over — see the note at the
 * head of this file.
 */
function OtherOption({
  icon,
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const primary = useTokenColor("primary");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md active:bg-surface-container"
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <MaterialIcons name={icon} size={24} color={primary} />
      <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Elevation — nothing on this screen casts a shadow.
//
// `cardShadow` is gone: its three call sites were the summary card, the
// pharmacy list rows and the QR hero panel — all cards/rows/panels, separated
// by surface tone and an `outline-variant` hairline per docs/BRAND.md
// §Elevation. `appBarShadow` went earlier with the hand-rolled app bar.
//
// The two <Modal> dialogs ARE floating surfaces and would be entitled to the
// sanctioned `0 2px 6px` @8% `shadow`-token pair; they separate today with a
// scrim instead and are left as-is rather than gaining elevation in this sweep.
// ---------------------------------------------------------------------------
