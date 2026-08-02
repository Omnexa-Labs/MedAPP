// Active Script — View (Digital Prescription) screen. Translated from
// the Stitch "Digital Prescription" HTML.
//
// Reached from the Overview screen's Active Scripts → "View Rx" action.
// Sibling to ActiveScriptShareScreen — same naming family so future
// per-script surfaces stay parallel. The "Share Prescription" button
// here routes onward to the share screen, carrying the same params.
//
// Translation rules (same as the other screens):
//   - backdrop-blur glass header → the shared DetailAppBar; no blur, no shadow.
//   - hover:* / group-hover:* / focus:ring / desktop mouse-parallax →
//     dropped (no hover/mouse on RN).
//   - The web "watermark" (rotated diagonal MEDAPP SECURE text) and the
//     "clinical-texture" dot grid are decorative; reproduced at the
//     same low opacity. The dot grid is a single faint repeating row
//     approximation — a full radial-dot tile would need an SVG/image,
//     not worth the weight for a 3% texture.
//   - The 2-column document body collapses to a single column on
//     mobile, matching the comp's md: breakpoints.
//   - Download triggers a fade+slide success toast via Animated,
//     mirroring the comp's #toast.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Icon } from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, useTokenColor } from "@/lib/tokens";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

/**
 * The scroll reserve, after the forbidden `<BottomNav>` was deleted.
 *
 * It used to be 140 = the nav's 80 outer height (8 + 48 + 24, per
 * BottomNav.tsx's own geometry note) + 60 of breathing room under the last
 * option card. The nav is gone and DetailShell claims the bottom inset, so only
 * the 60 remains — carrying 140 over would leave an 80px hole.
 */
const SCROLL_RESERVE = 60;

/**
 * The toast's offset from the bottom of the body, likewise re-derived. It was
 * `bottom: 110` — 30 above the top edge of that same 80px nav — and the nav was
 * the only thing that number was measured against.
 */
const TOAST_BOTTOM = 30;

export function ActiveScriptViewScreen() {
  const params = useLocalSearchParams<{
    drug?: string;
    patient?: string;
    scriptId?: string;
    prescriber?: string;
    issuedDate?: string;
    // Optional richer clinical fields. Fall back to the comp's sample
    // values when the caller only passes the core set.
    rxNumber?: string;
    dob?: string;
    clinic?: string;
    license?: string;
    quantity?: string;
    refills?: string;
    instructions?: string;
    indication?: string;
  }>();

  const drug = params.drug ?? "Lisinopril 10mg";
  const patient = params.patient ?? "Alex Rivers";
  const scriptId = params.scriptId ?? "#8829-X";
  const prescriber = params.prescriber ?? "Dr. Sarah Jenkins";
  const issuedDate = params.issuedDate ?? "Oct 12, 2023";
  const rxNumber = params.rxNumber ?? "#RX-992-Rivers";
  const dob = params.dob ?? "12/05/1988";
  const clinic = params.clinic ?? "Central Cardiology Center";
  const license = params.license ?? "MD-99283-A";
  const quantity = params.quantity ?? "30 Tablets";
  const refills = params.refills ?? "3 Remaining";
  const instructions = params.instructions ?? "Once daily in the morning";
  const indication = params.indication ?? "Hypertension management";

  // Download success toast — fade + slide, auto-dismiss after 3s.
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslate = useRef(new Animated.Value(16)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showDownloadToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(toastTranslate, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(toastTranslate, { toValue: 16, duration: 220, useNativeDriver: true }),
      ]).start();
    }, 3000);
  };

  // The "Verified" tag that used to live inside the hand-rolled bar. Its glyph
  // was frozen at `#00685f` (the LIGHT value of color/primary) — resolved by
  // token name now, so it follows the mode.
  const primary = useTokenColor("primary");
  // Every remaining colour on this screen, by ROLE. The document treatment had
  // kept a pocket of literals that the AppearanceSelector could not reach:
  //   #00685f  in four different roles (watermark tint, an accent glyph, a
  //            filled-CTA fill, a decorative background glyph)
  //   #171d1c  as the Download icon — a near-black glyph that vanished on the
  //            dark `surface-container-highest` plate
  //   #ffffff  in two roles — the label/glyph ON the filled CTA (`on-primary`)
  //            and the QR plate SURFACE (`surface-container-lowest`)
  //   #2c3130 / #edf2f0 / #89f5e7 — the toast, which is M3's inverse pair
  const { scheme } = useResolvedScheme();
  // Decorative brand tints. The watermark is drawn at 4% and the pill-bottle
  // glyph at 10%, so they take `primary` with the alpha composed in rather than
  // a second, frozen "faint teal".
  const watermarkTint = useTokenColor("primary");
  const glyphTint = useTokenColor("primary", 0.1);
  const onSurface = useTokenColor("on-surface");
  // Filled CTA, exactly as the shared Button resolves it: `primary` fill,
  // `on-primary` content, pressed = the M3 state layer of one over the other.
  const ctaFill = tokenColor("primary", scheme);
  const ctaPressed = blendTokens("primary", "on-primary", 0.12, scheme);
  const onPrimary = useTokenColor("on-primary");
  // The toast is an INVERSE surface (a dark chip in light mode), so its accent
  // is `inverse-primary`, not `primary-fixed` — the frozen #89f5e7 mint would
  // have sat on a near-white chip once the surface itself flipped.
  const inversePrimary = useTokenColor("inverse-primary");
  const inverseOnSurface = useTokenColor("inverse-on-surface");

  const goShare = () => {
    router.push({
      pathname: "/(app)/active-script-share",
      params: { drug, patient, scriptId, prescriber, issuedDate },
    } as unknown as Href);
  };

  return (
    <DetailShell
      title="Digital Prescription"
      actions={
        <View className="flex-row items-center gap-xs rounded-full bg-primary-container/10 px-sm py-xs">
          <Icon chrome="verified" size={16} color={primary} />
          <Text className="font-label-md text-label-md text-primary">Verified</Text>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: SCROLL_RESERVE,
          paddingTop: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Document card.
            FLAGGED for a later pass: it IS a card, but the watermark layer
            and the document body both position themselves against its padding
            box, so the shared `Card` (which owns `p-md`) is not a drop-in
            without restructuring. Shadow deleted, radius taken to `radius/24`;
            the full-strength `outline-variant` hairline it already had is the
            separation, per docs/BRAND.md §Elevation. */}
        <View className="overflow-hidden rounded-card border border-outline-variant bg-card-surface">
          {/* Watermark — rotated, very faint. Behind content (zIndex 0). */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: "44%",
              left: -40,
              right: -40,
              alignItems: "center",
              transform: [{ rotate: "-45deg" }],
              opacity: 0.04,
            }}
          >
            <Text
              className="font-headline-xl"
              style={{ fontSize: 64, fontWeight: "800", color: watermarkTint }}
            >
              MEDAPP SECURE
            </Text>
          </View>

          <View style={{ position: "relative", zIndex: 10, padding: 24 }}>
            {/* Document header */}
            <View className="flex-row items-start justify-between border-b border-outline-variant pb-md">
              <View>
                <Text
                  className="font-headline-md text-primary"
                  style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.3 }}
                >
                  MedApp
                </Text>
                <Text
                  className="font-label-sm text-label-sm uppercase text-on-surface-variant"
                  style={{ letterSpacing: 2 }}
                >
                  Digital Prescription Rx
                </Text>
              </View>
              <View className="items-end gap-xs">
                <View className="rounded-lg bg-surface-container px-sm py-xs">
                  <Text className="font-label-md text-label-md text-outline">No. {rxNumber}</Text>
                </View>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  Issued: {issuedDate}
                </Text>
              </View>
            </View>

            {/* Patient */}
            <Section label="Patient Information">
              <View className="rounded-lg bg-surface-container-low p-md">
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                  {patient}
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  ID: {scriptId} • DOB: {dob}
                </Text>
              </View>
            </Section>

            {/* Prescriber */}
            <Section label="Prescriber Information">
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                {prescriber}
              </Text>
              <Text className="font-body-md text-body-md font-semibold text-primary">
                {clinic}
              </Text>
              <Text className="font-body-md text-body-md text-on-surface-variant">
                License: {license}
              </Text>
            </Section>

            {/* Medication details — bordered tinted box */}
            <Section label="Medication Details">
              <View className="overflow-hidden rounded-xl border-2 border-primary/20 bg-primary/5 p-md">
                <MaterialIcons
                  name="medication"
                  size={100}
                  color={glyphTint}
                  style={{ position: "absolute", right: -12, top: -12 }}
                />
                {/* The drug name was `on-primary-fixed-variant` — a token that
                    is INTENTIONALLY identical in both modes (#005049). On the
                    light mint box that reads; on the dark box (`primary/5` over
                    `card-surface`) it went dark-teal-on-dark and disappeared —
                    visible in dark-27-active-script-view.png. It is an accent
                    heading on a tinted surface, so it takes `primary`, which
                    tones up to mint in dark. */}
                <Text className="font-headline-md text-primary" style={{ fontSize: 22 }}>
                  {drug}
                </Text>
                <View className="mt-sm flex-row gap-md">
                  <View className="flex-1">
                    <Text className="font-label-sm text-label-sm text-outline">Quantity</Text>
                    <Text className="font-body-md text-body-md font-bold text-on-surface">
                      {quantity}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-label-sm text-label-sm text-outline">Refills</Text>
                    <Text className="font-body-md text-body-md font-bold text-on-surface">
                      {refills}
                    </Text>
                  </View>
                </View>
              </View>
            </Section>

            {/* Instructions */}
            <Section label="Instructions">
              <View className="flex-row items-start gap-sm rounded-lg bg-surface-container-low p-md">
                <MaterialIcons name="schedule" size={22} color={primary} />
                <Text
                  className="font-body-md text-body-md flex-1 text-on-surface"
                  style={{ fontStyle: "italic" }}
                >
                  "{instructions}"
                </Text>
              </View>
            </Section>

            {/* Indication + Pharmacy instructions */}
            <View className="mt-md border-t border-outline-variant pt-md">
              <Text className="font-label-md text-label-md mb-xs text-outline">Indication</Text>
              <Text className="font-body-md text-body-md text-on-surface">{indication}</Text>

              <View className="mt-md rounded-lg bg-surface-container p-md">
                <Text className="font-label-md text-label-md mb-sm text-outline">
                  Pharmacy Instructions
                </Text>
                <Bullet>Dispense as written</Bullet>
                <Bullet>Patient to monitor BP weekly</Bullet>
              </View>
            </View>

            {/* Digital sign & integrity */}
            <View className="mt-md flex-row items-center justify-between gap-md rounded-xl border border-outline-variant/30 bg-surface-container-high/30 p-md">
              <View className="flex-1 flex-row items-center gap-md">
                {/* The QR plate is a SURFACE, not a white label — one tone
                    recessed from the document card it sits in. `#ffffff` here
                    was the same literal the CTA used for its LABEL two
                    elements down; they are different roles. */}
                <View className="h-16 w-16 items-center justify-center rounded-lg bg-surface-container-lowest">
                  <Image
                    source={{
                      uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuCO7czg_wrLN_fFOUZ-uRsXB6r-pnVQXduveqA4uuGvIaRtUgS71tbhh3ABZp3E_VFF6xODnsJKM8blNMnx0eFLovUf2ZVxcmWzpeqAHpkzngcKwx0gyCvE_s315tnn8JyBPVoX3K_xzi_XGTBUpmEo2pYMEXZ2eTUCckqZqPWZOpFNw-yq6_yfA-gK7-DzPw7YqNKZSecjL-UzRhgMOV9oKRNrqpOCK9rx0O76h0o80QGuTseZX4Sv3kl9iIBl8MEMgESnt1LQJFk6",
                    }}
                    style={{ width: 48, height: 48 }}
                    accessibilityLabel="Signature QR code"
                  />
                </View>
                <View className="flex-1">
                  <Text className="font-label-md text-label-md text-on-surface">
                    Security & Integrity
                  </Text>
                  <Text className="font-label-sm text-label-sm text-outline">
                    Digitally signed, timestamped, and end-to-end encrypted for your safety.
                  </Text>
                </View>
              </View>
            </View>
            <View className="mt-sm items-start">
              <Text className="font-label-sm text-label-sm mb-xs text-outline">Signature Hash</Text>
              <Text
                className="rounded bg-surface-container-highest px-xs py-xs text-on-surface-variant"
                style={{ fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), fontSize: 10 }}
              >
                SHA-256: f1e2d3c4b5a6…
              </Text>
            </View>
          </View>
        </View>

        {/* Primary actions */}
        <View className="mt-lg gap-md">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share prescription"
            onPress={goShare}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 16,
              borderRadius: 12,
              backgroundColor: pressed ? ctaPressed : ctaFill,
            })}
          >
            <MaterialIcons name="send" size={20} color={onPrimary} />
            <Text className="font-label-md text-label-md text-on-primary">Share Prescription</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Download PDF"
            onPress={showDownloadToast}
            className="flex-row items-center justify-center gap-xs rounded-xl border border-outline-variant bg-surface-container-highest py-md active:scale-[0.98]"
          >
            <MaterialIcons name="download" size={20} color={onSurface} />
            <Text className="font-label-md text-label-md text-on-surface">Download PDF</Text>
          </Pressable>
        </View>

        {/* Options bento */}
        <View className="mt-lg gap-md">
          <OptionCard
            icon="local-pharmacy"
            title="Send to Pharmacy"
            body="Directly integrate with local CVS or Walgreens."
            onPress={goShare}
          />
          <OptionCard
            icon="qr-code-2"
            title="One-Time QR"
            body="Generate a temporary code for physical scanning."
            onPress={goShare}
          />
          <OptionCard
            icon="print"
            title="Print Script"
            body="Standard format for physical pharmacy copies."
          />
        </View>
      </ScrollView>

      {/* Download success toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: TOAST_BOTTOM,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: tokenColor("inverse-surface", scheme),
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 999,
          opacity: toastOpacity,
          transform: [{ translateY: toastTranslate }],
        }}
      >
        <MaterialIcons name="check-circle" size={20} color={inversePrimary} />
        <Text className="font-label-md text-label-md" style={{ color: inverseOnSurface }}>
          Document downloaded successfully
        </Text>
      </Animated.View>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-md">
      <Text
        className="font-label-md text-label-md mb-sm uppercase text-outline"
        style={{ letterSpacing: 1 }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-xs flex-row items-center gap-sm">
      <View className="h-1.5 w-1.5 rounded-full bg-primary" />
      <Text className="font-label-md text-label-md text-on-surface-variant">{children}</Text>
    </View>
  );
}

function OptionCard({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress?: () => void;
}) {
  const primary = useTokenColor("primary");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-md active:bg-surface-container"
    >
      <MaterialIcons name={icon} size={24} color={primary} />
      <Text className="font-label-md text-label-md mt-sm text-on-surface">{title}</Text>
      <Text className="font-label-sm text-label-sm mt-xs text-outline">{body}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Elevation — nothing on this screen casts a shadow.
//
// `cardShadow` is gone: its two call sites were the prescription document card
// and the QR plate inside it, both cards/tiles, which docs/BRAND.md §Elevation
// separates with surface tone and an `outline-variant` hairline instead.
// `appBarShadow` and `verifiedGlow` went earlier with the hand-rolled app bar —
// DetailAppBar (Figma 193:120) carries no effects.
//
// The download toast IS a floating surface and would be entitled to the
// sanctioned `0 2px 6px` @8% `shadow`-token pair; it ships flat today and is
// left as-is rather than gaining elevation it never had in this sweep.
// ---------------------------------------------------------------------------
