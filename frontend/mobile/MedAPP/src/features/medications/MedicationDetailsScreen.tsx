import { Text, View } from "react-native";
import { router, type Href, useLocalSearchParams } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Card, Icon } from "@/components/ui";
import { ACTIVE_MEDICATIONS } from "./mock-data";

/** Local placeholder route until provider-backed medication records are available. */
export function MedicationDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const medication = ACTIVE_MEDICATIONS.find((item) => item.id === id);

  return (
    <DetailShell
      title="Medication details"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
    >
      <View className="p-4">
        <Card>
          <View className="flex-row items-center gap-3">
            <Icon name="medication" size={24} />
            <Text className="flex-1 font-headline-md text-headline-md text-on-surface" numberOfLines={2}>
              {medication?.name ?? "Medication details"}
            </Text>
          </View>
          <Text className="mt-4 font-body-md text-body-md text-on-surface-variant">
            Detailed medication records will appear here when your healthcare provider connects them to MedApp.
          </Text>
        </Card>
      </View>
    </DetailShell>
  );
}
