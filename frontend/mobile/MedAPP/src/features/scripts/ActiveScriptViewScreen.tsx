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
// ============================================================================
// THE SECURITY AND VERIFICATION CLAIMS ARE GONE, AND SO ARE THE SAMPLE VALUES
// ============================================================================
// Everything this screen asserted about the provenance of the document was
// decoration:
//   * a "Verified" chip in the app-bar action slot, rendered UNCONDITIONALLY.
//     Nothing is verified — there is no signing service, and a pharmacist
//     reading that chip would be reading a claim the backend never made.
//   * a "Signature QR code" that was a remote PNG on lh3.googleusercontent.com.
//     Identical bytes for every user and every script, and an outbound request
//     to a Google CDN from a screen displaying prescription data.
//   * "Digitally signed, timestamped, and end-to-end encrypted for your safety."
//     None of the three is true of this document.
//   * `SHA-256: f1e2d3c4b5a6…` — a hash of nothing, truncated so it could not be
//     checked.
//   * the rotated "MEDAPP SECURE" watermark, which is the same assertion in
//     typography.
// `lib/documents/builders.ts` had already made exactly this call for the
// EXPORTED file ("copying a truncated fake integrity check into a file that
// claims to be a record is the same lie in a new container"). The screen now
// agrees with its own export.
//
// The "Send to Pharmacy — Directly integrate with local CVS or Walgreens" and
// "One-Time QR" option cards went with them: there is no pharmacy integration
// (and CVS/Walgreens are US chains in a Ghana-seeded product), and the QR they
// advertised was a static image. "Print Script" had no `onPress` at all, so the
// whole bento is gone rather than left as one dead control in a row of two
// removed ones. Recorded in docs/api/README.md.
//
// ============================================================================
// PARAMS ARE READ, NOT INVENTED
// ============================================================================
// Thirteen `params.X ?? "<clinical constant>"` fallbacks used to sit here —
// patient "Alex Rivers", DOB 12/05/1988, licence MD-99283-A, "Hypertension
// management", 30 Tablets, 3 refills. A partial deep link therefore rendered a
// coherent-looking prescription that blended whatever the caller passed with
// fabricated clinical values, with nothing on screen to tell them apart.
//
// The five core fields are now REQUIRED and the screen renders a not-found
// state without them — the treatment ReviewAppointmentScreen already uses for
// "this session cannot be reconstructed". The eight optional clinical fields
// render only when passed; a missing one is omitted, exactly as
// `buildPrescriptionDocument` omits it from the file.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import { ErrorPanel } from "@/components/ui";
import {
  buildPrescriptionDocument,
  describeSaveResult,
  formatDocumentTimestamp,
  prescriptionFileName,
  saveTextDocument,
} from "@/lib/documents";
import { useResolvedScheme } from "@/lib/theme";
import { blendTokens, tokenColor, useTokenColor } from "@/lib/tokens";

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

/**
 * A route param that is actually there.
 *
 * `useLocalSearchParams` hands back `undefined` for an absent key and `""` for
 * a key present but empty, and neither is a value to render a prescription
 * from. Returns `undefined` so the result drops straight into the document
 * builders, which omit what they are not given.
 */
function text(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

export function ActiveScriptViewScreen() {
  const params = useLocalSearchParams<{
    drug?: string;
    patient?: string;
    scriptId?: string;
    prescriber?: string;
    issuedDate?: string;
    // Optional richer clinical fields. Nothing in the app passes these today,
    // so each section below renders only when its param actually arrives.
    rxNumber?: string;
    dob?: string;
    clinic?: string;
    license?: string;
    quantity?: string;
    refills?: string;
    instructions?: string;
    indication?: string;
  }>();

  // The five the document cannot be drawn without. See the PARAMS note above:
  // these had clinical constants behind them, which is how a link missing the
  // patient rendered someone else's name over the caller's drug.
  const drug = text(params.drug);
  const patient = text(params.patient);
  const scriptId = text(params.scriptId);
  const prescriber = text(params.prescriber);
  const issuedDate = text(params.issuedDate);
  const rxNumber = text(params.rxNumber);
  const dob = text(params.dob);
  const clinic = text(params.clinic);
  const license = text(params.license);
  const quantity = text(params.quantity);
  const refills = text(params.refills);
  const instructions = text(params.instructions);
  const indication = text(params.indication);

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
  // The pill-bottle glyph behind the medication box, drawn at 10% — `primary`
  // with the alpha composed in rather than a second, frozen "faint teal". The
  // watermark tint that used to sit beside it went with "MEDAPP SECURE".
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

  // -------------------------------------------------------------------------
  // Nothing to draw a prescription from
  // -------------------------------------------------------------------------
  // A WHOLE-SCREEN replacement, not a banner, and the same shape
  // ReviewAppointmentScreen uses for a booking session it cannot reconstruct:
  // there is no prescription here, so displaying one is not something this
  // screen can offer. Hooks above run first, unconditionally.
  if (!drug || !patient || !scriptId || !prescriber || !issuedDate) {
    return (
      <DetailShell title="Digital Prescription">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: SCROLL_RESERVE,
            flexGrow: 1,
            justifyContent: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* `no-identifier`, not `not-found`: nothing was looked up. The guard
              above is a route-param check, and re-issuing it would fail the same
              way, so there is no retry to offer.

              No `action` either. The app bar's back chevron is the exit, and a
              second control saying the same thing under a different name is two
              affordances for one action. */}
          <ErrorPanel
            testID="script-not-found"
            unrecoverable="no-identifier"
            title="We can't show this prescription"
            body="The link you followed is missing the details of the script. Open it again from your medications so the right record is loaded."
          />
        </ScrollView>
      </DetailShell>
    );
  }

  const goShare = () => {
    router.push({
      pathname: "/(app)/active-script-share",
      params: { drug, patient, scriptId, prescriber, issuedDate },
    } as unknown as Href);
  };

  return (
    // No app-bar action slot. It held an unconditional "Verified" chip — see the
    // note at the head of this file.
    <DetailShell title="Digital Prescription">
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
          {/* The rotated "MEDAPP SECURE" watermark is gone. It read as
              decoration but it is a claim, and nothing about this document is
              secured. */}
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
                {/* The Rx number is optional and no caller passes one, so the
                    chip is dropped rather than filled with `#RX-992-Rivers`. */}
                {rxNumber ? (
                  <View className="rounded-lg bg-surface-container px-sm py-xs">
                    <Text className="font-label-md text-label-md text-outline">No. {rxNumber}</Text>
                  </View>
                ) : null}
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
                  ID: {scriptId}
                  {dob ? ` • DOB: ${dob}` : ""}
                </Text>
              </View>
            </Section>

            {/* Prescriber */}
            <Section label="Prescriber Information">
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                {prescriber}
              </Text>
              {clinic ? (
                <Text className="font-body-md text-body-md font-semibold text-primary">
                  {clinic}
                </Text>
              ) : null}
              {/* A licence number is a credential. Printing `MD-99283-A` under a
                  real prescriber's name attributes a registration to them that
                  nothing issued. */}
              {license ? (
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  License: {license}
                </Text>
              ) : null}
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
                {quantity || refills ? (
                  <View className="mt-sm flex-row gap-md">
                    {quantity ? (
                      <View className="flex-1">
                        <Text className="font-label-sm text-label-sm text-outline">Quantity</Text>
                        <Text className="font-body-md text-body-md font-bold text-on-surface">
                          {quantity}
                        </Text>
                      </View>
                    ) : null}
                    {refills ? (
                      <View className="flex-1">
                        <Text className="font-label-sm text-label-sm text-outline">Refills</Text>
                        <Text className="font-body-md text-body-md font-bold text-on-surface">
                          {refills}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Section>

            {/* Instructions */}
            {instructions ? (
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
            ) : null}

            {/* Indication.
                The "Pharmacy Instructions" box that used to close this section
                went with the fallbacks: "Dispense as written" and "Patient to
                monitor BP weekly" were literal JSX, not fields — dispensing
                directions and a monitoring instruction attributed to a
                prescriber who never wrote them. */}
            {indication ? (
              <View className="mt-md border-t border-outline-variant pt-md">
                <Text className="font-label-md text-label-md mb-xs text-outline">Indication</Text>
                <Text className="font-body-md text-body-md text-on-surface">{indication}</Text>
              </View>
            ) : null}

            {/* What stood here — the QR "signature", the "digitally signed,
                timestamped, end-to-end encrypted" line and the SHA-256 stub —
                is documented at the head of this file. In its place, the same
                thing the exported file's footer says, because it is the one
                statement about this document that is true. */}
            <View className="mt-md rounded-xl border border-outline-variant/30 bg-surface-container-high/30 p-md">
              <Text className="font-label-sm text-label-sm text-outline">
                This is a patient copy for your reference. It is not signed, and a pharmacy will
                dispense against the prescription your prescriber issued.
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

        {/* The three-card "Other options" bento is deleted — see the head of
            this file. Two advertised capabilities that do not exist and the
            third had no `onPress`. */}
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

// `Bullet` and `OptionCard` went with their only call sites — the hardcoded
// "Pharmacy Instructions" list and the options bento. Leaving unreferenced
// components behind is how the next reader concludes the deletion was
// abandoned halfway.

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
