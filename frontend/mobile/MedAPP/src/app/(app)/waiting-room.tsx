// Waiting room route — thin wrapper.
// Reached from any "Join Call" CTA. Accepts optional
// ?doctorName=&doctorSpecialty=&doctorAvatar= params.

import { WaitingRoomScreen } from "@/features/telehealth/WaitingRoomScreen";

export default function WaitingRoomRoute() {
  return <WaitingRoomScreen />;
}
