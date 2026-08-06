// Barrel for the presentation primitives. Import from "@/components/ui".
export { Button, type ButtonVariant, type ButtonSize } from "./Button";
export { Card } from "./Card";
export { Input, type InputProps } from "./Input";
// A labelled clinical measurement (Figma `VitalStatCard` 211:241). The ONE
// definition — six private copies of it had drifted on slot order, on the value
// size, and on the abnormal tint (one of them a typo'd `#171c1c`).
export {
  VitalStatCard,
  type VitalStatCardProps,
  type VitalStatTone,
  type VitalStatTrend,
} from "./VitalStatCard";
// The ONE screen search row (Figma 396:538) — a composition over Input, not a
// second field. Replaces the bare <TextInput> rows in FindCare, Explore,
// CommunityHub, Inbox and PhoneField's country picker.
export { SearchField, type SearchFieldProps } from "./SearchField";
export { Badge, type BadgeTone } from "./Badge";
// The ONE selectable pill (Figma 11:104). Replaces ten private chip
// implementations across eight screens — every one of them under the 44pt floor.
export {
  ChoiceChip,
  ChoiceChipRow,
  type ChoiceChipProps,
  type ChoiceChipRowProps,
} from "./ChoiceChip";
// Checkbox + wrapping label, aligned to the label's FIRST line. Replaces the
// hand-rolled consent/remember-me rows in the auth screens.
export { ConsentRow } from "./ConsentRow";
// Third-party BRAND marks (Google, Apple) — deliberately NOT in the Health Icons
// registry, which is the clinical vocabulary. See src/components/ui/brand/.
export { BrandMark, type BrandMarkName } from "./brand/BrandMark";
export { Logo, type LogoVariant } from "./Logo";
export { AvatarWithFallback, type AvatarTone } from "./AvatarWithFallback";
export { AppearanceSelector } from "./AppearanceSelector";
// Replaces KeyboardAvoidingView, which cannot work under Android edge-to-edge.
export { KeyboardInset } from "./KeyboardInset";
// -- Booking flow (Figma page 144:107). Eight shared components the frames
// instance; every one of them replaces a private copy in 2+ screens.
// "Who you are booking with" (Figma 780:5363) — the ONE practitioner row. The
// three booking screens each drew it separately, at 80/88/64 on a bare <Image>
// with no fallback, which is a grey box offline.
export {
  PractitionerSummaryRow,
  type PractitionerSummaryRowProps,
} from "./PractitionerSummaryRow";
// The bottom-pinned commit bar (Figma 781:2291), including the trust line that
// belongs to it. Ends three radii and two heights for one control in one flow.
export { DockedActionBar, type DockedActionBarProps } from "./DockedActionBar";
// The 44-tall section heading that sits OUTSIDE its card (Figma 756:4413).
// Replaces an 11px uppercase caption drawn INSIDE it — under BRAND's 12sp floor.
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader";
// The tinted square leading a detail row (Figma 756:4255 / 756:5246). Replaces
// four hardcoded blue fills that appear in no frame and in no token.
export { IconTile, type IconTileProps, type IconTileSize } from "./IconTile";
// One labelled fact inside a detail card (Figma 756:4282 / 756:4356 / 756:4760),
// with a trailing badge XOR action — mutually exclusive at the type level.
export { KeyValueRow, type KeyValueRowProps } from "./KeyValueRow";
// The tinted note that qualifies the content above it (Figma 756:4361). The
// `error` tone is the in-product alternative to an off-system native Alert.
export { InfoCallout, type InfoCalloutProps, type InfoCalloutTone } from "./InfoCallout";
// The 96px confirmation mark on a terminal screen (Figma 756:4753). No shadow —
// a medallion is not one of BRAND's floating roles.
export { SuccessMedallion, type SuccessMedallionProps } from "./SuccessMedallion";
// One day in the date strip (Figma 756:4424), THREE lines — the third is the
// month, as real data, which removes a hardcoded "May" from the booking params.
export { DatePill, type DatePillProps } from "./DatePill";
export {
  Icon,
  HEALTH_ICONS,
  isHealthIcon,
  type HealthIconName,
  type ChromeIconName,
  type AnyIconName,
  type IconProps,
} from "./icons/Icon";
