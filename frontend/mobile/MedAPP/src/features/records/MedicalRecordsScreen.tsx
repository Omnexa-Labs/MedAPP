import { ScrollView, Text } from "react-native";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, InfoCallout } from "@/components/ui";

export function MedicalRecordsScreen() {
  return (
    <DetailShell
      title="Medical records"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(app)" as Href))}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}>
        <Text className="font-body-md text-body-md text-on-surface-variant">
          View the health information recorded for your account.
        </Text>
        <Card className="gap-3 p-4">
          <Text className="font-headline-md text-headline-md text-on-surface">
            Measurements and trends
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Read dated EHR measurements and their recorded notes, or open your health overview.
          </Text>
          <Button
            label="View recorded vitals"
            onPress={() => router.push("/(app)/vitals-timeline" as Href)}
          />
          <Button
            label="Open health overview"
            variant="outline"
            onPress={() => router.push("/(app)/overview" as Href)}
          />
        </Card>
        <Card className="gap-3 p-4">
          <Text className="font-headline-md text-headline-md text-on-surface">Lab results</Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Find lab results associated with your account.
          </Text>
          <Button
            label="View lab results"
            variant="outline"
            onPress={() => router.push("/(app)/lab-results" as Href)}
          />
        </Card>
        <Card className="gap-3 p-4">
          <Text className="font-headline-md text-headline-md text-on-surface">
            Care-team access
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            Choose the doctors and nurses who may read your EHR or add vitals.
          </Text>
          <Button
            label="Manage care-team sharing"
            variant="outline"
            onPress={() => router.push("/(app)/care-team-sharing" as Href)}
          />
        </Card>
        <InfoCallout>
          Document upload and downloadable lab reports are not available here yet.
        </InfoCallout>
      </ScrollView>
    </DetailShell>
  );
}
