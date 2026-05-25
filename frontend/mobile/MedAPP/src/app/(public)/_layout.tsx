// Public route group: splash + auth screens. No tabs, no header.

import { Stack } from "expo-router";

export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
