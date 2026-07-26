// Appointments (management) route — thin wrapper.
// Reached from BookingConfirmed → "View My Appointments" or from
// HomeScreen's "Upcoming Appointments" section header → "View All".

import { AppointmentManagementScreen } from "@/features/appointments/AppointmentManagementScreen";

export default function AppointmentsRoute() {
  return <AppointmentManagementScreen />;
}
