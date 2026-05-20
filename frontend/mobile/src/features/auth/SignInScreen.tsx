import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "@/store/authStore";
import type { AuthStackParamList } from "@/navigation/types";

type Nav = NativeStackNavigationProp<AuthStackParamList, "SignIn">;

const isValidEmail = (v: string) => /\S+@\S+\.\S+/.test(v);

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("demo@medapp.test");
  const [password, setPassword] = useState("demo1234");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const eErr = isValidEmail(email) ? null : "Enter a valid email";
    const pErr = password.length >= 4 ? null : "4+ characters required";
    setEmailError(eErr);
    setPasswordError(pErr);
    return !eErr && !pErr;
  };

  const onSubmit = async () => {
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch {
      setFormError("Login failed. Check credentials and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6">
          <Text className="text-4xl font-bold text-slate-900">MedApp</Text>
          <Text className="text-base text-slate-500 mt-2 mb-8">Sign in to continue</Text>

          <Text className="text-sm text-slate-700 mb-1">Email</Text>
          <TextInput
            testID="login.email"
            className={`border rounded-lg px-4 py-3 mb-1 text-base ${
              emailError ? "border-red-400" : "border-slate-200"
            }`}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(null);
            }}
          />
          {emailError && <Text className="text-red-500 text-xs mb-2">{emailError}</Text>}

          <Text className="text-sm text-slate-700 mt-3 mb-1">Password</Text>
          <TextInput
            testID="login.password"
            className={`border rounded-lg px-4 py-3 mb-1 text-base ${
              passwordError ? "border-red-400" : "border-slate-200"
            }`}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError(null);
            }}
          />
          {passwordError && <Text className="text-red-500 text-xs mb-2">{passwordError}</Text>}

          {formError && (
            <Text className="text-red-500 text-sm mt-3" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          )}

          <Pressable
            testID="login.submit"
            onPress={onSubmit}
            disabled={busy}
            className={`mt-6 rounded-lg py-3 items-center ${
              busy ? "bg-primary/60" : "bg-primary active:opacity-80"
            }`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">Sign in</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("SignUp")}
            className="mt-3 py-2 items-center"
          >
            <Text className="text-primary font-medium">Create an account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
