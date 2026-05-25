// Bottom tab navigation for the authenticated app shell.
//
// Right now only "Home" has a destination — the other features (Overview,
// Inbox, Community, Lifestyle) haven't shipped screens yet. Tabs without a
// destination are rendered as visual stubs that no-op on press. Promote this
// component to `(app)/_layout.tsx` as `<Tabs>` once 2+ tabs have real routes.

import { Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface TabDef {
  key: string;
  label: string;
  icon: IconName;
  // Whether to render as active. For now we hard-pin Home; once Tabs lands,
  // expo-router will infer this from the active route segment.
  active?: boolean;
  onPress?: () => void;
}

interface Props {
  active?: string;
  onTabPress?: (key: string) => void;
}

export function BottomNav({ active = "home", onTabPress }: Props) {
  const tabs: TabDef[] = [
    { key: "home", label: "Home", icon: "home" },
    { key: "overview", label: "Overview", icon: "grid-view" },
    { key: "inbox", label: "Inbox", icon: "mail" },
    { key: "community", label: "Community", icon: "group" },
    { key: "lifestyle", label: "Lifestyle", icon: "auto-awesome" },
  ];

  return (
    <View
      className="absolute bottom-0 left-0 right-0 z-50 flex-row items-center justify-around rounded-t-xl border-t border-outline-variant/20 bg-surface px-base pb-md pt-sm"
      style={{
        shadowColor: "#475569",
        shadowOpacity: 0.05,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -4 },
        elevation: 8,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onTabPress?.(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={t.label}
            className={`flex-col items-center justify-center rounded-full px-sm py-xs active:scale-90 ${
              isActive ? "bg-primary-container" : ""
            }`}
          >
            <MaterialIcons
              name={t.icon}
              size={24}
              color={isActive ? "#f4fffc" : "#3d4947"}
            />
            <Text
              className={`font-label-sm text-label-sm mt-xs ${
                isActive ? "text-on-primary-container" : "text-on-surface-variant"
              }`}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
