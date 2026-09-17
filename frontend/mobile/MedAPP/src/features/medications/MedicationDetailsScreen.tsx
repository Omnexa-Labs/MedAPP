import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { z } from "zod";
import { DetailShell } from "@/components/shell";
import { Button, Card, ErrorPanel, InfoCallout, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { MedicationPlanControls } from "./MedicationPlanControls";
import {
  medicationApi,
  occurrenceTime,
  statusLabel,
  eventLabel,
  type Course,
  type Dose,
} from "./medication-api";
import {
  back,
  CourseContents,
  Field,
  Paging,
  text,
  useMedicationQuery,
  useMedicationWrite,
  WriteFeedback,
  type Scope,
} from "./MedicationComponents";

function Details({ scope, id }: { scope: Scope; id: string }) {
  const valid = z.string().uuid().safeParse(id).success;
  const [offset, setOffset] = useState(0),
    [activity, setActivity] = useState(false);
  const [target, setTarget] = useState<Course["status"] | null>(null),
    [reason, setReason] = useState("");
  const [correction, setCorrection] = useState<Dose | null>(null),
    [outcome, setOutcome] = useState<Dose["outcome"]>("taken");
  const course = useMedicationQuery(
    scope,
    ["detail", id],
    (options) => medicationApi.detail(scope.owner!, id, options),
    valid,
  );
  const doses = useMedicationQuery(
    scope,
    ["doses", id, offset],
    (options) => medicationApi.doses(scope.owner!, id, offset, options),
    valid && !activity,
  );
  const events = useMedicationQuery(
    scope,
    ["events", id, offset],
    (options) => medicationApi.events(scope.owner!, id, offset, options),
    valid && activity,
  );
  async function refresh() {
    await Promise.all([
      course.refetch({ throwOnError: true }),
      activity ? events.refetch({ throwOnError: true }) : doses.refetch({ throwOnError: true }),
    ]);
    if (scope.isCurrent()) {
      setTarget(null);
      setCorrection(null);
      setReason("");
    }
  }
  const write = useMedicationWrite(scope, refresh);
  const data = course.data;
  if (!scope.owner || !valid)
    return (
      <View className="p-md">
        <Text className={text}>Open a medication from your saved list.</Text>
        <Button
          label="Medication list"
          onPress={() => router.replace("/(app)/active-medications" as Href)}
        />
      </View>
    );
  if (course.isPending) return <SkeletonCard shape="provider-card" count={2} />;
  if (course.error || !data)
    return (
      <ErrorPanel
        title="Medication unavailable"
        body="This record could not be loaded for your account."
        retry={() => course.refetch()}
      />
    );
  const withdrawn =
    data.prescription_status === "cancelled" || data.prescription_status === "superseded";
  const history = activity ? events : doses;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <CourseContents course={data} />
      <InfoCallout>
        These are your tracking records. Changing tracking status does not change your prescription,
        cancel pharmacy dispensing, or tell you to change treatment.
      </InfoCallout>
      {withdrawn ? (
        <InfoCallout tone="error">
          This prescription has been withdrawn. Check the saved prescription and contact your care
          team about your plan. Earlier dose reports remain in your history.
        </InfoCallout>
      ) : null}
      {data.prescription_id ? (
        <Button
          label="View source prescription"
          variant="outline"
          onPress={() =>
            router.push({
              pathname: "/(app)/active-script-view",
              params: { id: data.prescription_id! },
            } as Href)
          }
        />
      ) : null}
      <Button
        label="View pharmacy reports"
        variant="outline"
        onPress={() => router.push("/(app)/pharmacy-prescription-history" as Href)}
      />
      <Button
        label="Open dose tracker"
        onPress={() => router.push("/(app)/medication-tracker" as Href)}
      />
      {!data.daily_times.length && data.status === "active" && !withdrawn ? (
        <View className="gap-sm">
          <Text className={text}>
            Manual entry records an occurrence now. It does not calculate when another dose is due.
          </Text>
          {(["taken", "skipped"] as const).map((value) => (
            <Button
              key={value}
              label={value === "taken" ? "Record taken now" : "Record skipped now"}
              disabled={write.locked}
              onPress={() =>
                write.send({
                  suffix: "/" + id + "/doses",
                  kind: "dose",
                  body: {
                    version: data.version,
                    outcome: value,
                    occurred_at: new Date().toISOString(),
                  },
                })
              }
            />
          ))}
        </View>
      ) : null}
      <WriteFeedback
        write={write}
        reload={async () => {
          try {
            await refresh();
            write.reloaded();
          } catch {
            /* query error owns reload feedback */
          }
        }}
      />
      <MedicationPlanControls course={data} scope={scope} write={write} />
      <View className="gap-sm">
        <Text
          accessibilityRole="header"
          className="font-headline-md text-headline-md text-on-surface"
        >
          Update tracking status
        </Text>
        {(data.status === "active"
          ? (["paused", "stopped", "completed"] as const)
          : data.status === "paused"
            ? (["active", "stopped", "completed"] as const)
            : (["active"] as const)
        ).map((value) => (
          <Button
            key={value}
            label={
              value === "active"
                ? "Resume tracking"
                : value === "paused"
                  ? "Pause tracking"
                  : value === "stopped"
                    ? "Mark tracking stopped"
                    : "Mark course completed"
            }
            variant="outline"
            disabled={write.locked || (value === "active" && withdrawn)}
            onPress={() => {
              setTarget(value);
              setCorrection(null);
              setReason("");
            }}
          />
        ))}
      </View>
      {target ? (
        <Card className="gap-sm">
          <Text className={text}>
            Record tracking as {statusLabel[target].toLowerCase()}? This is your report of the
            course.
          </Text>
          <Field
            label="Reason for tracking change"
            value={reason}
            onChange={setReason}
            disabled={write.locked}
            maxLength={500}
          />
          <Button
            label="Confirm tracking change"
            disabled={write.locked || reason.trim().length < 3}
            onPress={() =>
              write.send({
                suffix: "/" + id + "/status",
                kind: "course",
                body: { version: data.version, status: target, reason: reason.trim() },
              })
            }
          />
          <Button
            label="Keep current status"
            variant="outline"
            disabled={write.locked}
            onPress={() => setTarget(null)}
          />
        </Card>
      ) : null}
      <Text
        accessibilityRole="header"
        className="font-headline-md text-headline-md text-on-surface"
      >
        {activity ? "Tracking activity" : "Dose history"}
      </Text>
      <Button
        label={activity ? "Show dose entries" : "Show activity and corrections"}
        variant="outline"
        disabled={write.locked}
        onPress={() => {
          setOffset(0);
          setActivity(!activity);
        }}
      />
      {history.isPending ? (
        <SkeletonCard shape="provider-card" count={1} />
      ) : history.error ? (
        <ErrorPanel
          title="Could not load history"
          body="Your saved history could not be checked."
          retry={() => history.refetch()}
        />
      ) : activity ? (
        events.data?.items.length ? (
          events.data.items.map((event) => (
            <Card key={event.id} className="gap-sm">
              <Text className={text}>{eventLabel(event)}</Text>
              <Text className={text}>Recorded {new Date(event.recorded_at).toLocaleString()}</Text>
            </Card>
          ))
        ) : (
          <Text className={text}>No tracking activity on this page.</Text>
        )
      ) : doses.data?.items.length ? (
        doses.data.items.map((dose) => (
          <Card key={dose.id} className="gap-sm">
            <Text className={text}>
              {dose.outcome === "voided"
                ? "Entry removed"
                : dose.outcome === "taken"
                  ? "Taken"
                  : "Skipped"}{" "}
              · {dose.day} {dose.time ?? occurrenceTime(dose.occurred_at, data.timezone)}
            </Text>
            <Text className={text}>
              First reported {new Date(dose.reported_at).toLocaleString()}
            </Text>
            {dose.note ? <Text className={text}>{dose.note}</Text> : null}
            <Button
              label="Correct entry"
              accessibilityLabel={"Correct entry " + dose.day + " " + (dose.time ?? "manual")}
              variant="outline"
              disabled={write.locked}
              onPress={() => {
                setCorrection(dose);
                setOutcome(dose.outcome);
                setTarget(null);
                setReason("");
              }}
            />
          </Card>
        ))
      ) : (
        <Text className={text}>No dose entries on this page.</Text>
      )}
      <Paging
        offset={offset}
        next={history.error ? null : history.data?.next_offset}
        onPage={setOffset}
        disabled={write.locked || history.isFetching}
      />
      {correction ? (
        <Card className="gap-sm">
          <Text className={text}>
            Correct the entry for {correction.day} {correction.time ?? "manual dose"}. The earlier
            report stays in activity history.
          </Text>
          <View className="gap-sm">
            {(["taken", "skipped", "voided"] as const).map((value) => (
              <Button
                key={value}
                label={
                  value === "voided"
                    ? "Remove mistaken entry"
                    : value === "taken"
                      ? "Taken"
                      : "Skipped"
                }
                variant={outcome === value ? "primary" : "outline"}
                accessibilityState={{ selected: outcome === value }}
                disabled={write.locked}
                onPress={() => setOutcome(value)}
              />
            ))}
          </View>
          <Field
            label="Reason for dose correction"
            value={reason}
            onChange={setReason}
            disabled={write.locked}
            maxLength={500}
          />
          <Button
            label="Save dose correction"
            disabled={write.locked || reason.trim().length < 3 || outcome === correction.outcome}
            onPress={() =>
              write.send({
                suffix: "/" + id + "/doses/" + correction.id + "/correct",
                kind: "dose",
                body: { version: correction.version, outcome, reason: reason.trim() },
              })
            }
          />
          <Button
            label="Keep dose entry"
            variant="outline"
            disabled={write.locked}
            onPress={() => setCorrection(null)}
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}
export function MedicationDetailsScreen() {
  const scope = useSessionScope();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <DetailShell title="Medication details" onBack={back}>
      <Details key={scope.owner + ":" + scope.revision + ":" + id} scope={scope} id={id ?? ""} />
    </DetailShell>
  );
}
