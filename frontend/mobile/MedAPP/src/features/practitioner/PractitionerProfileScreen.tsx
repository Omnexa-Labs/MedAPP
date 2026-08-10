// Practitioner Profile — the clinician's OWN profile, and the tab that was dead.
//
// Figma: `practitioner_profile — listed` 1020:16094, with state frames
// `— not listed in Find Care` 1022:918 and `— account & sign out (scrolled)`
// 1022:16587 (page "Practitioner Shell" 1018:640).
//
// ---------------------------------------------------------------------------
// THIS IS NOT `practitioner-social-profile`, AND THE DISTINCTION IS THE POINT
// ---------------------------------------------------------------------------
// Two other screens have "practitioner profile" in their name and both are
// PATIENT-FACING views of a specialist:
//
//   practitioner-social-profile     reached from Explore / Community; renders a
//                                   seeded dietitian and her reviews
//   practitioner-telehealth-profile reached from Find Care; carries the
//                                   "Book appointment" dock
//
// This one is the clinician looking at themselves: their listing, their hours,
// their account. Nothing here is a booking surface, and the file exists partly
// so nobody "reuses" one of those two and quietly shows a doctor the marketing
// page patients see.
//
// ---------------------------------------------------------------------------
// WHY THE ACCOUNT SECTION IS HERE AND NOT BEHIND AN AVATAR
// ---------------------------------------------------------------------------
// PO ruling, 2026-08-05. `AccountMenu` was mounted only by `PatientShell`,
// behind the patient app bar's avatar; `PractitionerShell` never mounted it and
// `PractitionerAppBar` has no avatar slot. The consequence was not cosmetic:
// **a clinician could not sign out of MedApp at all**, and could not change
// appearance. The options were an avatar in the practitioner bar or the menu's
// contents on this screen. The PO chose this screen, so the bar keeps no avatar
// and `1022:16587` is the frame that proves the controls are reachable.
//
// `AccountMenu` is REUSED, not copied. It was parameterised for exactly this:
// `profileHref={null}` omits its Profile row — a link to "profile" from the
// profile screen is a loop — and `initialView` lets this screen open it
// directly. A second copy of a sign-out flow is how two audiences end up with
// two different confirmation semantics on a destructive action.
//
// ---------------------------------------------------------------------------
// DATA, AND THE ONE HONEST GAP
// ---------------------------------------------------------------------------
// `practitionerApi.findMyProfile` SCANS the doctor directory for the caller's
// `user_id` — there is no "my profile" endpoint. It passes `only_listable=false`
// deliberately: the default is `true`, so a clinician who has switched their
// listing off would vanish from their own profile screen, which is precisely
// the state 1022:918 exists to draw.
//
// The Find Care listing toggle writes through `setFindCareListing`, so it is a
// real mutation and not a local boolean. `1022:918` is what the off state looks
// like, and it is a real product state — not an error.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used, through the shell and AccountMenu.

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountMenu, PractitionerShell } from "@/components/shell";
import { AvatarWithFallback, Card, Icon } from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTokenColor } from "@/lib/tokens";
import { practitionerApi } from "./api";
import { consultationFee, initialsFor, weeklyHours } from "./format";

/** Matches the home screen's reserve; the tab bar is an overlay and claims no layout. */
const SCROLL_RESERVE = 120;

export function PractitionerProfileScreen() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [accountOpen, setAccountOpen] = useState(false);

  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");

  const profileQuery = useQuery({
    queryKey: ["practitioner", "profile", user?.id],
    queryFn: () => practitionerApi.findMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profile = profileQuery.data ?? null;

  const availabilityQuery = useQuery({
    queryKey: ["practitioner", "availability", profile?.doctorId],
    queryFn: () => practitionerApi.listAvailability(profile!.doctorId),
    enabled: Boolean(profile?.doctorId),
  });

  const listing = useMutation({
    mutationFn: (next: boolean) => practitionerApi.setFindCareListing(profile!.doctorId, next),
    // Refetch rather than patch the cache: `setFindCareListing` returns the
    // server's view of the profile, and the server is the one that decides
    // whether a listing actually took.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["practitioner", "profile"] });
    },
  });

  const hours = weeklyHours(availabilityQuery.data ?? []);
  const fee = consultationFee(profile?.consultationFeeCents);
  const displayName = profile?.name ?? user?.displayName ?? "Your profile";

  return (
    <PractitionerShell activeTab="profile" hideBack testID="practitioner-profile">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: SCROLL_RESERVE }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity */}
        <View className="items-center gap-sm">
          <AvatarWithFallback
            uri={profile?.photoUrl ?? null}
            initials={initialsFor(displayName)}
            label={displayName}
            size={96}
          />
          <Text className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
            {displayName}
          </Text>
          {profile?.specialty ? (
            <Text className="font-body-md text-body-md text-on-surface-variant">
              {profile.specialty}
            </Text>
          ) : null}
        </View>

        {profileQuery.isLoading ? (
          <View className="mt-lg items-center">
            <ActivityIndicator color={primary} />
          </View>
        ) : null}

        {/* Find Care listing — a real mutation, not a local toggle. */}
        <Card className="mt-lg gap-sm">
          <View className="flex-row items-center justify-between gap-sm">
            <View className="flex-1">
              <Text className="font-label-md text-label-md text-on-surface">Visible in Find Care</Text>
              <Text className="mt-xs font-body-sm text-body-sm text-on-surface-variant">
                {profile?.isListable
                  ? "Patients can find and book you."
                  : "You are hidden from search. Existing appointments are unaffected."}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Visible in Find Care"
              value={Boolean(profile?.isListable)}
              disabled={!profile || listing.isPending}
              onValueChange={(next) => listing.mutate(next)}
            />
          </View>
          {listing.isError ? (
            // Never leave the switch showing a state the server did not accept.
            <Text className="font-body-sm text-body-sm text-error">
              Could not update your listing. Try again.
            </Text>
          ) : null}
        </Card>

        {/* Practice */}
        <Text className="mt-lg font-headline-md text-headline-md text-on-surface">Practice</Text>
        <Card className="mt-sm gap-sm">
          {profile?.bio ? (
            <Text className="font-body-md text-body-md text-on-surface-variant">{profile.bio}</Text>
          ) : (
            <Text className="font-body-md text-body-md text-on-surface-variant">
              No bio yet.
            </Text>
          )}
          {fee ? <Row label="Consultation fee" value={fee} /> : null}
          {profile?.languages.length ? (
            <Row label="Languages" value={profile.languages.join(", ")} />
          ) : null}
        </Card>

        {/* Weekly hours */}
        <Text className="mt-lg font-headline-md text-headline-md text-on-surface">Weekly hours</Text>
        {/* `weeklyHours` returns the frame's ONE-LINE summary, not a day list —
            "Mon – Fri · 09:00–17:00", widening to a per-day list only when the
            days genuinely differ. That collapsing is the formatter's job and is
            argued in its docstring: a clinician must never be shown hours they
            do not keep, so a summary that cannot be honest becomes a list. */}
        <Card className="mt-sm gap-xs">
          {hours.label === null ? (
            <Text className="font-body-md text-body-md text-on-surface-variant">
              No availability set.
            </Text>
          ) : (
            <>
              <View className="flex-row items-start justify-between gap-sm">
                <Text className="flex-1 font-body-md text-body-md text-on-surface">
                  {hours.label}
                </Text>
                {hours.timezone ? (
                  <Text className="font-label-sm text-label-sm text-on-surface-variant">
                    {hours.timezone}
                  </Text>
                ) : null}
              </View>
              {hours.closedLabel ? (
                <Text className="font-body-sm text-body-sm text-on-surface-variant">
                  {hours.closedLabel}
                </Text>
              ) : null}
            </>
          )}
        </Card>

        {/* Account — the reason a clinician can sign out at all. */}
        <Text className="mt-lg font-headline-md text-headline-md text-on-surface">Account</Text>
        <Card className="mt-sm">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account settings"
            accessibilityHint="Appearance and sign out"
            onPress={() => setAccountOpen(true)}
            className="flex-row items-center justify-between gap-sm active:opacity-70"
            style={{ minHeight: 44 }}
          >
            <Text className="font-label-md text-label-md text-on-surface">
              Appearance and sign out
            </Text>
            <Icon chrome="chevron-right" size={24} color={onSurfaceVariant} />
          </Pressable>
        </Card>
      </ScrollView>

      {/* `profileHref={null}` OMITS the Profile row — linking to the profile from
          the profile screen is a loop. The component omits rather than disables
          it, which is why null is the right value and not a disabled flag. */}
      <AccountMenu
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        accountName={displayName}
        avatarUri={profile?.photoUrl ?? null}
        avatarInitials={initialsFor(displayName)}
        profileHref={null}
      />
    </PractitionerShell>
  );
}

/** Label/value pair. Local because it is three lines and used only here. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-sm">
      <Text className="font-body-sm text-body-sm text-on-surface-variant">{label}</Text>
      <Text className="flex-1 text-right font-body-md text-body-md text-on-surface">{value}</Text>
    </View>
  );
}
