import { config } from "@/lib/config";
import { createPortalHandoff } from "./browser-handoff";
const handoff = createPortalHandoff({
  endpoint: "/v1/auth/partner-handoffs",
  storageKey: "medapp-partner-return",
  returnRoute: "onboarding-status",
  origin: () => config.partnerOnboardingUrl,
  label: "onboarding",
  applicationDetails: true,
});
export const openOnboarding = handoff.openOnboarding;
export const consumeNativeOnboardingReturn = handoff.consumeNativeOnboardingReturn;
export const consumeWebOnboardingReturn = handoff.consumeWebOnboardingReturn;
export const validateOnboardingLink = handoff.validateOnboardingLink;
export const validOnboardingReturn = handoff.validOnboardingReturn;
