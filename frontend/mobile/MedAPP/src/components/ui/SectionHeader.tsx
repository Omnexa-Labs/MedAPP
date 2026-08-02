// SectionHeader — the 44-tall row that names a section, OUTSIDE the card it
// introduces.
//
// Figma: `Section Header` 756:4413, instanced by every section of the booking
// flow (756:4384 "Select Date" / "Available Slots" / "Consultation Type",
// 756:4213 "Time & Schedule" / "Service Details" / "Location", 756:4742 "Before
// your appointment").
//
//   row      h 44, items-center, justify-between
//   leading  optional 20px glyph (`color/on-surface`) + gap 8 + title
//   title    headline-md  (Manrope SemiBold 20)  `color/on-surface`
//   action   optional text link, `color/primary`, label-md
//
// WHY THIS FILE EXISTS. Two reasons, and the second is an accessibility defect
// rather than a restyle:
//
//  1. The frames put the heading OUTSIDE the card. ReviewAppointmentScreen's
//     private `SectionCard` puts it INSIDE, so the card and its name are one box
//     — which means every screen that wants the frame's arrangement has to
//     rebuild the row, and three of them already had.
//  2. `SectionCard` sets that heading at `fontSize: 11`, uppercase. docs/BRAND.md
//     §Typography: "Never ship type below 12sp." An 11px uppercase caption on a
//     low-density Android screen in sunlight — the stated target hardware — is
//     the exact failure the floor exists for. The heading belongs on the ramp at
//     `headline-md`.
//
// THE ACTION SLOT IS WHERE THE 44 COMES FROM. "See Calendar" is a real target and
// the frame gives the whole row 44pt; the Pressable therefore takes the FULL row
// height rather than hugging its label, so the target is the visible row instead
// of a 17pt strip of text inside it. That is also why the row's height is
// `minHeight` and not `height`: at a large OS font scale a 20px headline grows,
// and a fixed 44 would clip it (docs/MOBILE_UX.md: "Test at 393pt wide *and* at a
// large font scale").
//
// NO `className` AND NO `style`. Same rule as VitalStatCard: a screen must not be
// able to express a private section heading. `icon` and `action` are the only
// axes 756:4413 has.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { Pressable, Text, View } from "react-native";
import { useTokenColor } from "@/lib/tokens";
import { Icon, isHealthIcon, type AnyIconName } from "./icons/Icon";

/**
 * 756:4413 is 44 tall, which is also docs/MOBILE_UX.md's target floor — so the
 * frame and the accessibility rule agree and one number serves both.
 */
const ROW_MIN_HEIGHT = 44;

/** docs/BRAND.md §Iconography: "24px default, 20px in dense rows." */
const GLYPH = 20;

export type SectionHeaderProps = {
  title: string;
  /** Clinical or chrome; the Icon gate decides. Decorative — the title names it. */
  icon?: AnyIconName;
  /** Trailing text link, e.g. "See Calendar". */
  action?: { label: string; onPress: () => void; disabled?: boolean };
  testID?: string;
};

export function SectionHeader({ title, icon, action, testID }: SectionHeaderProps) {
  const titleColor = useTokenColor("on-surface");

  return (
    <View
      className="w-full flex-row items-center justify-between gap-3"
      style={{ minHeight: ROW_MIN_HEIGHT }}
      testID={testID}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {icon ? (
          // Decorative: the Text beside it carries the name, so <Icon /> hides it
          // from assistive tech rather than announcing "image, Before your
          // appointment".
          isHealthIcon(icon) ? (
            <Icon name={icon} size={GLYPH} color={titleColor} />
          ) : (
            <Icon chrome={icon} size={GLYPH} color={titleColor} />
          )
        ) : null}
        {/* `header` is what lets a screen reader's heading rotor jump between
            sections — the private 11px captions were plain text and invisible
            to it. */}
        <Text
          accessibilityRole="header"
          className="flex-1 font-headline-md text-headline-md text-on-surface"
        >
          {title}
        </Text>
      </View>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: !!action.disabled }}
          disabled={action.disabled}
          onPress={action.onPress}
          // Full row height, not a hugging box: that is where the 44pt target
          // comes from. px-2 gives the label 8pt of slop on each side.
          className="justify-center px-2 active:opacity-80"
          style={{ minHeight: ROW_MIN_HEIGHT, opacity: action.disabled ? 0.6 : 1 }}
        >
          <Text className="font-label-md text-label-md text-primary">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
