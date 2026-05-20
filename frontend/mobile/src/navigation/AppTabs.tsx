import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "@/features/home/HomeScreen";
import { ChatScreen } from "@/features/chat/ChatScreen";
import { ProfileScreen } from "@/features/profile/ProfileScreen";
import { colors } from "@/core/theme/colors";
import type { AppTabParamList } from "@/navigation/types";

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
