// Settings route — thin wrapper; the screen lives in the feature module (see
// SettingsScreen.tsx for why this is a page and not the popover it replaces).
//
// Reached from the patient app bar's avatar, which `PatientShell` now navigates
// here instead of opening `AccountMenu`.

import { SettingsScreen } from "@/features/settings/SettingsScreen";

export default function SettingsRoute() {
  return <SettingsScreen />;
}
