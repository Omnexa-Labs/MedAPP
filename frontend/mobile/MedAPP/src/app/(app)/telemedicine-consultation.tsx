// Telemedicine consultation route — thin wrapper.
// Reached from WaitingRoom once the doctor joins the call.
// Accepts optional ?doctorName=&doctorSpecialty=&doctorAvatar= params.

import { TelemedicineConsultationScreen } from "@/features/telehealth/TelemedicineConsultationScreen";

export default function TelemedicineConsultationRoute() {
  return <TelemedicineConsultationScreen />;
}
