// Review Appointment route — thin wrapper.
// Reached from SelectTimeSlot → "Book Now". Confirm advances to
// BookingConfirmed; Edit / Cancel return to the previous step.

import { ReviewAppointmentScreen } from "@/features/booking/ReviewAppointmentScreen";

export default function ReviewAppointmentRoute() {
  return <ReviewAppointmentScreen />;
}
