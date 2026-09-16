import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell/DetailShell";
import { Badge, Button, Card, EmptyState, ErrorPanel, InfoCallout } from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAuthStore } from "@/store/auth-store";
import { useTokenColor } from "@/lib/tokens";
import { ApiError } from "@/types/api";
import { sessionsApi, sessionDeviceLabel, type AccountSession } from "./sessions-api";

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

export function ActiveSessionsScreen() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const key = ["account-sessions", user?.id];
  const sessions = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => sessionsApi.list(pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.next_offset ?? undefined,
    enabled: !!user?.id,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState<AccountSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    setSelected(null);
    setError(null);
    setNotice(null);
  }, [user?.id]);
  const primary = useTokenColor("primary");
  const scrim = useTokenColor("scrim", 0.4);
  const page = sessions.data?.pages[0];
  const items = [
    ...new Map(
      sessions.data?.pages.flatMap((p) => p.items).map((item) => [item.id, item]) ?? [],
    ).values(),
  ];
  const delay = Math.ceil((page?.sign_out_delay_seconds ?? 0) / 60);
  const delayMessage =
    delay > 0
      ? `Sign-out on other devices can take up to ${delay} ${delay === 1 ? "minute" : "minutes"}.`
      : "Signed-out sessions cannot renew access.";

  async function revoke() {
    if (!selected || inFlight.current) return;
    const target = selected;
    const owner = user?.id;
    const session = useAuthStore.getState();
    if (!owner || session.user?.id !== owner || !session.isAuthenticated) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await sessionsApi.revoke(target.id);
      const current = useAuthStore.getState();
      if (current.user?.id !== owner || !current.isAuthenticated) return;
      if (result.current_session_revoked) {
        await current.signOut();
        if (useAuthStore.getState().isAuthenticated) return;
        queryClient.clear();
        router.replace("/(public)/sign-in" as Href);
        return;
      }
      queryClient.setQueryData<typeof sessions.data>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                items: p.items.filter((item) => item.id !== target.id),
              })),
            }
          : data,
      );
      setSelected(null);
      setNotice(`Session signed out. ${delayMessage}`);
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setError(
        err instanceof ApiError && err.isNetwork
          ? "Couldn't sign out this session. Check your connection and try again."
          : "Couldn't sign out this session. Try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <DetailShell
      title="Active sessions"
      testID="active-sessions"
      onBack={() => {
        if (inFlight.current) return;
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/security-privacy" as Href);
      }}
    >
      <ScrollView contentContainerClassName="gap-md p-md" keyboardShouldPersistTaps="handled">
        <Text className="font-body-md text-body-md text-on-surface-variant">
          Review where you're signed in. Sign out a session you no longer use or don't recognize.
        </Text>
        {page ? <InfoCallout>{delayMessage}</InfoCallout> : null}
        {page && !page.current_session_known ? (
          <InfoCallout>
            This older sign-in doesn't identify the current session. Sign in again to see its
            marker.
          </InfoCallout>
        ) : null}
        {notice ? (
          <View accessibilityLiveRegion="polite">
            <InfoCallout>{notice}</InfoCallout>
          </View>
        ) : null}
        {sessions.isPending ? (
          <View accessibilityLiveRegion="polite" className="gap-md">
            <ActivityIndicator color={primary} />
            <Text className="font-body-md text-body-md text-on-surface">Loading sessions…</Text>
          </View>
        ) : null}
        {sessions.isError ? (
          <ErrorPanel
            title="Couldn't load your sessions"
            body="Check your connection and try again."
            retry={() => sessions.refetch()}
          />
        ) : null}
        {!sessions.isPending && !sessions.isError && items.length === 0 ? (
          <EmptyState
            title="No active sessions"
            body="There are no sessions that can renew access for this account."
          />
        ) : null}
        {items.map((item) => (
          <Card key={item.id} className="gap-md" testID={`session-${item.id}`}>
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="font-headline-md text-headline-md text-on-surface">
                {sessionDeviceLabel(item)}
              </Text>
              {item.is_current ? <Badge label="Current session" tone="success" /> : null}
            </View>
            <View className="gap-1">
              <Text className="font-body-md text-body-md text-on-surface">
                Signed in: {displayDate(item.started_at)}
              </Text>
              <Text className="font-body-md text-body-md text-on-surface-variant">
                Session updated: {displayDate(item.last_refreshed_at)}
              </Text>
              <Text selectable className="font-body-md text-body-md text-on-surface-variant">
                IP address: {item.ip_address || "Unavailable"}
              </Text>
            </View>
            <Button
              label={item.is_current ? "Sign out this session" : "Sign out session"}
              accessibilityLabel={`Sign out ${item.is_current ? "current session" : sessionDeviceLabel(item)}`}
              variant="outline"
              pill={false}
              shadow={false}
              disabled={busy}
              onPress={() => {
                setError(null);
                setSelected(item);
              }}
            />
          </Card>
        ))}
        {sessions.hasNextPage ? (
          <Button
            label="Load more sessions"
            variant="outline"
            pill={false}
            shadow={false}
            loading={sessions.isFetchingNextPage}
            disabled={sessions.isFetchingNextPage || busy}
            onPress={() => {
              void sessions.fetchNextPage();
            }}
          />
        ) : null}
        {page ? (
          <Button
            label="Refresh sessions"
            variant="ghost"
            disabled={sessions.isFetching || busy}
            onPress={() => {
              setNotice(null);
              void sessions.refetch();
            }}
          />
        ) : null}
      </ScrollView>
      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        <View className="flex-1 justify-center p-md" style={{ backgroundColor: scrim }}>
          <Card className="gap-md" accessibilityViewIsModal>
            <Text
              accessibilityRole="header"
              className="font-headline-md text-headline-md text-on-surface"
            >
              Sign out this session?
            </Text>
            <Text className="font-body-md text-body-md text-on-surface-variant">
              {selected?.is_current
                ? "You will return to the sign-in screen on this device."
                : `${selected ? sessionDeviceLabel(selected) : ""}. ${delayMessage}`}
            </Text>
            {error ? (
              <View accessibilityRole="alert">
                <InfoCallout tone="error">{error}</InfoCallout>
              </View>
            ) : null}
            <Button
              label="Keep session"
              variant="outline"
              pill={false}
              shadow={false}
              disabled={busy}
              onPress={() => setSelected(null)}
            />
            <Button
              label="Confirm sign out"
              pill={false}
              shadow={false}
              loading={busy}
              disabled={busy}
              onPress={revoke}
            />
          </Card>
        </View>
      </Modal>
    </DetailShell>
  );
}
