import type { ComponentType } from "react";
import { Platform, View } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type { Provider } from "./provider-api";

export class ProviderCancelled extends Error {}
type ButtonProps = { onPress: () => void; disabled: boolean; dark: boolean };
export type NativeProvider = {
  Button: ComponentType<ButtonProps>;
  authenticate: (nonce: string) => Promise<string>;
};
export type NativeProviders = Partial<Record<Provider, NativeProvider>>;

// Load native modules only after checking build configuration and platform support.
// This lets email authentication continue in web, Expo Go and unconfigured builds.
export async function loadNativeProviders(): Promise<NativeProviders> {
  const result: NativeProviders = {};
  if (Platform.OS === "web" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    return result;
  const extra = Constants.expoConfig?.extra ?? {};
  if (extra.googleWebClientId && extra.googleIosClientId) {
    try {
      const google: typeof import("react-native-nitro-google-signin") = require("react-native-nitro-google-signin");
      result.google = {
        Button: ({ onPress, disabled, dark }) => (
          <google.GoogleSignInButton
            accessibilityLabel="Continue with Google"
            size="wide"
            signInBehavior="none"
            onPress={onPress}
            disabled={disabled}
            colorScheme={dark ? "dark" : "light"}
            style={{ height: 48, width: "100%" }}
          />
        ),
        authenticate: async (nonce) => {
          google.GoogleOneTapSignIn.configure({
            webClientId: extra.googleWebClientId,
            iosClientId: extra.googleIosClientId,
            nonce,
            offlineAccess: false,
            autoSelectOnSignIn: false,
          });
          try {
            if (Platform.OS === "android") await google.GoogleOneTapSignIn.checkPlayServices();
            // Explicit account selection returns a fresh proof with this request's nonce.
            const response = await google.GoogleOneTapSignIn.presentExplicitSignIn();
            if (google.isCancelledResponse(response)) throw new ProviderCancelled();
            if (!google.isSuccessResponse(response) || !response.data.idToken)
              throw new Error("Google did not return a sign-in proof. Try again.");
            return response.data.idToken;
          } catch (error) {
            if (
              google.isErrorWithCode(error) &&
              error.code === google.statusCodes.SIGN_IN_CANCELLED
            )
              throw new ProviderCancelled();
            throw error;
          }
        },
      };
    } catch {
      /* Native availability is reported by the screen, without crashing email sign-in. */
    }
  }
  if (Platform.OS === "ios" && extra.appleSignInEnabled === true) {
    try {
      const apple: typeof import("expo-apple-authentication") = require("expo-apple-authentication");
      if (await apple.isAvailableAsync()) {
        result.apple = {
          Button: ({ onPress, disabled, dark }) => (
            <View pointerEvents={disabled ? "none" : "auto"} accessibilityElementsHidden={disabled}>
              <apple.AppleAuthenticationButton
                accessibilityLabel="Continue with Apple"
                buttonType={apple.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  dark
                    ? apple.AppleAuthenticationButtonStyle.WHITE
                    : apple.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={12}
                style={{ height: 48, width: "100%" }}
                onPress={onPress}
              />
            </View>
          ),
          authenticate: async (nonce) => {
            try {
              const credential = await apple.signInAsync({
                nonce,
                state: nonce,
                requestedScopes: [apple.AppleAuthenticationScope.EMAIL],
              });
              if (credential.state !== nonce || !credential.identityToken)
                throw new Error("Apple did not return a matching sign-in proof. Try again.");
              return credential.identityToken;
            } catch (error) {
              if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "ERR_REQUEST_CANCELED"
              )
                throw new ProviderCancelled();
              throw error;
            }
          },
        };
      }
    } catch {
      /* Unsupported native build; the screen retains email sign-in. */
    }
  }
  return result;
}
