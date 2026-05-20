import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { SignUpScreen } from "@/features/auth/SignUpScreen";
import type { AuthStackParamList } from "@/navigation/types";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}
