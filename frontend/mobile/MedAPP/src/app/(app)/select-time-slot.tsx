// Select Time & Consultation Type route — thin wrapper.
// Reached from any "Book Appointment" CTA. Accepts optional
// ?practitionerName=&practitionerSpecialty=&practitionerAvatar= params.

import { SelectTimeSlotScreen } from "@/features/booking/SelectTimeSlotScreen";

export default function SelectTimeSlotRoute() {
  return <SelectTimeSlotScreen />;
}
