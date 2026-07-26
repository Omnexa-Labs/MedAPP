// Sign-up verification step. Wedges between Step 1 and Step 2:
//
//   Step 1 (account)  →  Verify  →  Step 2 (about you)  →  Step 3 (security)
//
// Two sub-states inside one screen:
//   - "pick"  — user chooses email or phone. Email pre-fills from Step 1.
//               Phone is collected inline (Step 1 does not capture phone).
//   - "code"  — 6-digit input + resend timer. On success, the verification
//               token is written to the signup draft and we push to Step 2.
//
// Why one screen, not two routes: the back gesture from Step 2 should land
// the user back on the picker, not on a code-entry view with no context.

import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { ApiError } from "@/types/api";
import { useSignupOtpStart, useSignupOtpVerify } from "@/features/auth/hooks/use-signup-otp";

// ─── Country data ─────────────────────────────────────────────────────────────

interface Country {
  code: string;  // E.164 dial code, e.g. "+233"
  name: string;
  iso: string;   // ISO 3166-1 alpha-2, e.g. "GH"
}

const COUNTRIES: Country[] = [
  { code: "+233", name: "Ghana", iso: "GH" },
  { code: "+234", name: "Nigeria", iso: "NG" },
  { code: "+254", name: "Kenya", iso: "KE" },
  { code: "+27",  name: "South Africa", iso: "ZA" },
  { code: "+251", name: "Ethiopia", iso: "ET" },
  { code: "+255", name: "Tanzania", iso: "TZ" },
  { code: "+256", name: "Uganda", iso: "UG" },
  { code: "+237", name: "Cameroon", iso: "CM" },
  { code: "+225", name: "Côte d'Ivoire", iso: "CI" },
  { code: "+221", name: "Senegal", iso: "SN" },
  { code: "+212", name: "Morocco", iso: "MA" },
  { code: "+20",  name: "Egypt", iso: "EG" },
  { code: "+249", name: "Sudan", iso: "SD" },
  { code: "+260", name: "Zambia", iso: "ZM" },
  { code: "+263", name: "Zimbabwe", iso: "ZW" },
  { code: "+1",   name: "United States", iso: "US" },
  { code: "+44",  name: "United Kingdom", iso: "GB" },
  { code: "+49",  name: "Germany", iso: "DE" },
  { code: "+33",  name: "France", iso: "FR" },
  { code: "+91",  name: "India", iso: "IN" },
  { code: "+86",  name: "China", iso: "CN" },
  { code: "+971", name: "UAE", iso: "AE" },
];

// ─── ISO badge (replaces flag emoji — renders reliably on all platforms) ───────

function IsoBadge({ iso, size = "md" }: { iso: string; size?: "sm" | "md" }) {
  const pad = size === "sm" ? { paddingHorizontal: 5, paddingVertical: 2 } : { paddingHorizontal: 7, paddingVertical: 3 };
  const fs = size === "sm" ? 10 : 12;
  return (
    <View
      style={{
        backgroundColor: "#00685f",
        borderRadius: 4,
        ...pad,
      }}
    >
      <Text style={{ color: "#ffffff", fontSize: fs, fontWeight: "700", letterSpacing: 0.5 }}>
        {iso}
      </Text>
    </View>
  );
}

// ─── Country picker modal ─────────────────────────────────────────────────────

interface CountryPickerModalProps {
  visible: boolean;
  selected: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
}

function CountryPickerModal({ visible, selected, onSelect, onClose }: CountryPickerModalProps) {
  const [query, setQuery] = useState("");

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close country picker"
      >
        <Pressable
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#ffffff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "75%",
            paddingTop: 8,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#d0dbd9",
              alignSelf: "center",
              marginBottom: 16,
            }}
          />

          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#171d1c" }}>
              Select country
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialIcons name="close" size={22} color="#6d7a77" />
            </Pressable>
          </View>

          {/* Search */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginHorizontal: 20,
              marginBottom: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: "#bcc9c6",
              backgroundColor: "#f8fffe",
              gap: 8,
            }}
          >
            <MaterialIcons name="search" size={20} color="#6d7a77" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or dial code"
              placeholderTextColor="#bcc9c6"
              style={{ flex: 1, color: "#171d1c", fontSize: 15 }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <MaterialIcons name="close" size={18} color="#6d7a77" />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.iso === selected.iso;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    setQuery("");
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 13,
                    gap: 12,
                    backgroundColor: isSelected ? "#e8f5f4" : pressed ? "#f4faf9" : "#ffffff",
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} ${item.code}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <IsoBadge iso={item.iso} />
                  <Text style={{ flex: 1, color: "#171d1c", fontSize: 15, fontWeight: "500" }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: "#6d7a77", fontSize: 14, fontWeight: "600" }}>
                    {item.code}
                  </Text>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={20} color="#00685f" />
                  )}
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: "#f0f4f3", marginHorizontal: 20 }} />
            )}
            contentContainerStyle={{ paddingBottom: 48 }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Props {
  /** Email collected at Step 1. Pre-fills the email-verify option. */
  email: string;
  /** Final submit handler, given the resulting verification triple. */
  onVerified: (verification: {
    channel: "sms" | "email";
    recipient: string;
    token: string;
  }) => void;
  onBack: () => void;
}

type Mode =
  | { state: "pick" }
  | { state: "code"; channel: "sms" | "email"; recipient: string; resendIn: number };

const DEFAULT_COUNTRY = COUNTRIES[0]; // Ghana

export function SignUpVerifyScreen({ email, onVerified, onBack }: Props) {
  const [mode, setMode] = useState<Mode>({ state: "pick" });
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localNumber, setLocalNumber] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = useSignupOtpStart();
  const verify = useSignupOtpVerify();

  // Digits only, 5–12 chars — broad enough to cover all countries.
  const digits = localNumber.replace(/\D/g, "");
  const phoneValid = digits.length >= 5 && digits.length <= 12;
  const e164 = `${selectedCountry.code}${digits}`;

  // Resend countdown.
  useEffect(() => {
    if (mode.state !== "code" || mode.resendIn <= 0) return;
    const t = setInterval(() => {
      setMode((m) =>
        m.state === "code" && m.resendIn > 0
          ? { ...m, resendIn: m.resendIn - 1 }
          : m,
      );
    }, 1000);
    return () => clearInterval(t);
  }, [mode.state, mode.state === "code" ? mode.resendIn : 0]);

  const begin = async (channel: "sms" | "email", recipient: string) => {
    setError(null);
    try {
      const { expiresIn } = await start.mutateAsync({ channel, recipient });
      setMode({ state: "code", channel, recipient, resendIn: expiresIn });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          setError("Looks like you already have an account. Try signing in instead.");
          return;
        }
        if (e.status === 429) {
          setError(e.message || "Please wait a moment before trying again.");
          return;
        }
        if (e.isNetwork) {
          setError("Network error. Check your connection.");
          return;
        }
      }
      setError("Couldn't send the code. Please try again.");
    }
  };

  const resend = async () => {
    if (mode.state !== "code" || mode.resendIn > 0) return;
    await begin(mode.channel, mode.recipient);
  };

  const submit = async () => {
    if (mode.state !== "code") return;
    setError(null);
    try {
      const { verificationToken } = await verify.mutateAsync({
        channel: mode.channel,
        recipient: mode.recipient,
        code,
      });
      onVerified({
        channel: mode.channel,
        recipient: mode.recipient,
        token: verificationToken,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setError("That code didn't match. Check it and try again.");
        return;
      }
      setError("Couldn't verify the code. Please try again.");
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 24,
              paddingTop: 32,
              paddingBottom: 64,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-[440px]">
              {/* Header */}
              <Pressable
                onPress={onBack}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back"
                className="mb-md flex-row items-center"
              >
                <MaterialIcons name="arrow-back" size={24} color="#171d1c" />
                <Text className="font-label-md text-label-md ml-xs text-on-surface">
                  Back
                </Text>
              </Pressable>

              <Text className="font-headline-lg text-headline-lg tracking-tight text-primary">
                Verify your contact
              </Text>
              <Text className="font-body-md text-body-md mt-xs text-on-surface-variant">
                {mode.state === "pick"
                  ? "Pick a way for us to confirm you. We'll send a 6-digit code."
                  : "Enter the 6-digit code we just sent."}
              </Text>

              {/* Card */}
              <View
                className="mt-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
                style={{
                  ...Platform.select({
                    ios: {
                      shadowColor: "#475569",
                      shadowOpacity: 0.05,
                      shadowRadius: 20,
                      shadowOffset: { width: 0, height: 4 },
                    },
                    web: {
                      boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)",
                    },
                    android: {
                      elevation: 2,
                    },
                  }),
                }}
              >
                {mode.state === "pick" ? (
                  <PickerView
                    email={email}
                    selectedCountry={selectedCountry}
                    onOpenPicker={() => setPickerVisible(true)}
                    localNumber={localNumber}
                    setLocalNumber={setLocalNumber}
                    phoneValid={phoneValid}
                    isLoading={start.isPending}
                    onPickEmail={() => begin("email", email)}
                    onPickPhone={() => begin("sms", e164)}
                  />
                ) : (
                  <CodeEntryView
                    channel={mode.channel}
                    recipient={mode.recipient}
                    code={code}
                    setCode={setCode}
                    onSubmit={submit}
                    onResend={resend}
                    resendIn={mode.resendIn}
                    onChangeChannel={() => {
                      setMode({ state: "pick" });
                      setCode("");
                      setError(null);
                    }}
                    isSubmitting={verify.isPending}
                  />
                )}

                {error && (
                  <View className="mt-sm rounded-lg bg-error-container px-md py-sm">
                    <Text
                      className="font-label-sm text-label-sm text-on-error-container"
                      accessibilityLiveRegion="polite"
                    >
                      {error}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CountryPickerModal
        visible={pickerVisible}
        selected={selectedCountry}
        onSelect={setSelectedCountry}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface PickerProps {
  email: string;
  selectedCountry: Country;
  onOpenPicker: () => void;
  localNumber: string;
  setLocalNumber: (s: string) => void;
  phoneValid: boolean;
  isLoading: boolean;
  onPickEmail: () => void;
  onPickPhone: () => void;
}

function PickerView({
  email,
  selectedCountry,
  onOpenPicker,
  localNumber,
  setLocalNumber,
  phoneValid,
  isLoading,
  onPickEmail,
  onPickPhone,
}: PickerProps) {
  return (
    <View>
      <ChannelCard
        icon="mail-outline"
        title="Email"
        subtitle={email}
        disabled={isLoading}
        onPress={onPickEmail}
      />

      <View className="my-sm flex-row items-center gap-sm">
        <View className="h-px flex-1 bg-outline-variant/30" />
        <Text className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Or
        </Text>
        <View className="h-px flex-1 bg-outline-variant/30" />
      </View>

      <Text className="font-label-md text-label-md ml-xs text-on-surface-variant">
        Phone number
      </Text>

      {/* Country code + local number row */}
      <View
        className="mt-xs flex-row items-center overflow-hidden rounded-lg bg-surface"
        style={{ borderWidth: 1, borderColor: "#bcc9c6" }}
      >
        {/* Country code selector */}
        <Pressable
          onPress={onOpenPicker}
          accessibilityRole="button"
          accessibilityLabel={`Country code: ${selectedCountry.name} ${selectedCountry.code}. Tap to change.`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 12,
            borderRightWidth: 1,
            borderRightColor: "#bcc9c6",
            backgroundColor: pressed ? "#f4faf9" : "#ffffff",
            gap: 6,
          })}
        >
          <IsoBadge iso={selectedCountry.iso} />
          <Text style={{ color: "#171d1c", fontSize: 15, fontWeight: "600" }}>
            {selectedCountry.code}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={20} color="#6d7a77" />
        </Pressable>

        {/* Local number input */}
        <TextInput
          value={localNumber}
          onChangeText={(v) => setLocalNumber(v.replace(/[^\d\s\-()]/g, ""))}
          placeholder="24 123 4567"
          placeholderTextColor="#bcc9c6"
          keyboardType="phone-pad"
          autoCorrect={false}
          autoComplete="tel-national"
          textContentType="telephoneNumber"
          style={{
            flex: 1,
            paddingHorizontal: 12,
            paddingVertical: 12,
            color: "#171d1c",
            fontSize: 16,
          }}
        />
      </View>

      <Pressable
        onPress={onPickPhone}
        disabled={!phoneValid || isLoading}
        testID="signup-verify.send-sms"
        accessibilityRole="button"
        accessibilityLabel="Send code by SMS"
        accessibilityState={{ disabled: !phoneValid || isLoading }}
        style={({ pressed }) => ({
          opacity: !phoneValid || isLoading ? 0.5 : 1,
          backgroundColor: pressed ? "#008378" : "#00685f",
        })}
        className="mt-md w-full flex-row items-center justify-center gap-base rounded-lg py-md active:scale-[0.98]"
      >
        <MaterialIcons name="sms" size={20} color="#ffffff" />
        <Text className="font-label-md text-label-md text-on-primary">
          Send code by SMS
        </Text>
      </Pressable>
    </View>
  );
}

interface ChannelCardProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  title: string;
  subtitle: string;
  disabled: boolean;
  onPress: () => void;
}

function ChannelCard({ icon, title, subtitle, disabled, onPress }: ChannelCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Verify with ${title}: ${subtitle}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
      className="flex-row items-center gap-sm rounded-xl border border-outline-variant bg-surface p-md active:scale-[0.98]"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-container">
        <MaterialIcons name={icon} size={20} color="#00685f" />
      </View>
      <View className="flex-1">
        <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#6d7a77" />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface CodeEntryProps {
  channel: "sms" | "email";
  recipient: string;
  code: string;
  setCode: (s: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onChangeChannel: () => void;
  resendIn: number;
  isSubmitting: boolean;
}

function CodeEntryView({
  channel,
  recipient,
  code,
  setCode,
  onSubmit,
  onResend,
  onChangeChannel,
  resendIn,
  isSubmitting,
}: CodeEntryProps) {
  return (
    <View>
      <Text className="font-body-sm text-body-sm text-on-surface-variant">
        Sent to{" "}
        <Text className="font-label-md text-label-md text-on-surface">{recipient}</Text>
        {channel === "sms" ? " by SMS" : " by email"}.
      </Text>

      <Text className="font-label-md text-label-md ml-xs mt-md text-on-surface-variant">
        Verification code
      </Text>
      <View
        className="mt-xs rounded-lg bg-surface"
        style={{ borderWidth: 1, borderColor: "#bcc9c6", minHeight: 60 }}
      >
        <TextInput
          value={code}
          onChangeText={(v) => {
            const clean = v.replace(/\D/g, "").slice(0, 6);
            setCode(clean);
          }}
          placeholder="000000"
          placeholderTextColor="#bcc9c6"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          editable={!isSubmitting}
          autoFocus={true}
          style={{
            height: 60,
            width: "100%",
            color: "#171d1c",
            fontSize: 24,
            textAlign: "center",
            letterSpacing: 4,
          }}
        />
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={code.length !== 6 || isSubmitting}
        testID="signup-verify.submit"
        accessibilityRole="button"
        accessibilityLabel="Verify code"
        accessibilityState={{ disabled: code.length !== 6 || isSubmitting }}
        style={({ pressed }) => ({
          opacity: code.length !== 6 || isSubmitting ? 0.6 : 1,
          backgroundColor: pressed ? "#008378" : "#00685f",
          height: 56,
          marginTop: 24,
        })}
        className="w-full flex-row items-center justify-center gap-base rounded-lg active:scale-[0.98]"
      >
        <Text className="font-label-md text-label-md text-on-primary">
          {isSubmitting ? "Verifying…" : "Verify Code"}
        </Text>
        {!isSubmitting && <MaterialIcons name="check" size={20} color="#ffffff" />}
      </Pressable>

      <View className="mt-md flex-row items-center justify-between">
        <Pressable onPress={onChangeChannel} hitSlop={8} accessibilityRole="button">
          <Text className="font-label-sm text-label-sm text-primary">Change channel</Text>
        </Pressable>
        <Pressable
          onPress={onResend}
          disabled={resendIn > 0}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          accessibilityState={{ disabled: resendIn > 0 }}
        >
          <Text
            className="font-label-sm text-label-sm"
            style={{ color: resendIn > 0 ? "#6d7a77" : "#00685f" }}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
