import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { z } from "zod";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, InfoCallout, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { medicationApi, occurrenceTime, type TrackingPage } from "./medication-api";
import {
  back,
  Field,
  Paging,
  text,
  useMedicationQuery,
  useMedicationWrite,
  WriteFeedback,
  type Scope,
} from "./MedicationComponents";
import { localDateKey } from "./schedule";

export function trackingSummary(page: TrackingPage) {
  const slots = page.items.flatMap((item) => item.slots);
  return {
    taken: slots.filter((s) => s.state === "taken").length,
    skipped: slots.filter((s) => s.state === "skipped").length,
    unreported: slots.filter((s) => s.state === "due" || s.state === "voided").length,
  };
}
const slotLabels = {
  due: "Not reported",
  upcoming: "Upcoming",
  not_scheduled: "Outside active tracking",
  taken: "Taken",
  skipped: "Skipped",
  voided: "Entry removed",
};
function Tracker({ scope }: { scope: Scope }) {
  const [day, setDay] = useState(() => localDateKey(new Date())),
    [input, setInput] = useState(day),
    [offset, setOffset] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const query = useMedicationQuery(scope, ["tracker", day, offset], (options) =>
    medicationApi.tracker(scope.owner!, day, offset, options),
  );
  const write = useMedicationWrite(scope, async () => {
    await query.refetch({ throwOnError: true });
  });
  useEffect(() => {
    const handle = setInterval(() => {
      if (scope.isCurrent() && !write.locked) void query.refetch();
    }, 60000);
    return () => clearInterval(handle);
  }, [scope.isCurrent, query.refetch, write.locked]);
  const summary = query.data && !query.error ? trackingSummary(query.data) : null;
  return (
    <FlatList
      data={query.error ? [] : (query.data?.items ?? [])}
      keyExtractor={(item) => item.course.id}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshing={query.isFetching && !query.isPending}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={
        <View className="gap-md">
          <Text
            accessibilityRole="header"
            className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface"
          >
            Daily medication log
          </Text>
          <Text className={text}>
            Entries are your reports. A dose with no report is not automatically marked skipped.
            Each medicine uses its saved timezone.
          </Text>
          <Field
            label="Tracking date (YYYY-MM-DD)"
            value={input}
            onChange={setInput}
            disabled={write.locked}
            maxLength={10}
          />
          <Button
            label="Show day"
            disabled={write.locked}
            onPress={() => {
              const valid = z.iso.date().safeParse(input);
              setInvalid(!valid.success);
              if (valid.success) {
                setDay(valid.data);
                setOffset(0);
                write.reloaded();
              }
            }}
          />
          <Button
            label="Today"
            variant="outline"
            disabled={write.locked}
            onPress={() => {
              const today = localDateKey(new Date());
              setDay(today);
              setInput(today);
              setOffset(0);
              setInvalid(false);
            }}
          />
          {invalid ? (
            <InfoCallout tone="error">Enter a valid date using YYYY-MM-DD.</InfoCallout>
          ) : null}
          {summary ? (
            <Card className="gap-sm">
              <Text className={text}>
                This page: {summary.taken} taken · {summary.skipped} skipped · {summary.unreported}{" "}
                not reported
              </Text>
              <Text className={text}>
                Scheduled entries only. Manual entries are listed separately.
              </Text>
              <Text className={text}>
                Checked {new Date(query.data!.server_now).toLocaleString()}
              </Text>
            </Card>
          ) : null}
          <WriteFeedback
            write={write}
            reload={async () => {
              const result = await query.refetch();
              if (!result.error) write.reloaded();
            }}
          />
        </View>
      }
      ListEmptyComponent={
        !scope.owner ? (
          <Text className={text}>Sign in to track medication.</Text>
        ) : query.isPending ? (
          <SkeletonCard shape="provider-card" count={2} />
        ) : query.error ? (
          <ErrorPanel
            title="Could not load medication tracking"
            body="Your reports could not be checked."
            retry={() => query.refetch()}
          />
        ) : (
          <Text className={text}>No medication courses for this date.</Text>
        )
      }
      renderItem={({ item }) => (
        <Card className="gap-md">
          <Text className="font-headline-md text-headline-md text-on-surface">
            {item.course.medicine.drug_name} {item.course.medicine.strength}
          </Text>
          <Text className={text}>
            {item.course.medicine.dose} · {item.course.medicine.frequency}
          </Text>
          <Text className={text}>{item.course.timezone}</Text>
          {item.slots.map((slot) => (
            <View key={slot.time} className="gap-sm">
              <Text className={text}>
                {slot.time} · {slotLabels[slot.state]}
              </Text>
              {slot.state === "due" ? (
                <View className="gap-sm">
                  {(["taken", "skipped"] as const).map((outcome) => (
                    <Button
                      key={outcome}
                      label={outcome === "taken" ? "Mark taken" : "Mark skipped"}
                      accessibilityLabel={
                        (outcome === "taken" ? "Mark taken " : "Mark skipped ") +
                        item.course.medicine.drug_name +
                        " " +
                        slot.time
                      }
                      disabled={write.locked}
                      onPress={() =>
                        write.send({
                          suffix: "/" + item.course.id + "/doses",
                          kind: "dose",
                          body: { version: item.course.version, day, time: slot.time, outcome },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {!item.slots.length ? (
            <Text className={text}>
              Manual tracking. Open medication details to record an occurrence now.
            </Text>
          ) : null}
          {item.manual_entries.map((dose) => (
            <Text key={dose.id} className={text}>
              {dose.outcome === "voided"
                ? "Entry removed"
                : dose.outcome === "taken"
                  ? "Taken"
                  : "Skipped"}{" "}
              · {occurrenceTime(dose.occurred_at, item.course.timezone)} (manual)
            </Text>
          ))}
          <Button
            label="Medication details and history"
            variant="outline"
            disabled={write.locked}
            onPress={() =>
              router.push({
                pathname: "/(app)/medication-details",
                params: { id: item.course.id },
              } as Href)
            }
          />
        </Card>
      )}
      ListFooterComponent={
        <View className="gap-md">
          <Paging
            offset={offset}
            next={query.error ? null : query.data?.next_offset}
            onPage={setOffset}
            disabled={write.locked || query.isFetching}
          />
          <Button
            label="Add a medication"
            variant="outline"
            disabled={write.locked}
            onPress={() => router.push("/(app)/add-medication" as Href)}
          />
        </View>
      }
    />
  );
}
export function MedicationTrackerScreen() {
  const scope = useSessionScope();
  return (
    <DetailShell title="Medication tracker" onBack={back}>
      <Tracker key={scope.owner + ":" + scope.revision} scope={scope} />
    </DetailShell>
  );
}
