import { ActivityIndicator, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell/DetailShell";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { authApi, type UpdateProfilePayload } from "@/features/auth/api";
import { EditPatientProfileScreen } from "@/features/profile/EditPatientProfileScreen";
import { useAuthStore } from "@/store/auth-store";
import { useTokenColor } from "@/lib/tokens";

function backToProfile() {
  if (router.canGoBack()) router.back();
  else router.replace("/(app)/patient-profile-overview" as Href);
}

export default function EditPatientProfileRoute() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const primary = useTokenColor("primary");
  const queryKey = ["patient-profile-editor", userId];
  const profile = useQuery({
    queryKey,
    queryFn: () => authApi.me(),
    enabled: !!userId,
    // Fetch the actual name parts before editing. A display name cannot be
    // split reliably. Background refetches must not replace an open draft.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  async function save(changes: UpdateProfilePayload) {
    const session = useAuthStore.getState();
    if (!session.isAuthenticated || session.user?.id !== userId) throw new Error("Session changed");
    const updated = await authApi.updateProfile(changes);
    const current = useAuthStore.getState();
    // A delayed response must never replace a different signed-in patient's
    // identity, or restore personal data after sign-out.
    if (!current.isAuthenticated || current.user?.id !== userId || updated.id !== userId) {
      throw new Error("Session changed");
    }
    current.setUser(updated);
    queryClient.setQueryData(queryKey, updated);
    return updated;
  }

  if (
    profile.data &&
    profile.data.id === userId &&
    profile.isFetchedAfterMount &&
    !profile.isError
  ) {
    return (
      <EditPatientProfileScreen
        key={userId}
        user={profile.data}
        onSave={save}
        onBack={backToProfile}
      />
    );
  }
  return (
    <DetailShell title="Edit profile" onBack={backToProfile}>
      <View className="gap-md p-md">
        {profile.isError ? (
          <ErrorPanel
            title="Couldn't load your profile"
            body="Check your connection and try again before editing your details."
            retry={() => profile.refetch()}
          />
        ) : (
          <View accessibilityLiveRegion="polite" className="gap-md">
            <ActivityIndicator color={primary} />
            <Text className="font-body-md text-body-md text-on-surface">Loading your profile…</Text>
          </View>
        )}
      </View>
    </DetailShell>
  );
}
