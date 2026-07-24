// Booking Confirmed route — thin wrapper.
// Reached from ReviewAppointment → "Confirm Booking". Close returns to
// Home; "View My Appointments" routes to /(app)/appointments.

import { BookingConfirmedScreen } from "@/features/booking/BookingConfirmedScreen";

export default function BookingConfirmedRoute() {
  return <BookingConfirmedScreen />;
}
