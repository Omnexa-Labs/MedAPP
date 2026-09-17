import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import type { Course, Dose, TrackingPage } from "../medication-api";

export const patient = "11111111-1111-4111-8111-111111111111";
export const other = "22222222-2222-4222-8222-222222222222";
export const id = "33333333-3333-4333-8333-333333333333";
let mockOwner = patient;
let mockParams: Record<string, string> = {};
export function owner(value: string) {
  mockOwner = value;
}
export function params(value: Record<string, string>) {
  mockParams = value;
}
jest.mock("@/lib/config", () => ({ config: { appEnv: "dev" } }));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      token: "qa-access-token",
      user: { id: mockOwner },
      isAuthenticated: true,
      revision: 1,
    }),
  },
}));
jest.mock("../reminder-device", () => ({ enableReminderDevice: jest.fn() }));
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => {
    const current = mockOwner;
    return {
      owner: current,
      revision: 1,
      user: { id: current, accountRole: "patient" },
      isCurrent: require("react").useCallback(() => current === mockOwner, [current]),
    };
  },
}));
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), post: jest.fn() } }));
jest.mock("@/lib/documents", () => ({
  saveTextDocument: jest.fn(),
  describeSaveResult: () => ({ message: "Copy saved" }),
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  usePreventRemove: jest.fn(),
}));
export const course: Course = {
  id,
  patient_user_id: patient,
  source: "self_reported",
  prescription_id: null,
  prescription_item: null,
  prescription_status: null,
  prescriber_name: null,
  medicine: {
    drug_name: "Saved medicine",
    strength: "10mg",
    form: "tablet",
    dose: "1 tablet",
    route: "Oral",
    frequency: "Once daily",
    duration: "",
    instructions: "",
  },
  status: "active",
  version: 1,
  start_date: "2026-09-01",
  end_date: null,
  timezone: "Africa/Accra",
  daily_times: ["08:00", "20:00"],
  schedule_changes: [],
  reminders_enabled: false,
  created_at: "2026-09-01T12:00:00Z",
};
export const dose: Dose = {
  id: "55555555-5555-4555-8555-555555555555",
  course_id: id,
  patient_user_id: patient,
  day: "2026-09-16",
  time: "08:00",
  scheduled_at: "2026-09-16T08:00:00Z",
  occurred_at: null,
  outcome: "taken",
  note: "",
  version: 1,
  reported_at: "2026-09-16T09:00:00Z",
};
export const page = { items: [course], offset: 0, limit: 25, next_offset: null };
export const empty = { items: [], offset: 0, limit: 25, next_offset: null };
export const tracking: TrackingPage = {
  day: "2026-09-16",
  server_now: "2026-09-16T12:00:00Z",
  offset: 0,
  limit: 25,
  next_offset: null,
  items: [
    {
      course,
      slots: [
        { time: "08:00", scheduled_at: "2026-09-16T08:00:00Z", state: "due", dose: null },
        { time: "20:00", scheduled_at: "2026-09-16T20:00:00Z", state: "upcoming", dose: null },
      ],
      manual_entries: [],
    },
  ],
};
export function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
export function tree(qc: QueryClient, children: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
