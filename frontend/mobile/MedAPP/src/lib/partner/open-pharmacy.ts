import type { RequestOptions } from '@/lib/api/client';
import { createPortalHandoff } from './browser-handoff';

const handoff = createPortalHandoff({
  endpoint: '/v1/auth/pharmacy-handoffs',
  storageKey: 'medapp-pharmacy-return',
  returnRoute: 'pharmacy-workspaces',
  origin: ({ portalOrigin }) => portalOrigin || '',
  label: 'pharmacy',
  pharmacyWorkspace: true,
});
export const openPharmacyPortal = (options: RequestOptions & {
  owner: string; pharmacyId: string; portalOrigin: string;
}) => handoff.openOnboarding(options);
export const consumeNativePharmacyReturn = handoff.consumeNativeOnboardingReturn;
export const consumeWebPharmacyReturn = handoff.consumeWebOnboardingReturn;
export const validatePharmacyLink = handoff.validateOnboardingLink;
export const validPharmacyReturn = handoff.validOnboardingReturn;
