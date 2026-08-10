// Practitioner care-team room route — thin wrapper; the screen lives in the
// feature module (see PractitionerChatScreen.tsx for why it is a caller of
// ChatThreadScreen rather than a second chat screen).
//
// Reached from the practitioner Inbox. Figma 1057:1448.

import { PractitionerChatScreen } from "@/features/chat/PractitionerChatScreen";

export default function PractitionerChatRoute() {
  return <PractitionerChatScreen />;
}
