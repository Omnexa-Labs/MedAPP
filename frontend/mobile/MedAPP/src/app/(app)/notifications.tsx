// Notifications route — thin wrapper; the screen lives in the feature module.
// Figma 1073:1433. Reached from the patient app bar's bell.

import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";

export default function NotificationsRoute() {
  return <NotificationsScreen />;
}
