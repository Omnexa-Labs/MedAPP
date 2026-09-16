import { client } from "@/lib/api/client";
import { sessionDeviceLabel, sessionsApi, type AccountSession } from "../sessions-api";

jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), delete: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

test("session paging uses the authenticated self endpoint", async () => {
  jest.mocked(client.get).mockResolvedValue({ items: [], next_offset: null });
  await sessionsApi.list(25);
  expect(client.get).toHaveBeenCalledWith("/v1/me/sessions?offset=25&limit=25");
});

test("revocation encodes the selected identifier and preserves API errors", async () => {
  const failure = new Error("offline");
  jest.mocked(client.delete).mockRejectedValue(failure);
  await expect(sessionsApi.revoke("a/b")).rejects.toBe(failure);
  expect(client.delete).toHaveBeenCalledWith("/v1/me/sessions/a%2Fb");
});

test("device labels come from reported data without inventing a phone model or location", () => {
  const label = (user_agent: string | null) => sessionDeviceLabel({ user_agent } as AccountSession);
  expect(label("Mozilla/5.0 (Linux; Android 15)")).toBe("Android session");
  expect(label("Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows session");
  expect(label("okhttp/4.9.2")).toBe("Device details unavailable");
  expect(label(null)).toBe("Device details unavailable");
});
