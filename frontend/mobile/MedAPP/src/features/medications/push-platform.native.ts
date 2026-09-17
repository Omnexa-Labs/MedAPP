import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

export async function pushToken(ask: boolean): Promise<string | null> {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!Device.isDevice || Constants.appOwnership === "expo" || !projectId)
    throw new Error(
      "Device reminders are not available in this app build yet. You can still use your saved tracker.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("medication-reminders", {
      name: "Medication reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && ask && permission.canAskAgain)
    permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function clearReminderNotifications() {
  const delivered = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    delivered
      .filter((n) => n.request.content.data?.kind === "medication_reminder")
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

export function listenForReminders(open: () => void, renew: () => void, signedIn: () => boolean) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const show = signedIn() && notification.request.content.data?.kind === "medication_reminder";
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
  let lastId = "",
    alive = true;
  const receive = (response: Notifications.NotificationResponse | null) => {
    if (
      !alive ||
      !response ||
      response.notification.request.content.data?.kind !== "medication_reminder"
    )
      return;
    const id = response.notification.request.identifier;
    if (lastId === id) return;
    lastId = id;
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (signedIn()) open();
  };
  const taps = Notifications.addNotificationResponseReceivedListener(receive);
  const tokens = Notifications.addPushTokenListener(() => renew());
  void Notifications.getLastNotificationResponseAsync()
    .then(receive)
    .catch(() => {});
  return () => {
    alive = false;
    taps.remove();
    tokens.remove();
    Notifications.setNotificationHandler(null);
  };
}
