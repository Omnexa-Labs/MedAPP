// Single source of truth for "who can do what" in MedApp mobile.
//
// Capability checks go through hooks/use-capability.ts; UI gates go through
// components/gating/. Adding a new capability is one entry here — not a
// search-and-replace across screens.

import type { PartnerKind, Role } from "@/types/user";

export type Capability =
  | "browseContent"          // read channels, blog posts, practitioner profiles
  | "useMedicalChat"         // chat with the medical AI
  | "syncWearables"          // pair + sync wearable devices
  | "subscribeToChannel"     // follow a channel
  | "commentOnPost"          // comment on blog posts
  | "applyToBecomePartner"   // open the partner onboarding web flow
  | "authorChannel"          // create + manage health channels
  | "publishBlogPost"        // publish long-form content
  | "managePractitionerProfile" // public practitioner profile + availability
  | "acceptConsultation"     // appear in patient consultation queue
  | "managePharmacyListing"  // pharmacy directory + product catalog
  | "manageHospitalListing"; // hospital directory + department info

interface CapabilityContext {
  role: Role;
  partnerKind?: PartnerKind;
}

// Capabilities every authenticated user has, regardless of partner status.
const USER_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "browseContent",
  "useMedicalChat",
  "syncWearables",
  "subscribeToChannel",
  "commentOnPost",
  "applyToBecomePartner",
]);

// Guests can browse but can't act on content.
const GUEST_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "browseContent",
]);

// Partner-kind-specific capabilities, stacked on top of USER_CAPABILITIES.
const PARTNER_CAPABILITIES_BY_KIND: Record<PartnerKind, ReadonlySet<Capability>> = {
  practitioner: new Set<Capability>([
    "authorChannel",
    "publishBlogPost",
    "managePractitionerProfile",
    "acceptConsultation",
  ]),
  pharmacy: new Set<Capability>([
    "authorChannel",
    "publishBlogPost",
    "managePharmacyListing",
  ]),
  hospital: new Set<Capability>([
    "authorChannel",
    "publishBlogPost",
    "manageHospitalListing",
  ]),
};

export function hasCapability(capability: Capability, ctx: CapabilityContext): boolean {
  if (ctx.role === "guest") return GUEST_CAPABILITIES.has(capability);
  if (USER_CAPABILITIES.has(capability)) return true;
  if (ctx.role === "partner" && ctx.partnerKind) {
    return PARTNER_CAPABILITIES_BY_KIND[ctx.partnerKind].has(capability);
  }
  return false;
}

export function capabilitiesFor(ctx: CapabilityContext): Capability[] {
  if (ctx.role === "guest") return [...GUEST_CAPABILITIES];
  const base = [...USER_CAPABILITIES];
  if (ctx.role === "partner" && ctx.partnerKind) {
    return [...base, ...PARTNER_CAPABILITIES_BY_KIND[ctx.partnerKind]];
  }
  return base;
}
