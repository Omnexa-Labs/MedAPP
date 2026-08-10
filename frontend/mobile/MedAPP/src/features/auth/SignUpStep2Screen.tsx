// Sign-up Step 2 — rebuilt against the APPROVED Figma frame
// "sign_up_personal_details" (file kRifcg1KCEAlTXy4aimotK, page "Sign Up",
// node 11:38).
//
// The previous version was translated from a Stitch dump before the design
// system existed. Per the product owner's call, Figma is the source of truth, so
// the layout, spacing, radii, colours and copy below come from the frame — not
// from the old screen (which drew decorative corner blobs, split the DOB across
// three DD/MM/YYYY boxes, offered blood type as an 8-chip grid, wrapped every
// group in the legacy <Card>, and used a `mx-auto max-w-[480px]` desktop
// wrapper). What was preserved is the behaviour the design cannot express: RHF +
// zod (`SignUpStep2Schema`, including the ISO-date normalisation and the 13+
// age rule), the `onBack`/`onNext` hand-off to the route, and the field-level
// validation messages.
//
// Frame structure (values read from get_design_context / get_variable_defs, not
// eyeballed):
//   AppBar 292:585   the shared <SignupAppBar step={2} /> — 64px bar, 16px
//                    inset, centred 42px logo, then the 8px stepper at 2/3
//                    (the frame draws 240.667 of the 361px track).
//   Body 326:220     16px inset, 8px top / 32px bottom, 24px gaps
//     326:221        stepper labels: "Step 2 of 3" `primary` ↔ "Personal
//                    Details" `on-surface-variant`, both label-sm
//     326:225        heading: headline-xl 28 + body-md, 8px gap
//     326:694        Card / Health Basics — radius 24, 16px inset, 16px gaps,
//                    1px `outline-variant` hairline, `elevation/card`
//                    (0 8 24 #0D1A17 @12% = the `shadow` token @12%):
//                    two label + 52px input stacks (8px gap) — DOB with a
//                    leading icon/appointment and the placeholder
//                    "DD / MM / YYYY", Blood Type with icon/blood-bag, the
//                    placeholder "Select type" and a 44px chevron-down target.
//     327:204        Privacy Note — `surface-container-low`, radius 12,
//                    16/12 inset, 12px gap, icon/lock 20 + label-sm
//     327:209        Card / Gender — radius 24, 16px inset, 12px gaps, label +
//                    a wrapping chip row (8px gaps; chips 44px tall, radius 12,
//                    `outline-variant` hairline on `surface-container-lowest`)
//     328:689        Goal Section — label + 4 goal rows, 12px gaps. Each row:
//                    radius 24, 16px inset, 12px gap, a 40px `primary-tint`
//                    icon tile at radius 12 holding a 20px glyph, a 4px-gap
//                    text column (label-md + label-sm), and a 20px radius/full
//                    select indicator with a 2px `outline-variant` ring. The
//                    rows draw NO effect — `elevation/card` is scoped to the two
//                    cards only, so a goal row is flat (`<Card flat>`).
//
//     The two cards and the goal rows all go through the shared <Card>
//     primitive, so their fill is the `card-surface` ROLE and NO drop shadow is
//     emitted in either mode (docs/BRAND.md). The frame names
//     `surface-container-lowest`,
//     which is a fixed step: literal #FFFFFF over a #F5FAF8 page in light, and
//     #090F0E — darker than the #0E1514 page — in dark, so the cards receded in
//     dark mode instead of lifting. Deviation from the frame's token.
//     328:747        CTA Block — 56px `primary` CTA at radius 12 ("Continue" +
//                    icon/chrome-arrow-right) + a centred label-sm note, 16px
//                    apart.
//
// FLAGGED deviations / gaps (also listed in the task report):
//   1. The frame draws only the RESTING state of the gender chips and the goal
//      rows — there is no selected/checked state anywhere in the node. Selection
//      is required behaviour, so it is rendered here as `primary` fill +
//      `on-primary` text on a chip, and a `primary` ring/dot + `primary-tint`
//      surface on a goal row. Needs specifying.
//   2. The frame has no error state and no error slot. Validation messages are
//      required, so they render on the `error` token below the group they belong
//      to (same call as the rebuilt Step 1 frame). Needs a designed error state.
//   3. BLOOD TYPE PICKER: the frame draws a select-style field with a
//      chevron-down, but no open/expanded state exists in the design. The 8 ABO
//      options are presented in a bottom-sheet Modal, matching the pattern the
//      flow already uses for the country picker in SignUpVerifyScreen. The
//      sheet itself is UNDESIGNED and needs a frame.
//   4. DATE OF BIRTH: the frame draws ONE field with the placeholder
//      "DD / MM / YYYY" rather than the legacy three boxes, and no date picker
//      or calendar overlay is designed. It is implemented as a numeric input
//      that formats digits into "DD / MM / YYYY" as they are typed and composes
//      the ISO string the schema validates — so the frame is matched and the
//      validation preserved. A real @react-native-community/datetimepicker
//      would need a designed overlay first; tapping the icon does nothing today.
//   5. `color/primary-tint` (#DFF1EE, the goal icon tile) had no token in the
//      repo. It was added to global.css / theme/palette.cjs / theme/colors.cjs
//      per docs/BRAND.md ("add a token rather than inlining a value"). Only the
//      LIGHT value is readable from the frame, so the dark value is derived per
//      M3 tone mapping (a tone-20 teal, `0 55 49`) and needs confirming against
//      the Colors collection's Dark mode.
//   6. The app bar CENTRES the logo, which contradicts BRAND's "logo on the
//      left" app-shell rule — carried over from Step 1 and now flagged once, on
//      the shared component.
//   7. The Help button in the bar still has no destination; no help/support
//      route exists.
//   8. The signup flow routes Step 1 → contact verification → Step 2. That step
//      was never designed; it is untouched here (the route owns the guard) and
//      still needs a frame.
//   9. The frame's goal copy is shorter than the legacy strings ("Timely
//      reminders for every prescription." vs "Stay on top of prescriptions with
//      timely reminders.") and the body copy is British ("personalise"). The
//      frame's copy is used verbatim.
//  11. TOKEN DRIFT: `headline-md` resolved to 24px in tailwind.config.js while
//      docs/BRAND.md documents it as 20. Corrected to 20 (same precedent as the
//      headline-xl 40→28 fix in that file), which also moves ~20 legacy call
//      sites onto the brand size. `headline-lg` was ALSO drifted (32 in the
//      config vs 24 in BRAND) and is now corrected to 24 as well; the claim that
//      SignUpVerifyScreen depended on the 32px value was wrong — that screen
//      never referenced `headline-lg`. Its value is now identical to
//      `headline-lg-mobile`, which is kept only as an alias (see the config).
//  10. SUPERSEDED. The frame draws the DOB and Blood Type inputs with NO fill,
//      which used to match <Input>. The field ROLE now has a fill
//      (`field-surface` — a teal-tinted well in light, a recessed step in dark),
//      because an unfilled outline inside an unseparated card is most of why
//      these forms read cheap. Both fields take it, including the select-shaped
//      Blood Type Pressable, so two adjacent fields can't look like two
//      different controls. Deviation from the frame as drawn — the designer owes
//      the Figma `Input` component the same fill.
//  12. REGISTRY ADVISORY: `medication` (Health Icons `pill_1`) is a circle with
//      one full diagonal score line and reads as a prohibition sign at the 20px
//      this screen draws it. Swapped at the call site for `medicine-bottle`; see
//      GOAL_META for the advisory the registry owner needs to act on.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.

import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, ChoiceChip, Icon, Input, type HealthIconName,
  KeyboardInset,
} from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { useTokenColor } from "@/lib/tokens";
import { SignupAppBar } from "@/features/auth/components/SignupAppBar";
import {
  FieldError,
  FRAME_CARD_INSET,
  SignupStepLabels,
} from "@/features/auth/components/signup-form";
import {
  BloodTypes,
  Genders,
  HealthGoals,
  SignUpStep2Schema,
  type BloodType,
  type Gender,
  type HealthGoal,
  type SignUpStep2Values,
} from "@/features/auth/schema";

interface Props {
  onBack?: () => void;
  onNext?: (values: SignUpStep2Values) => void;
}

/** Chip / Female · Male · Non-binary · Other (327:212 … 327:218). */
const GENDER_LABELS: Record<Gender, string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
  other: "Other",
};

/**
 * Goal rows 328:692 / 705 / 717 / 732 — copy and glyphs taken from the frame.
 * Every glyph is a real Health Icons registry entry, so nothing had to be added
 * to src/components/ui/icons/registry.ts.
 */
const GOAL_META: Record<HealthGoal, { title: string; description: string; icon: HealthIconName }> =
  {
    meds: {
      // REGISTRY ADVISORY (FLAGGED 12): `medication` resolves to Health Icons
      // `medications/pill_1`, which is a 2px-stroke circle crossed by ONE full
      // diagonal line (the pill's score mark). At the 20-24px sizes this row and
      // the Step 3 chips use, the score mark reads as the slash of a
      // prohibition/"no entry" sign, i.e. the opposite of "manage your meds" —
      // exactly the "slashed circle" the owner reported. It only resolves as a
      // scored tablet at roughly 32px+.
      //
      // Fixed at the CALL SITE, not in the registry: `medication` is a shared
      // semantic name with other call sites, and re-pointing it is a design-system
      // change outside this screen's ownership. `medicine-bottle`
      // (`devices/medicine_bottle`) is already in the registry, is unambiguous at
      // 20px (bottle silhouette + cap + plus), and is arguably the better match
      // for "manage" — a supply you keep, not one tablet.
      //
      // ADVISORY FOR THE REGISTRY OWNER: either re-point `medication` to a glyph
      // that survives 20px, or document it as >=32px only, because any other
      // screen reaching for `medication` in a dense row hits the same bug.
      title: "Manage Meds",
      description: "Timely reminders for every prescription.",
      icon: "medicine-bottle",
    },
    vitals: {
      title: "Track Vitals",
      description: "Heart rate, blood pressure, and more.",
      icon: "heart-rate",
    },
    tele: {
      title: "Telemedicine",
      description: "Consult with specialists from home.",
      icon: "message",
    },
    wellness: {
      title: "Wellness",
      description: "Improve sleep, diet, and wellbeing.",
      icon: "nutrition",
    },
  };

// ---------------------------------------------------------------------------
// DOB helpers. The frame shows ONE field masked "DD / MM / YYYY"; the schema
// validates an ISO yyyy-mm-dd. These convert between the two so the design is
// matched without losing the (real-date + 13+) rules in schema.ts.
// ---------------------------------------------------------------------------

/** Formats raw digits as the frame's "DD / MM / YYYY" as the user types. */
function formatDob(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)} / ${d.slice(2)}`;
  return `${d.slice(0, 2)} / ${d.slice(2, 4)} / ${d.slice(4)}`;
}

/** "05 / 11 / 1990" -> "1990-11-05". Empty until all 8 digits are present. */
function dobToIso(display: string): string {
  const d = display.replace(/\D/g, "");
  if (d.length !== 8) return "";
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

export function SignUpStep2Screen({ onBack, onNext }: Props) {
  const { scheme } = useResolvedScheme();
  // Icon colours can't be Tailwind classes (react-native-svg / MaterialIcons
  // take a colour string), so they're resolved by token name for the mode.
  const onSurfaceVariant = useTokenColor("on-surface-variant");

  // The masked display value. `dateOfBirth` in the form holds the ISO string.
  const [dobDisplay, setDobDisplay] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignUpStep2Values>({
    resolver: zodResolver(SignUpStep2Schema),
    defaultValues: {
      dateOfBirth: "",
      bloodType: undefined,
      gender: undefined,
      primaryGoal: undefined,
    },
    mode: "onSubmit",
  });

  const onSubmit = handleSubmit((values) => {
    onNext?.(values);
  });

  const handleDobChange = (raw: string) => {
    const display = formatDob(raw);
    setDobDisplay(display);
    // Keep the ISO value in step with every keystroke so a user who taps
    // Continue without blurring the field still gets validated.
    setValue("dateOfBirth", dobToIso(display), { shouldValidate: false });
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        {/* KeyboardInset, NOT KeyboardAvoidingView — the KAV infers the keyboard
          from a WINDOW RESIZE that Android edge-to-edge no longer performs, so it
          silently does nothing there. Proven on device on the chat composer. */}
      <KeyboardInset className="flex-1">
          {/* AppBar + Stepper (292:585) — outside the ScrollView: the frame
              pins it above the body, and it carries the way back out. */}
          <SignupAppBar
            step={2}
            backLabel="Back to step 1"
            onBack={() => onBack?.()}
            onHelp={() => {
              /* FLAGGED (7): needs a help/support screen + a designed target. */
            }}
          />

          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 32,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Body (326:220) — 24px between blocks. */}
            <View className="w-full gap-6">
              {/* Stepper Labels (326:221) — shared with steps 1 and 3. */}
              <SignupStepLabels step={2} title="Personal Details" />

              {/* Heading (326:224) */}
              <View className="w-full gap-2">
                <Text className="font-headline-xl text-headline-xl text-on-surface">
                  Tell us about yourself
                </Text>
                <Text className="font-body-md text-body-md text-on-surface-variant">
                  This helps us personalise your health journey and surface the most relevant care
                  recommendations.
                </Text>
              </View>

              {/* ---------------- Card / Health Basics (326:694) ----------------
                  The shared <Card> primitive. This was hand-rolled with a local
                  `cardShadow` because the primitive was on pre-design-system
                  geometry; it now IS this node (radius 24, `card-surface`,
                  full-strength hairline, `elevation/card` in light mode only),
                  so only the frame's 16px inset is restated. */}
              <Card className="w-full gap-4" style={FRAME_CARD_INSET}>
                {/* Field / Date of Birth (326:695) — label + 8px + input.
                    FLAGGED (4): masked text input, not a date picker. */}
                <View className="w-full gap-2">
                  <Text className="font-label-md text-label-md text-on-surface">Date of Birth</Text>
                  <Controller
                    control={control}
                    name="dateOfBirth"
                    render={() => (
                      <Input
                        testID="signup.step2.dob"
                        // icon/appointment (326:697) is a Health Icon, so it
                        // can't go through <Input icon> (which takes a chrome
                        // name) — it's passed as the leading slot instead.
                        leading={<Icon name="appointment" size={20} color={onSurfaceVariant} />}
                        placeholder="DD / MM / YYYY"
                        keyboardType="number-pad"
                        value={dobDisplay}
                        onChangeText={handleDobChange}
                        hasError={!!errors.dateOfBirth}
                        accessibilityLabel="Date of Birth"
                        accessibilityHint={
                          errors.dateOfBirth?.message ?? "Enter day, month and year as digits"
                        }
                      />
                    )}
                  />
                  <FieldError message={errors.dateOfBirth?.message} />
                </View>

                {/* Field / Blood Type (326:717). The frame draws a select-style
                    field; the option sheet is FLAGGED (3) as undesigned. */}
                <View className="w-full gap-2">
                  <Text className="font-label-md text-label-md text-on-surface">
                    Blood Type (Optional)
                  </Text>
                  <Controller
                    control={control}
                    name="bloodType"
                    render={({ field }) => (
                      <>
                        <Pressable
                          testID="signup.step2.blood-type"
                          onPress={() => setPickerOpen(true)}
                          accessibilityRole="button"
                          accessibilityLabel="Blood Type, optional"
                          accessibilityValue={{ text: field.value ?? "Select type" }}
                          // Geometry AND fill copied from <Input> deliberately:
                          // this is a select-shaped field sitting directly under
                          // a real <Input>, so it has to take the same
                          // `field-surface` well. Before the primitives landed
                          // the field role had no fill at all; leaving this one
                          // unfilled would now make two adjacent fields in the
                          // same card look like two different controls.
                          className="h-[52px] w-full flex-row items-center gap-base rounded-md border border-outline-variant bg-field-surface px-4"
                        >
                          <Icon name="blood-bag" size={20} color={onSurfaceVariant} />
                          <Text
                            className={`flex-1 font-body-md text-body-md ${
                              field.value ? "text-on-surface" : "text-on-surface-variant"
                            }`}
                          >
                            {field.value ?? "Select type"}
                          </Text>
                          {/* 44×44 target (I326:719;318:654) holding a 20px glyph. */}
                          <View className="h-11 w-11 items-center justify-center">
                            <Icon chrome="keyboard-arrow-down" size={20} color={onSurfaceVariant} />
                          </View>
                        </Pressable>

                        <BloodTypeSheet
                          visible={pickerOpen}
                          selected={field.value}
                          onSelect={(bt) => {
                            field.onChange(bt);
                            setPickerOpen(false);
                          }}
                          onClose={() => setPickerOpen(false)}
                        />
                      </>
                    )}
                  />
                </View>
              </Card>

              {/* Privacy Note (327:204) — `surface-container-low`, radius 12.
                  Health Icons ships no plain padlock, so this is the chrome
                  fallback the frame itself uses (docs/BRAND.md). */}
              <View className="w-full flex-row items-center gap-3 rounded-md bg-surface-container-low px-4 py-3">
                <Icon chrome="lock-outline" size={20} color={onSurfaceVariant} />
                <Text className="flex-1 font-label-sm text-label-sm text-on-surface-variant">
                  Your health details are encrypted, never sold, and used only to personalise your
                  care.
                </Text>
              </View>

              {/* Card / Gender (327:209) — same shared <Card>. */}
              <Card className="w-full gap-3" style={FRAME_CARD_INSET}>
                <Text className="font-label-md text-label-md text-on-surface">
                  Gender Identification
                </Text>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    // Chip Row (327:211) — wraps, 8px gaps. The chips are now the
                    // shared ChoiceChip (Figma 11:104); `GenderChip` is deleted.
                    //
                    // Of the ten private chips this was the closest to the frame
                    // already — 44 tall, `radius/12`, and it had independently
                    // arrived at the same `border-primary bg-primary` selected
                    // pairing the shared component uses (a Figma stroke is inset
                    // and free, but an RN border participates in layout, so
                    // dropping it on selection would shrink the box 2pt per axis
                    // and make the row twitch as the user taps through). So this
                    // migration is pure DEDUPLICATION, not a bug fix. Two
                    // deliberate changes: the unselected chip loses its
                    // `bg-surface-container-lowest` fill for the frame's
                    // no-fill + hairline (which is also the only treatment that
                    // reads correctly both on a card and on the page), and
                    // selection gains the check glyph so it is not carried by
                    // colour alone.
                    //
                    // The wrapping View is kept rather than replaced by
                    // <ChoiceChipRow>, because it is the `radiogroup` — and that
                    // role, plus its group label, is what makes the four radios
                    // announce as one control. ChoiceChipRow takes no a11y props
                    // (by design: it is layout only). Its `gap-2` already equals
                    // ChoiceChipRow's own 8px ROW_GAP, so nothing drifts.
                    <View
                      className="w-full flex-row flex-wrap items-start gap-2"
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Gender Identification"
                    >
                      {Genders.map((g) => (
                        <ChoiceChip
                          key={g}
                          label={GENDER_LABELS[g]}
                          role="radio"
                          selected={field.value === g}
                          onPress={() => field.onChange(g)}
                        />
                      ))}
                    </View>
                  )}
                />
                <FieldError message={errors.gender?.message} />
              </Card>

              {/* Goal Section (328:689) */}
              <View className="w-full gap-3">
                <Text className="font-label-md text-label-md text-on-surface">
                  Primary Health Goal
                </Text>
                <Controller
                  control={control}
                  name="primaryGoal"
                  render={({ field }) => (
                    // Goal List (328:691) — 12px gaps.
                    <View
                      className="w-full gap-3"
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Primary Health Goal"
                    >
                      {HealthGoals.map((goal) => (
                        <GoalRow
                          key={goal}
                          icon={GOAL_META[goal].icon}
                          title={GOAL_META[goal].title}
                          description={GOAL_META[goal].description}
                          selected={field.value === goal}
                          onPress={() => field.onChange(goal)}
                        />
                      ))}
                    </View>
                  )}
                />
                <FieldError message={errors.primaryGoal?.message} />
              </View>

              {/* CTA Block (328:747) — 16px gap, centred note. */}
              <View className="w-full items-center gap-4">
                {/* CTA / Continue (328:748) — 56px, radius 12, no effect on the
                    node, so the primary variant's elevation is opted out of. */}
                <Button
                  testID="signup.step2.next"
                  className="h-14"
                  size="cta"
                  pill={false}
                  shadow={false}
                  label="Continue"
                  accessibilityLabel="Continue to step 3"
                  trailingIcon="arrow-forward"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  onPress={onSubmit}
                />
                <Text className="text-center font-label-sm text-label-sm text-on-surface-variant">
                  You can always update these later in your profile settings.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardInset>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. This is their only screen, so they stay local per the house
// rule in components/ui/README.md (extract at 2+ call sites).
// ---------------------------------------------------------------------------

// `GenderChip` (Figma Chip 327:212…327:218) was deleted — it is the shared
// ChoiceChip now. See the note at its call site above.

/**
 * Goal / … (328:692) — radius 24, 16px inset, 12px gap, a 40px `primary-tint`
 * tile at radius 12 holding a 20px glyph, a 4px text column, and a 20px
 * radius/full indicator with a 2px `outline-variant` ring. The node carries NO
 * effect — unlike the two cards above it, a goal row is FLAT, hence `<Card flat>`
 * so `elevation/card` can never leak onto it.
 *
 * It goes through <Card> rather than restating the treatment because the row is
 * card-ROLE (radius 24 on the page). Its old `bg-surface-container-lowest` is
 * exactly the fixed-step fill the Card fix removed: #FFFFFF on a #F5FAF8 page in
 * light, and #090F0E — DARKER than the #0E1514 page — in dark, so the row sank
 * instead of lifting. `card-surface` steps the right way in both modes.
 *
 * The Pressable WRAPS the Card instead of being it: <Card> renders a View, and
 * `active:scale-[0.99]` has to apply to the whole visible surface (border, fill
 * and all), not just the content inside it.
 *
 * FLAGGED (1): selected state is ours — a `primary` ring + filled dot, and the
 * row hairline moves to `primary`. Selection is never signalled by colour alone:
 * `accessibilityState.selected` carries it for assistive tech, and the filled
 * dot is a shape change, not just a hue change (WCAG 1.4.1, docs/BRAND.md).
 */
function GoalRow({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: HealthIconName;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  // The glyph sits on the `primary-tint` tile and the selected hairline is the
  // same accent, so both resolve one token for the current mode — never a hex.
  const primary = useTokenColor("primary");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      accessibilityHint={description}
      className="w-full active:scale-[0.99]"
    >
      <Card
        flat
        className="w-full flex-row items-center gap-3"
        // borderColor inline, not a `border-primary` className: <Card> already
        // names `border-outline-variant` and src/lib/cn.ts has no
        // tailwind-merge, so two competing border-colour utilities would resolve
        // by stylesheet order rather than intent. Still a token, just resolved.
        style={{ ...FRAME_CARD_INSET, ...(selected ? { borderColor: primary } : null) }}
      >
        {/* Icon Tile (I328:692;11:117) */}
        <View className="h-10 w-10 items-center justify-center rounded-md bg-primary-tint">
          <Icon name={icon} size={20} color={primary} />
        </View>

        {/* Text Column (I328:692;29:99) — 4px gap. */}
        <View className="flex-1 gap-1">
          <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{description}</Text>
        </View>

        {/* Select Indicator (I328:692;324:669) */}
        <View
          className={`h-5 w-5 items-center justify-center rounded-full ${
            selected ? "border-primary" : "border-outline-variant"
          }`}
          style={{ borderWidth: 2 }}
        >
          {/* 8px, on the 4/8/12/16/24/32/48 scale (docs/BRAND.md). */}
          {selected ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * Blood type option sheet — FLAGGED (3): the frame draws the closed select only,
 * so this overlay is UNDESIGNED. It follows the country-picker pattern already
 * in this flow (SignUpVerifyScreen) and is restyled onto the design system:
 * `card-surface`, radius 24 top corners, 16px inset, 12px rows.
 *
 * Not <Card>: a bottom sheet needs only its TOP corners rounded and no hairline,
 * neither of which the primitive expresses — but it takes the same
 * `card-surface` ROLE, so it steps up off the scrim in dark mode instead of
 * collapsing to near-black the way `surface-container-lowest` did.
 */
function BloodTypeSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected?: BloodType;
  onSelect: (bloodType: BloodType) => void;
  onClose: () => void;
}) {
  const scrim = useTokenColor("scrim", 0.4);
  const primary = useTokenColor("primary");

  // Two per row keeps all 8 ABO options visible without scrolling.
  const rows = useMemo(
    () =>
      BloodTypes.reduce<BloodType[][]>((acc, bt, i) => {
        if (i % 2 === 0) acc.push([bt]);
        else acc[acc.length - 1].push(bt);
        return acc;
      }, []),
    [],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ backgroundColor: scrim }}
        className="flex-1 justify-end"
        accessibilityRole="button"
        accessibilityLabel="Close blood type picker"
        onPress={onClose}
      >
        {/* Stop taps inside the sheet from dismissing it. */}
        <Pressable onPress={() => {}} className="w-full gap-4 rounded-t-card bg-card-surface p-4">
          <Text className="font-headline-md text-headline-md text-on-surface">
            Select blood type
          </Text>
          <View className="w-full gap-3">
            {rows.map((row) => (
              <View key={row.join("")} className="w-full flex-row gap-3">
                {row.map((bt) => {
                  const isSelected = selected === bt;
                  return (
                    <Pressable
                      key={bt}
                      onPress={() => onSelect(bt)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Blood type ${bt}`}
                      className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-md border ${
                        isSelected
                          ? "border-primary bg-primary-tint"
                          : "border-outline-variant bg-surface-container-lowest"
                      }`}
                    >
                      <Text className="font-label-md text-label-md text-on-surface">{bt}</Text>
                      {isSelected ? <Icon chrome="check" size={16} color={primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <Button
            label="Done"
            variant="outline"
            size="cta"
            pill={false}
            className="h-14"
            onPress={onClose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
