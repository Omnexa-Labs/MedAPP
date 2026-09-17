/** Web has no native push registration. */
export async function pushToken(_ask: boolean): Promise<string | null> {
  throw new Error("Device reminders are available in the MedApp Android or iOS app.");
}
export async function clearReminderNotifications(): Promise<void> {}
export function listenForReminders(
  _open: () => void,
  _renew: () => void,
  _signedIn: () => boolean,
) {
  return () => {};
}
