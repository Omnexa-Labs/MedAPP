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
//   - Download triggers a fade+slide toast, mirroring the comp's #toast — but
//     it now reports a REAL file. See the DOWNLOAD note below.
//
// ============================================================================
// DOWNLOAD — the button used to lie, and the label had to change with the fix
// ============================================================================
// `showDownloadToast()` was the entire download implementation: it animated the
// words "Document downloaded successfully" onto the screen and wrote nothing.
// Nothing was saved, nothing was shareable, and the user's next stop was their
// Files app to look for a document that had never existed.
//
// It writes a real file now, via @/lib/documents (read that module's header for
// the SDK 55 expo-file-system facts and the failure paths). The button therefore
// no longer says "Download PDF": there is no PDF generator in this project and
// `expo-print` is not a dependency, so a control labelled PDF would be the same
// lie with a file attached. It names the extension it actually produces, and the
// toast names the file rather than asserting a vague success. If a PDF pipeline
// lands later, the label moves back with it — not before.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import { Icon } from "@/components/ui";
import {
  buildPrescriptionDocument,
  describeSaveResult,
  formatDocumentTimestamp,
  prescriptionFileName,
  saveTextDocument,
} from "@/lib/documents";
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
  // The seeded cardiologist (scripts/seed_dev_data.py), not the invented
  // "Dr. Sarah Jenkins" this screen used to fall back to. Find Care lists the
  // seeded doctors, so any other name reads as a bug to a tester. Adjoa Boateng
  // is the right one of the six: this script is Lisinopril for hypertension
  // management, and her seed bio is hypertension and heart-failure follow-up.
  const prescriber = params.prescriber ?? "Dr. Adjoa Boateng";
  const issuedDate = params.issuedDate ?? "Oct 12, 2023";
  const rxNumber = params.rxNumber ?? "#RX-992-Rivers";
  const dob = params.dob ?? "12/05/1988";
  const clinic = params.clinic ?? "Central Cardiology Center";
  const license = params.license ?? "MD-99283-A";
  const quantity = params.quantity ?? "30 Tablets";
  const refills = params.refills ?? "3 Remaining";
  const instructions = params.instructions ?? "Once daily in the morning";
  const indication = params.indication ?? "Hypertension management";

  // The toast's Animated plumbing moved into the shared <Toast>
  // (src/components/feedback) when the Overview screen's download needed the
  // same chip. Same 220ms fade+slide, same 3s dwell, same inverse pill.
  // Destructured, not held as an object: `show`/`clear` are stable but the hook's
  // return value is a fresh object each render, so depending on it would rebuild
  // `onDownload` every time the screen re-rendered.
  const { message: toastMessage, tone: toastTone, show: showToast, clear: clearToast } = useToast();

  // `saving` exists so a second tap can't start a second write while the share
  // sheet from the first is still up. Also drives the button's own label: a file
  // write plus a share sheet is not instant, and a control that looks inert for a
  // beat is how people end up tapping it three times.
  const [saving, setSaving] = useState(false);

  const fileName = prescriptionFileName({ drug, scriptId });

  const onDownload = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Only what this screen renders — every value below is displayed in the
      // document above. Nothing is synthesised to round the record out.
      const body = buildPrescriptionDocument({
        drug,
        patient,
        scriptId,
        prescriber,
        issuedDate,
        rxNumber,
        dob,
        clinic,
        license,
        quantity,
        refills,
        instructions,
        indication,
        generatedAt: formatDocumentTimestamp(),
      });
      const result = await saveTextDocument({
        fileName,
        body,
        dialogTitle: "Save or send your prescription",
      });
      const { tone, message } = describeSaveResult(result);
      showToast(tone, message);
    } finally {
      // In `finally` and not after the await: saveTextDocument resolves rather
      // than throwing for every expected failure, but an unexpected throw must
      // still not leave the button permanently disabled.
      setSaving(false);
    }
  }, [
    saving,
    fileName,
    drug,
    patient,
    scriptId,
    prescriber,
    issuedDate,
    rxNumber,
    dob,
    clinic,
    license,
    quantity,
    refills,
    instructions,
    indication,
    showToast,
  ]);

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
  // The toast's three colours (`inverse-surface` / `inverse-on-surface` /
  // `inverse-primary`, which replaced the frozen #2c3130 / #edf2f0 / #89f5e7
  // trio) moved into the shared <Toast> with the chip itself. They are resolved
  // by the same token names there — this screen no longer names them.

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
          {/* Was "Download PDF" onto a toast-only stub. The extension is in the
              label because that is what the file is — see the DOWNLOAD note at the
              head of this file. `picture-as-pdf` would have been the wrong glyph
              for the same reason, so this keeps the neutral download arrow. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Download a text copy of this prescription"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={onDownload}
            className="flex-row items-center justify-center gap-xs rounded-xl border border-outline-variant bg-surface-container-highest py-md active:scale-[0.98]"
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            <MaterialIcons name="download" size={20} color={onSurface} />
            <Text className="font-label-md text-label-md text-on-surface">
              {saving ? "Saving…" : "Download Copy (.txt)"}
            </Text>
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

      {/* Download outcome toast. The copy is no longer a hardcoded
          "Document downloaded successfully" — it comes from the save result, so
          the chip cannot claim a file that was never written. */}
      <Toast
        message={toastMessage}
        tone={toastTone}
        onDismiss={clearToast}
        bottom={TOAST_BOTTOM}
      />
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
