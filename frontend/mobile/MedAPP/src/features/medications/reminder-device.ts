import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { client } from "@/lib/api/client";
import { pushToken, clearReminderNotifications } from "./push-platform";

const key = "medapp.medication-reminder-binding.v1";
const bindingSchema = z.object({ owner: z.string().uuid(), binding: z.string().uuid() });
type Binding = z.infer<typeof bindingSchema>;
export type ReminderSession = { owner: string; token: string; current: () => boolean };
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}
async function saved(): Promise<Binding | null> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    return bindingSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
function path(owner: string) {
  return `/v1/patients/${z.string().uuid().parse(owner)}/medications`;
}
function options(session: ReminderSession) {
  // Capture this session's credential. A delayed request must never acquire a new account's token.
  return { withAuth: false, headers: { Authorization: `Bearer ${session.token}` } };
}
async function deadline<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
async function disable(binding: Binding, session: ReminderSession) {
  await deadline((signal) =>
    client.post(
      `${path(binding.owner)}/reminder-devices/${binding.binding}/disable`,
      {},
      { ...options(session), signal },
    ),
  );
}
async function register(session: ReminderSession, binding: Binding, token: string) {
  const response = await deadline((signal) =>
    client.post(
      `${path(session.owner)}/reminder-devices`,
      {
        binding_id: binding.binding,
        push_token: token,
      },
      { ...options(session), isSessionCurrent: session.current, signal },
    ),
  );
  const result = z
    .object({
      patient_user_id: z.string().uuid(),
      binding_id: z.string().uuid(),
      enabled: z.literal(true),
      expires_at: z.iso.datetime({ offset: true }),
    })
    .parse(response);
  if (result.patient_user_id !== session.owner || result.binding_id !== binding.binding)
    throw new Error("The reminder device could not be confirmed.");
  if (!session.current()) {
    await disable(binding, session).catch(() => {});
    throw new Error("Your sign-in changed. Open this screen again.");
  }
  return result;
}
export function enableReminderDevice(session: ReminderSession) {
  return serial(async () => {
    if (!session.current()) throw new Error("Your sign-in changed.");
    const capability = z.object({ push_available: z.boolean() }).parse(
      await deadline((signal) =>
        client.get(`${path(session.owner)}/reminder-capability`, {
          ...options(session),
          isSessionCurrent: session.current,
          signal,
        }),
      ),
    );
    if (!capability.push_available)
      throw new Error("Device reminder delivery has not been configured yet.");
    const token = await pushToken(true);
    if (!session.current()) throw new Error("Your sign-in changed.");
    if (!token)
      throw new Error(
        "Notifications are not allowed. Enable them in your device settings, then try again.",
      );
    const existing = await saved();
    const binding =
      existing?.owner === session.owner
        ? existing
        : { owner: session.owner, binding: randomUUID() };
    // Persist before registration so a lost response can be renewed/disabled using the same binding.
    await AsyncStorage.setItem(key, JSON.stringify(binding));
    return register(session, binding, token);
  });
}
export function renewReminderDevice(session: ReminderSession) {
  return serial(async () => {
    const binding = await saved();
    if (!session.current() || binding?.owner !== session.owner) return;
    const token = await pushToken(false);
    if (!session.current()) return;
    if (!token) {
      await disable(binding, session);
      return;
    }
    await register(session, binding, token);
  });
}
export function revokeReminderDevice(session: ReminderSession) {
  return serial(async () => {
    const binding = await saved();
    if (binding?.owner === session.owner) {
      await AsyncStorage.removeItem(key);
      await disable(binding, session).catch(() => {});
    }
    await clearReminderNotifications().catch(() => {});
  });
}
