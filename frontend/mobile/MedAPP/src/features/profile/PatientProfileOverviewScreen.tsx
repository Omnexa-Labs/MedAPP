// Patient Profile Overview — "Patient Profile Overview"
// (Figma file kRifcg1KCEAlTXy4aimotK, page "Patient Home", frame 261:387).
//
// Reached from the account menu via the header avatar — the shared BottomNav's
// 5 tabs are Home/Overview/Inbox/Community/Lifestyle and don't include a
// dedicated "Profile" tab.
//
// ============================================================================
// RULED (2026-08-05) — DetailShell, no bottom nav
// ============================================================================
// This is a DETAIL SCREEN. The ruling is the one made for
// `appointment_management` (PO 2026-08-01) and since applied to `find-care` —
// docs/PIPELINE.md §5. Frame 261:387's Body runs the full 2214px with no tab
// bar, and `Patient BottomTabBar` 740:1015 ships exactly five values with no way
// to name a sixth, so a bar here could only render a lie. `DetailShell` carries
// the back button.
//
// The AVATAR in the app bar goes with it: `Detail AppBar 193:120` has no avatar
// slot ("No logo — the logo belongs only on tab-root screens" applies to the
// whole tab-root lockup). No loss in function — the avatar was already
// deliberately non-pressable on this screen, because this IS the profile — and
// the 128px patient avatar in the body is the real one.
//
// ============================================================================
// THE FICTIONAL PATIENT IS GONE (2026-08-08)
// ============================================================================
// This screen showed the SIGNED-IN USER'S NAME at the top of a record that
// belonged to nobody. `displayName` came from the auth store; everything under
// it was a constant:
//
//   Patient ID MED-208471 · jordan.davis@email.com (with a "Verified" badge)
//   · +1 (555) 219-3847 · 482 Maple Grove Lane, Austin, TX · DOB March 14, 1991
//   · Sex Male · Age 34 yrs · Weight 72 kg · BLOOD TYPE O+
//   · PCP "Dr. Sarah Chen", Family Medicine
//   · Emergency contact "Maria Davis", Spouse, +1 (555) 738-2910
//   · a week of Steps / Heart Rate trend lines and "15% more active this week"
//
// Two of those are worse than the rest and are why this could not wait:
//
//   1. THE EMERGENCY CONTACT PHONE WAS A LIVE `tel:` LINK. A user in a real
//      emergency taps the one control on this screen that has to work and
//      dials a 555 number that reaches nobody. Deleted first.
//   2. BLOOD TYPE "O+" was rendered beside the user's real name. A blood type
//      has transfusion consequences and this one was picked by a designer.
//
// There is no profile/demographics endpoint anywhere in the product —
// `user_service` `/v1/me` carries id, email, display name and avatar, and
// `ehr_service` has no demographics on `PatientOut` either (docs/api/*.md). So
// these cannot be made real, and the rule is that a fabrication is deleted
// rather than dressed up. What remains is exactly what the app actually knows
// about the person signed in, plus a plain statement of what it does not hold.
//
// Removed with them, because they were controls attached to the fiction:
//   * "Share Records" and "Edit Profile", both `onPress={() => {}}` — there is
//     no share destination and no edit flow, and they sat above a record that
//     was not the user's to edit.
//   * the camera "Change profile photo" FAB, which had no `onPress` at all.
//   * the dual-line Health Trends chart and its "15% more active" claim, which
//     were normalised constants with no unit and no source.
// All recorded in docs/api/README.md's gap register.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here. None beyond expo-router; expo-status-bar moved into the
// shell along with the safe-area handling.

import { ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { AvatarWithFallback, Button, Card, InfoCallout } from "@/components/ui";
import { DetailShell } from "@/components/shell";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

/** First letters of the display name, for AvatarWithFallback's middle rung. */
function initialsOf(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function PatientProfileOverviewScreen() {
  const user = useCurrentUser();
  const displayName = user?.displayName?.trim();
  const email = user?.email?.trim();
  const onSurface = useTokenColor("on-surface");
  const errorColor = useTokenColor("error");

  return (
    /* DetailShell owns the safe area, the StatusBar and the bar (Figma 193:120).

       No `onBack`. The one inbound path is the account menu, which reaches this
       screen with `router.navigate` — that pushes when the route is not already in
       history, so `router.back()` returns the user to the tab root they opened the
       menu from. On a cold link with no history DetailAppBar's default no-ops
       rather than throwing, and a fallback href is deliberately not invented here:
       every tab root can reach this screen, so there is no single "up". */
    <DetailShell title="Profile">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="gap-xs">
          <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            Patient Profile
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            What MedApp knows about your account
          </Text>
        </View>

        {/* Account card — the two fields the product actually stores.
            The photo is the user's own or their initials or a silhouette;
            AvatarWithFallback walks that ladder itself. */}
        <Card className="mt-md items-center gap-md">
          <AvatarWithFallback
            size={128}
            initials={initialsOf(displayName)}
            label={displayName ?? "Your profile"}
            uri={user?.avatarUrl}
          />

          <View className="items-center gap-1">
            <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              {displayName ?? "Your profile"}
            </Text>
            {/* No "Verified" badge. Nothing in `user_service` reports an email
                verification state, so the badge was a trust claim the backend
                never made. */}
            {email ? (
              <Text className="font-body-md text-body-md text-on-surface-variant">{email}</Text>
            ) : null}
          </View>
        </Card>

        {/* What is NOT here, said plainly.
            This is the whole of the "gate it behind an unmissable treatment"
            option, chosen over rendering greyed sample values: a demographics
            row with a placeholder in it is still a demographics row, and the
            one field that matters most (blood type) is exactly the one a reader
            would trust a placeholder for. */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="badge" size={20} color={onSurface} />
            <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Health record
            </Text>
          </View>
          <InfoCallout>
            MedApp doesn&apos;t hold your date of birth, blood type, weight, address or phone
            number yet. Your care team keeps those in their own records — ask them if you need to
            check or correct anything.
          </InfoCallout>
        </Card>

        {/* Primary Care — an honest absence plus the one route that works. */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="medical-services" size={20} color={onSurface} />
            <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Primary Care
            </Text>
          </View>

          <EmptyRow
            icon="person-off"
            text="No primary care provider is linked to your account."
          />

          {/* Was `push("/(app)/select-time-slot")` with NO params. SelectTimeSlot
              resolves its grid from `params.practitionerId`, so that CTA reliably
              landed on the empty/no-slots state. Routed to the directory instead:
              pick a provider, THEN a slot, which is the order select-time-slot's
              own params require. */}
          <Button
            label="Find a provider"
            variant="secondary"
            size="docked"
            pill={false}
            shadow={false}
            leadingIcon="calendar-today"
            onPress={() => router.push("/(app)/find-care" as Href)}
          />
        </Card>

        {/* Emergency Contact.
            Kept as its own card, rather than folded into the callout above, and
            deliberately loud: a user who believed a contact was stored here has
            to find out NOW and not while they need it. There is no `tel:` link
            on this screen any more — see the head of this file. */}
        <Card className="mt-md gap-md">
          <View className="flex-row items-center gap-sm">
            <MaterialIcons name="warning" size={20} color={errorColor} />
            <Text className="flex-1 font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Emergency Contact
            </Text>
          </View>

          <View className="w-full gap-xs rounded-2xl border border-error-container/50 bg-error-container/20 p-md">
            <Text className="font-body-md text-body-md text-on-surface">
              No emergency contact is saved.
            </Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              MedApp can&apos;t store one yet, and it will not call anyone on your behalf. Keep the
              number you would want used in your phone&apos;s own emergency contacts.
            </Text>
          </View>
        </Card>
      </ScrollView>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
//
// `StatTile`, `IconInfoRow`, `LegendDot` and `HealthTrendChart` went with the
// data they existed to draw — the Age/Blood/Weight strip, the DOB/Sex rows and
// the two-series sparkline. `react-native-svg` is no longer imported here.

function EmptyRow({ icon, text }: { icon: IconName; text: string }) {
  const glyph = useTokenColor("on-surface-variant");
  return (
    <View className="w-full flex-row items-center gap-md rounded-2xl bg-background p-md">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-container">
        <MaterialIcons name={icon} size={18} color={glyph} />
      </View>
      <Text className="flex-1 font-body-md text-body-md text-on-surface-variant">{text}</Text>
    </View>
  );
}
