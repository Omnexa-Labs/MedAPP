// Chat thread route — thin wrapper.
// Reached from InboxScreen (conversation tap) or
// PractitionerSocialProfileScreen ("Message" button).
// Accepts optional ?name=&role=&avatar= search params for personalisation.

import { ChatThreadScreen } from "@/features/chat/ChatThreadScreen";

export default function ChatThreadRoute() {
  return <ChatThreadScreen />;
}
