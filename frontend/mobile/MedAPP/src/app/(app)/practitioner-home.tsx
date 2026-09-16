import { PractitionerHomeScreen } from "@/features/practitioner/PractitionerHomeScreen";
import { ProfessionalAccess } from "@/features/practitioner/ProfessionalAccess";
export default function PractitionerHomeRoute() {
  return (
    <ProfessionalAccess doctorsOnly>
      <PractitionerHomeScreen />
    </ProfessionalAccess>
  );
}
