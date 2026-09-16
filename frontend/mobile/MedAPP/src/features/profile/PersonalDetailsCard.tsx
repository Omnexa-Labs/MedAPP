import { Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import type { User } from "@/types/user";
import { formatProfileDate, GENDER_LABELS, GOAL_LABELS } from "./profile-form";

export function PersonalDetailsCard({ user }: { user: User | null }) {
  // A calendar date should not move a day when the device's timezone changes.
  const dateOfBirth = formatProfileDate(user?.dateOfBirth);
  const rows: [string, string | null | undefined][] = [
    ["Date of birth", dateOfBirth],
    ["Gender", user?.gender ? (GENDER_LABELS[user.gender] ?? user.gender) : null],
    ["Blood type (self-reported)", user?.bloodType],
    [
      "Primary health goal",
      user?.primaryGoal ? (GOAL_LABELS[user.primaryGoal] ?? user.primaryGoal) : null,
    ],
  ];

  return (
    <Card className="mt-md gap-md" testID="profile.personal-details">
      <Text
        accessibilityRole="header"
        className="font-headline-md text-headline-md text-on-surface"
      >
        Personal details
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} className="gap-1">
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
          <Text className="font-body-md text-body-md text-on-surface">
            {value || "Not provided"}
          </Text>
        </View>
      ))}
    </Card>
  );
}
