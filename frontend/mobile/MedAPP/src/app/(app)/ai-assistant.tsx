// AI Assistant route — thin wrapper; screen lives in feature.
// Pushed from HomeScreen's MedAI hero card → "Talk to MedAI".

import { AiAssistantScreen } from "@/features/chat/AiAssistantScreen";

export default function AiAssistantRoute() {
  return <AiAssistantScreen />;
}
