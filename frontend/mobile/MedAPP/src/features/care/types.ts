// Shared types for the Find-Care surface.
//
// These were originally inline in FindCareScreen.tsx. Lifted here so
// `api.ts` adapters and `use-directory.ts` hooks return the same shape
// the screen renders, without circular imports.

import type { MaterialIcons } from "@expo/vector-icons";

export type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// `AvailabilityTone` and `PersonEntry.availability` are DELETED. Nothing in this
// system knows whether a clinician is online: there is no presence service, no
// last-seen column, and no field on any of the five directory responses that
// could stand in for one. Every adapter below hardcoded `availability: "online"`,
// so the card drew a green dot on every doctor, nurse and pharmacist in the
// directory and labelled it `"<name> is online"` for a screen reader — a live
// status claim about a real person, asserted by a constant. The two other tones
// were unreachable by construction. When a presence signal exists this type and
// the dot come back together; until then the card says nothing, which is what it
// knows. Logged in docs/api/README.md's gap register.

// `category` mirrors the main chip values so chip filtering is a
// simple equality check rather than parsing free-text fields. Keep
// it in sync with MAIN_CHIPS.value in FindCareScreen.
export type DirectoryCategory =
  | "doctors"
  | "nurses"
  | "hospitals"
  | "pharmacies"
  | "pharmacists";

export interface PersonEntry {
  kind: "person";
  category: DirectoryCategory;
  id: string;
  name: string;
  title: string;
  /**
   * `photo_url`, or `""` when the record has none. Empty means "no photo", NOT
   * "load this instead" — `AvatarWithFallback` draws initials for it. The
   * adapters used to substitute a stock photograph of a real stranger here.
   */
  avatarUri: string;
  /**
   * `consultation_fee_cents`, in MINOR UNITS, or null when the record sets no
   * fee. Null is "no fee recorded", which is NOT the same claim as a free
   * consultation, so a consumer omits the price rather than rendering zero.
   *
   * Doctors only today — `NurseWire.home_visit_fee_cents` is a different fee for
   * a different service and is not folded in here. There is no currency on the
   * wire; see `consultationFee` in features/practitioner/format.ts.
   */
  consultationFeeCents?: number | null;
  badges: { label: string; tone: "primary" | "secondary" | "tertiary" | "warn" }[];
}

export interface FacilityEntry {
  kind: "facility";
  category: DirectoryCategory;
  id: string;
  name: string;
  subtitle: string;
  icon: IconName;
  iconTint: "tertiary" | "secondary";
  badges: { label: string; tone: "open" | "tertiary" }[];
  cta: { label: string; color: "tertiary" | "info" };
}

export type DirectoryEntry = PersonEntry | FacilityEntry;
