import { useState } from "react";
import { Text, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import { z } from "zod";
import { Button, Card, InfoCallout } from "@/components/ui";
import { useAuthStore } from "@/store/auth-store";
import { client } from "@/lib/api/client";
import { scheduleChange, type Course } from "./medication-api";
import {
  Field,
  Paging,
  text,
  useMedicationQuery,
  type Scope,
  type useMedicationWrite,
} from "./MedicationComponents";
import { enableReminderDevice } from "./reminder-device";

function tomorrow(zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  const date = new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function ScheduleEditor({
  course,
  write,
  close,
}: {
  course: Course;
  write: ReturnType<typeof useMedicationWrite>;
  close: () => void;
}) {
  const first = tomorrow(course.timezone);
  const pending = course.schedule_changes.find((p) => p.effective_date >= first);
  const [effective, setEffective] = useState(
    pending?.effective_date ?? (course.start_date > first ? course.start_date : first),
  );
  const [end, setEnd] = useState(pending ? (pending.end_date ?? "") : (course.end_date ?? ""));
  const [times, setTimes] = useState((pending?.daily_times ?? course.daily_times).join(", "));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Card className="gap-sm">
      <Text className={text}>
        Change future tracking times in {course.timezone}. The original start date and timezone stay
        fixed. Past dose history and prescription directions stay attached to their original plan.
      </Text>
      {pending ? (
        <InfoCallout>
          {`Saving replaces the pending change from ${pending.effective_date}. Its earlier values remain in activity history.`}
        </InfoCallout>
      ) : null}
      <Field
        label="New plan starts (YYYY-MM-DD)"
        value={effective}
        onChange={setEffective}
        disabled={write.locked}
        maxLength={10}
      />
      <Field
        label="New end date (optional, YYYY-MM-DD)"
        value={end}
        onChange={setEnd}
        disabled={write.locked}
        maxLength={10}
      />
      <Field
        label="New daily times (HH:MM, comma separated)"
        value={times}
        onChange={setTimes}
        disabled={write.locked}
      />
      <Text className={text}>
        Leave times empty for manual tracking. Choose tomorrow or later in the saved timezone. Use
        times consistent with your care plan.
      </Text>
      <Field
        label="Reason for schedule change"
        value={reason}
        onChange={setReason}
        disabled={write.locked}
        maxLength={500}
      />
      {error ? <InfoCallout tone="error">{error}</InfoCallout> : null}
      <Button
        label="Save future schedule"
        disabled={write.locked}
        onPress={() => {
          const result = scheduleChange.safeParse({
            version: course.version,
            effective_date: effective.trim(),
            end_date: end.trim() || null,
            daily_times: times.trim() ? times.split(",").map((v) => v.trim()) : [],
            reason: reason.trim(),
          });
          if (!result.success || effective < first || effective < course.start_date) {
            setError(
              "Check the future date, end date, unique HH:MM times, and a reason of at least three characters.",
            );
            return;
          }
          setError("");
          void write.send({ suffix: `/${course.id}/schedule`, kind: "course", body: result.data });
        }}
      />
      <Button
        label="Close schedule editor"
        variant="outline"
        disabled={write.locked}
        onPress={close}
      />
    </Card>
  );
}

const attemptPage = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        scheduled_at: z.iso.datetime({ offset: true }),
        state: z.enum(["accepted", "rejected", "unconfirmed", "suppressed"]),
        error_code: z.string().nullable(),
      }),
    )
    .max(25),
  limit: z.literal(25),
  offset: z.number().int().nonnegative(),
  next_offset: z.number().int().nonnegative().nullable(),
});

export function MedicationPlanControls({
  course,
  scope,
  write,
}: {
  course: Course;
  scope: Scope;
  write: ReturnType<typeof useMedicationWrite>;
}) {
  const [editing, setEditing] = useState(false),
    [history, setHistory] = useState(false),
    [offset, setOffset] = useState(0);
  const [deviceBusy, setDeviceBusy] = useState(false),
    [deviceMessage, setDeviceMessage] = useState("");
  usePreventRemove(deviceBusy && scope.isCurrent(), () => {});
  const attempts = useMedicationQuery(
    scope,
    ["reminder-history", course.id, offset],
    async (options) => {
      const page = attemptPage.parse(
        await client.get(
          `/v1/patients/${scope.owner}/medications/${course.id}/reminder-history?limit=25&offset=${offset}`,
          options,
        ),
      );
      if (page.offset !== offset || (page.next_offset !== null && page.next_offset !== offset + 25))
        throw new Error("Reminder history page could not be confirmed.");
      return page;
    },
    history,
  );
  const withdrawn =
    course.prescription_status === "cancelled" || course.prescription_status === "superseded";
  const editable = !withdrawn && (course.status === "active" || course.status === "paused");
  const pending = course.schedule_changes.filter(
    (p) => p.effective_date >= tomorrow(course.timezone),
  );
  return (
    <View className="gap-sm">
      <Text
        accessibilityRole="header"
        className="font-headline-md text-headline-md text-on-surface"
      >
        Schedule and reminders
      </Text>
      {pending.map((plan) => (
        <InfoCallout key={plan.effective_date}>
          {`From ${plan.effective_date}: ${plan.daily_times.join(", ") || "manual tracking"} · ${course.timezone}${plan.end_date ? ` · ends ${plan.end_date}` : " · no end date"}`}
        </InfoCallout>
      ))}
      <Button
        label="Edit future schedule"
        variant="outline"
        disabled={write.locked || deviceBusy || !editable}
        onPress={() => setEditing(true)}
      />
      {editing ? (
        <ScheduleEditor
          key={course.version}
          course={course}
          write={write}
          close={() => setEditing(false)}
        />
      ) : null}
      <Text className={text}>
        Reminder preference: {course.reminders_enabled ? "On" : "Off"}. Delivery requires an enabled
        device, notification permission. Manual tracking has no timed reminders.
      </Text>
      {course.reminders_enabled && (course.status !== "active" || withdrawn) ? (
        <InfoCallout>
          Reminder delivery is suspended while tracking is inactive or the prescription is
          withdrawn.
        </InfoCallout>
      ) : null}
      <Button
        label={course.reminders_enabled ? "Turn reminders off" : "Turn reminders on"}
        variant="outline"
        disabled={
          write.locked ||
          deviceBusy ||
          (!course.reminders_enabled &&
            (withdrawn ||
              course.status !== "active" ||
              (!course.daily_times.length && !pending.some((p) => p.daily_times.length))))
        }
        onPress={() =>
          write.send({
            suffix: `/${course.id}/reminders`,
            kind: "course",
            body: { version: course.version, enabled: !course.reminders_enabled },
          })
        }
      />
      {course.reminders_enabled ? (
        <>
          <Button
            label="Enable or check this device"
            disabled={write.locked || deviceBusy || withdrawn || course.status !== "active"}
            onPress={async () => {
              const auth = useAuthStore.getState();
              if (!scope.isCurrent() || !auth.token || auth.user?.id !== scope.owner) return;
              setDeviceBusy(true);
              setDeviceMessage("");
              try {
                const device = await enableReminderDevice({
                  owner: scope.owner!,
                  token: auth.token,
                  current: scope.isCurrent,
                });
                if (scope.isCurrent())
                  setDeviceMessage(
                    `Device registered through ${new Date(device.expires_at).toLocaleDateString()}. Opening MedApp renews registration. This does not confirm that a notification has arrived.`,
                  );
              } catch (error) {
                if (scope.isCurrent())
                  setDeviceMessage(
                    error instanceof Error
                      ? error.message
                      : "Device registration could not be confirmed.",
                  );
              } finally {
                if (scope.isCurrent()) setDeviceBusy(false);
              }
            }}
          />
          <Text className={text}>
            Notifications contain a generic prompt to open your tracker. Delivery may be delayed or
            unavailable; a reminder never records a dose for you.
          </Text>
        </>
      ) : null}
      {deviceMessage ? <InfoCallout>{deviceMessage}</InfoCallout> : null}
      <Button
        label={history ? "Hide reminder activity" : "View reminder activity"}
        variant="outline"
        disabled={write.locked || deviceBusy}
        onPress={() => {
          setHistory(!history);
          setOffset(0);
        }}
      />
      {history ? (
        <>
          {attempts.isPending ? (
            <Text className={text}>Checking reminder activity…</Text>
          ) : attempts.error ? (
            <Button label="Retry reminder activity" onPress={() => attempts.refetch()} />
          ) : attempts.data?.items.length ? (
            attempts.data.items.map((attempt) => (
              <Card key={attempt.id}>
                <Text className={text}>
                  {new Date(attempt.scheduled_at).toLocaleString()}:{" "}
                  {attempt.state === "accepted"
                    ? "Accepted by push provider; arrival unconfirmed"
                    : attempt.state === "suppressed"
                      ? "Cancelled before sending"
                      : attempt.state === "rejected"
                        ? "Rejected by push provider"
                        : "Send result unconfirmed; not resent"}
                </Text>
              </Card>
            ))
          ) : (
            <Text className={text}>No reminder attempts on this page.</Text>
          )}
          <Paging
            offset={offset}
            next={attempts.error ? null : attempts.data?.next_offset}
            onPage={setOffset}
            disabled={attempts.isFetching}
          />
        </>
      ) : null}
    </View>
  );
}
