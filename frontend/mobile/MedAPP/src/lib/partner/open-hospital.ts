import { config } from "@/lib/config";
import { createPortalHandoff } from "./browser-handoff";
const handoff = createPortalHandoff({
  endpoint: "/v1/auth/hospital-handoffs",
  storageKey: "medapp-hospital-return",
  returnRoute: "hospital-workspaces",
  origin: () => config.hospitalPortalUrl,
  label: "hospital",
});
export const openHospitalPortal = handoff.openOnboarding;
export const consumeNativeHospitalReturn = handoff.consumeNativeOnboardingReturn;
export const consumeWebHospitalReturn = handoff.consumeWebOnboardingReturn;
export const validateHospitalLink = handoff.validateOnboardingLink;
export const validHospitalReturn = handoff.validOnboardingReturn;
