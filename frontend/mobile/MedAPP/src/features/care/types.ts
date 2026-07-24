// Shared types for the Find-Care surface.
//
// These were originally inline in FindCareScreen.tsx. Lifted here so
// `api.ts` adapters and `use-directory.ts` hooks return the same shape
// the screen renders, without circular imports.

import type { MaterialIcons } from "@expo/vector-icons";

export type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

export type AvailabilityTone = "online" | "busy" | "away";

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
  avatarUri: string;
  availability: AvailabilityTone;
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
