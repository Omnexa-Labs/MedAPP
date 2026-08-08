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
// ============================================================================
// "SEND NOW" NEVER SENT ANYTHING — the whole Quick Send section is deleted
// ============================================================================
// The pharmacy rows ran a `setTimeout(…, 1500)` and then opened a modal that
// said "Your prescription has been securely transmitted to the pharmacy. You
// will receive a notification when it's ready for pickup." There was no request,
// no pharmacy integration, no notification pipeline and no failure branch — a
// patient who tapped it was told their script was waiting for them somewhere it
// had never been sent, and delay in dispensing an antihypertensive is direct
// clinical harm. The two pharmacies were constants besides ("CVS Pharmacy",
// "Walgreens" — US chains, "0.8 miles away", in a Ghana-seeded product), and
// "View Nearby" had no `onPress`.
//
// Nothing takes its place but a statement that the capability does not exist,
// which is the treatment PatientRecordScreen's ActionInfoSheet already uses for
// clinician workflows that are not connected. `pharmacy_service` is a DIRECTORY
// (docs/api/directory_services.md); there is no route anywhere in the product
// that transmits a prescription to one. Recorded in docs/api/README.md.
//
// ============================================================================
// THE SECURITY CLAIMS AND THE "ONE-TIME" QR ARE DELETED TOO
// ============================================================================
//   * "HIPAA Compliant • 256-bit AES Encryption • Clinical Grade Security" —
//     an unbacked regulatory assertion in shipped UI.
//   * the "one-time", "temporary, encrypted" QR: a STATIC remote PNG on
//     lh3.googleusercontent.com, identical bytes for every user and every script
//     forever, under a live 5:00 countdown and an "IDENTITY VERIFIED" badge.
//     The countdown was the only real thing in the dialog and it counted down a
//     code that never expired.
//   * the "SECURE SCRIPT" lock chip and the app bar's "Verified script" tick.
//   * the app bar's profile <Image>, a second remote Google-CDN asset — and
//     removing both stops this screen making outbound requests to a third-party
//     CDN while it displays prescription data.
// The sibling ActiveScriptViewScreen deleted the matching set; the two agree.
//
// "Print Script" and "Copy Clinical Link" went with them: both were Pressables
// with no `onPress`, and a row of dead controls under a heading that promises
// options is the same defect at lower stakes. Download is what remains, and it
// is real — a text file through @/lib/documents, labelled with the extension it
// actually produces because there is no PDF generator in this project.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Toast, useToast } from "@/components/feedback";
import { Card, ErrorPanel, InfoCallout } from "@/components/ui";
import {
  buildPrescriptionDocument,
  describeSaveResult,
  formatDocumentTimestamp,
  prescriptionFileName,
  saveTextDocument,
} from "@/lib/documents";
import { useTokenColor } from "@/lib/tokens";

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
// The two LinearGradients are gone with the surfaces they filled.
//
// `pillGradient` filled the "Send Now" pill and the success dialog's Done
// button; `heroGradient` filled the one-time-QR hero panel. Both were carefully
// retokenised in an earlier dark-mode pass — the reasoning is preserved here
// because it is the only record of it, and because the next teal ramp on this
// screen will need it:
//
//   Neither ramp can be expressed as a straight `primary → primary-container`
//   pair. M3 tones those two in OPPOSITE directions between modes (primary
//   40→80 goes light, primary-container 30 goes dark), so the honest-looking
//   pair produces a mint-to-deep-teal ramp in dark with no single label colour
//   that reads across it, and there is no "gradient/*" token in docs/BRAND.md.
//   Each ramp was therefore derived from ONE token plus its own tone step.
//
// `expo-linear-gradient` is no longer imported here at all.
// ---------------------------------------------------------------------------

/** See the twin in ActiveScriptViewScreen — a param that is actually there. */
function text(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

export function ActiveScriptShareScreen() {
  const params = useLocalSearchParams<{
    drug?: string;
    patient?: string;
    scriptId?: string;
    prescriber?: string;
    issuedDate?: string;
  }>();

  // Five `?? "<clinical constant>"` fallbacks used to sit here, kept in sync
  // with ActiveScriptViewScreen's thirteen by a comment. Both sets are deleted:
  // a share screen that invents the patient and the drug when the link is
  // partial is a screen that offers to send a fabricated record onward.
  const drug = text(params.drug);
  const patient = text(params.patient);
  const scriptId = text(params.scriptId);
  const prescriber = text(params.prescriber);
  const issuedDate = text(params.issuedDate);

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

  // The one glyph colour the surviving content needs, by ROLE. The rest of
  // the palette this screen resolved (`on-primary`, `on-primary-container`,
  // `on-primary-fixed-variant`, `scrim`, the hero blob, `outline`) went with the
  // pill, the hero, the two dialogs and the HIPAA footer.
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  if (!drug || !patient || !scriptId || !prescriber || !issuedDate) {
    return (
      <DetailShell title="Share Prescription">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: SCROLL_RESERVE,
            paddingTop: 24,
            flexGrow: 1,
            justifyContent: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* `no-identifier` and no `action` — see the twin panel in
              ActiveScriptViewScreen for both. The body carries one clause the
              twin does not: a share screen has to say that nothing went out. */}
          <ErrorPanel
            testID="script-not-found"
            unrecoverable="no-identifier"
            title="We can't share this prescription"
            body="The link you followed is missing the details of the script. Nothing has been shared. Open it again from your medications so the right record is loaded."
          />
        </ScrollView>
      </DetailShell>
    );
  }

  return (
    // No app-bar action slot: it carried a "Verified script" tick and a remote
    // profile photo. See the head of this file.
    <DetailShell title="Share Prescription">
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
            {/* The "SECURE SCRIPT" padlock chip that sat here is deleted. */}
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

        {/* Send to a pharmacy — stated as unavailable, because it is.
            This replaces the Quick Send list and its fake transmission (see the
            head of this file). It is a statement, not a control: there is no
            disabled button here either, because a greyed "Send Now" still tells
            the patient the product can do this and is merely busy. */}
        <View className="mt-lg">
          <Text className="font-headline-md text-headline-md mb-sm text-on-surface">
            Sending to a pharmacy
          </Text>
          <InfoCallout icon="local-pharmacy">
            MedApp can&apos;t send prescriptions to a pharmacy yet. Save a copy below and take it
            with you, or ask your prescriber to send it directly.
          </InfoCallout>
        </View>

        {/* Download — the one control on this screen that does what it says.
            "Print Script" and "Copy Clinical Link" sat beside it with no
            `onPress`, and the "HIPAA Compliant • 256-bit AES Encryption • Clinical
            Grade Security" footer sat under all three. All three are deleted. */}
        <View className="mt-lg">
          <Text className="font-headline-md text-headline-md mb-sm text-on-surface">
            Save a copy
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
          </View>
          <Text className="font-label-sm text-label-sm mt-sm text-outline">
            A patient copy for your own records. It is not signed and is not a dispensable
            prescription.
          </Text>
        </View>
      </ScrollView>

      {/* Download outcome. Sibling of the ScrollView inside DetailShell, which is
          where the view screen's toast sits too — 30 clears the shell's bottom
          inset, and a detail screen has no BottomNav to clear. */}
      <Toast message={toastMessage} tone={toastTone} onDismiss={clearToast} bottom={30} />

      {/* Both <Modal> dialogs are gone: the "Script Sent!" success sheet, which
          announced a transmission that never happened, and the one-time-QR
          dialog with its static image, live countdown and IDENTITY VERIFIED
          badge. */}
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
 * One caller now, where there were three. The two that passed no `onPress` at
 * all ("Print Script", "Copy Clinical Link") are deleted rather than left
 * visible: the flag that used to stand here had been carried for long enough.
 * The component stays generic because the next real option will use it.
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
// §Elevation. `appBarShadow` went earlier with the hand-rolled app bar. The
// two <Modal> dialogs that were the only floating surfaces left are deleted, so
// there is nothing on this screen that could claim an effect.
// ---------------------------------------------------------------------------
