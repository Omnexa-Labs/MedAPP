// PhoneField — the approved Figma component "Field / Phone (Country + Number)"
// (file kRifcg1KCEAlTXy4aimotK, node 445:1542), plus the country picker sheet
// it opens.
//
// This is the structural fix for the reported collision. The legacy sign-up
// verify screen drew a Pressable country selector and a TextInput as two
// siblings inside a bordered row, each carrying its own padding and its own
// background — so the selector's fill sat on top of the field's fill and the
// two visually fought at the seam. The frame instead defines ONE control:
//
//   329 × 52, radius/12, fill `color/field-surface`, 1px `outline-variant`,
//   clipsContent, containing
//     Country Segment (445:1512)  pad 16/12, gap 8 — ISO label-md, dial body-md,
//                                 icon/chrome-chevron-down; 126 × 52 tap target
//     Divider         (445:1518)  1 × 24, `outline-variant`
//     Number Segment  (445:1519)  pad 12/16, FILL
//
// Nothing overlaps because nothing has its own fill: the segments are
// transparent and the single container owns the surface, the hairline and the
// radius. `overflow-hidden` is the frame's `clipsContent`, which is what lets
// the country segment sit flush to the rounded left edge without a corner gap.
//
// State axis from the component set: `Default` 445:1511 · `Focused` 445:1521
// (2px `primary` stroke + a 2×20 caret in the number segment) · `Error`
// 445:1532. Border colours are driven imperatively and resolved BY TOKEN NAME
// for the current mode — NativeWind can't style `focus:` on a bare TextInput,
// and a literal hex would freeze the field in light-mode colours
// (docs/BRAND.md). This mirrors components/ui/Input.tsx exactly, including its
// 1px-normal / 2px-focused rule.
//
// It is NOT in components/ui: sign-up verify is its only call site, and the
// house rule in components/ui/README.md is to extract at two.
//
// FLAGGED: the frame draws the CLOSED control only. The picker sheet below is
// undesigned — it follows the bottom-sheet pattern the flow already uses
// (BloodTypeSheet in SignUpStep2Screen) and is restyled onto the token system.
// FLAGGED: the frame's country segment shows a plain "GH" text label, so the
// legacy teal ISO badge (which hardcoded #00685f / #ffffff) is dropped rather
// than retained off-design.

import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Icon, SearchField } from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import { tokenColor, useTokenColor } from "@/lib/tokens";

export interface Country {
  /** E.164 dial code, e.g. "+233". */
  code: string;
  name: string;
  /** ISO 3166-1 alpha-2, e.g. "GH" — the frame's label text. */
  iso: string;
}

/**
 * Unchanged from the legacy screen so no user loses a country they could
 * previously pick. Ghana leads because it is the frame's default (+233) and the
 * product's first market (docs/PROJECT.md).
 */
export const COUNTRIES: Country[] = [
  { code: "+233", name: "Ghana", iso: "GH" },
  { code: "+234", name: "Nigeria", iso: "NG" },
  { code: "+254", name: "Kenya", iso: "KE" },
  { code: "+27", name: "South Africa", iso: "ZA" },
  { code: "+251", name: "Ethiopia", iso: "ET" },
  { code: "+255", name: "Tanzania", iso: "TZ" },
  { code: "+256", name: "Uganda", iso: "UG" },
  { code: "+237", name: "Cameroon", iso: "CM" },
  { code: "+225", name: "Côte d'Ivoire", iso: "CI" },
  { code: "+221", name: "Senegal", iso: "SN" },
  { code: "+212", name: "Morocco", iso: "MA" },
  { code: "+20", name: "Egypt", iso: "EG" },
  { code: "+249", name: "Sudan", iso: "SD" },
  { code: "+260", name: "Zambia", iso: "ZM" },
  { code: "+263", name: "Zimbabwe", iso: "ZW" },
  { code: "+1", name: "United States", iso: "US" },
  { code: "+44", name: "United Kingdom", iso: "GB" },
  { code: "+49", name: "Germany", iso: "DE" },
  { code: "+33", name: "France", iso: "FR" },
  { code: "+91", name: "India", iso: "IN" },
  { code: "+86", name: "China", iso: "CN" },
  { code: "+971", name: "UAE", iso: "AE" },
];

/** The frame's default country: Ghana +233. */
export const DEFAULT_COUNTRY = COUNTRIES[0];

interface Props {
  country: Country;
  onCountryChange: (country: Country) => void;
  /** The local (national) part only; the dial code lives in `country`. */
  value: string;
  onChangeText: (next: string) => void;
  hasError?: boolean;
  editable?: boolean;
}

export function PhoneField({
  country,
  onCountryChange,
  value,
  onChangeText,
  hasError = false,
  editable = true,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const { scheme } = useResolvedScheme();

  // Default → Focused → Error, per the component set's State axis. Same rule as
  // components/ui/Input.tsx so the two controls can never disagree.
  const borderColor = tokenColor(
    hasError ? "error" : focused ? "primary" : "outline-variant",
    scheme,
  );
  const onSurfaceVariant = tokenColor("on-surface-variant", scheme);

  return (
    <>
      {/* Field / Phone (445:1511) — ONE control. The container owns the fill,
          hairline and radius; both segments are transparent. */}
      <View
        className="h-[52px] w-full flex-row items-center overflow-hidden rounded-md bg-field-surface"
        style={{ borderWidth: focused ? 2 : 1, borderColor }}
      >
        {/* Country Segment (445:1512) — 52px tall, so the 44pt minimum target
            is met on both axes without a hitSlop. */}
        <Pressable
          onPress={() => setPickerVisible(true)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Country code ${country.name} ${country.code}`}
          accessibilityHint="Opens the country list"
          className="h-full flex-row items-center gap-2 pl-4 pr-3 active:opacity-70"
        >
          <Text className="font-label-md text-label-md text-on-surface">{country.iso}</Text>
          <Text className="font-body-md text-body-md text-on-surface">{country.code}</Text>
          <Icon chrome="keyboard-arrow-down" size={20} color={onSurfaceVariant} />
        </Pressable>

        {/* Divider (445:1518) — 1 × 24. */}
        <View className="h-6 w-px bg-outline-variant" />

        {/* Number Segment (445:1519) — FILL. */}
        <View className="h-full flex-1 flex-row items-center pl-3 pr-4">
          <TextInput
            value={value}
            onChangeText={onChangeText}
            editable={editable}
            placeholder="24 123 4567"
            placeholderTextColor={onSurfaceVariant}
            keyboardType="phone-pad"
            autoCorrect={false}
            autoComplete="tel-national"
            textContentType="telephoneNumber"
            accessibilityLabel="Phone number"
            aria-invalid={hasError}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              flex: 1,
              color: tokenColor("on-surface", scheme),
              fontSize: 16,
              // RN pads a TextInput vertically by default on Android; the frame
              // centres the value in a 52px control, so the padding is removed
              // and centring is left to the row's `items-center`.
              paddingVertical: 0,
            }}
          />
        </View>
      </View>

      <CountryPickerSheet
        visible={pickerVisible}
        selected={country}
        onSelect={onCountryChange}
        onClose={() => setPickerVisible(false)}
      />
    </>
  );
}

/**
 * UNDESIGNED (see the header). Bottom sheet on `surface-container-lowest` with
 * radius/24 top corners, a 16px inset and 44px rows — the same shape as
 * SignUpStep2Screen's BloodTypeSheet, so the flow has one overlay language.
 */
function CountryPickerSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const scrim = useTokenColor("scrim", 0.4);
  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const primary = useTokenColor("primary");
  const onSurface = useTokenColor("on-surface");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [query]);

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable
        style={{ backgroundColor: scrim }}
        className="flex-1 justify-end"
        accessibilityRole="button"
        accessibilityLabel="Close country list"
        onPress={close}
      >
        {/* Stops the backdrop press from closing the sheet itself. */}
        <Pressable
          className="max-h-[75%] w-full gap-4 rounded-t-card bg-surface-container-lowest p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="w-full flex-row items-center justify-between">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Select country
            </Text>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-11 w-11 items-center justify-center"
            >
              <Icon chrome="close" size={24} color={onSurfaceVariant} />
            </Pressable>
          </View>

          {/* The shared SearchField (Figma 396:538). Unlike the four screen-level
              search rows it replaces, this one already themed correctly — every
              colour here was resolved through the token layer — so migrating it
              is pure DEDUPLICATION, not a bug fix. What it stops is the fifth
              copy of the 52pt / radius-12 / field-surface geometry existing at
              all: SearchField inherits all of it from `Input` by import, so this
              picker can no longer drift away from the app's canonical field.

              Two changes that follow from the frame rather than from choice: the
              border resolves to `outline-variant` (Input's, and 396:538's) rather
              than the heavier `on-surface-variant` this copy used, it gains
              Input's focus and error borders, and it gains 396:530's
              State=Has query clear button, which the copy did not have. */}
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder="Search country or dial code"
            accessibilityLabel="Search country or dial code"
          />

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View className="h-px bg-outline-variant" />}
            renderItem={({ item }) => {
              const isSelected = item.iso === selected.iso;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    close();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} ${item.code}`}
                  accessibilityState={{ selected: isSelected }}
                  className="h-11 w-full flex-row items-center gap-3 active:opacity-70"
                >
                  <Text className="w-8 font-label-md text-label-md text-on-surface-variant">
                    {item.iso}
                  </Text>
                  <Text className="flex-1 font-body-md text-body-md text-on-surface">
                    {item.name}
                  </Text>
                  <Text className="font-label-md text-label-md text-on-surface-variant">
                    {item.code}
                  </Text>
                  {/* Selection is not signalled by colour alone — the check is a
                      shape change and accessibilityState carries it for
                      assistive tech (WCAG 1.4.1, docs/BRAND.md). */}
                  {isSelected ? <Icon chrome="check" size={20} color={primary} /> : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
