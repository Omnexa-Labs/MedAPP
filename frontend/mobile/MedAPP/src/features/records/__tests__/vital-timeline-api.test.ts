import { client } from "@/lib/api/client";
import { rangeStart, vitalLabel, vitalTimelineApi } from "../vital-timeline-api";
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn() } }));

test("timeline encodes patient identity and cursor while preserving compound measurements", async () => {
  jest
    .mocked(client.get)
    .mockResolvedValue({
      items: [
        {
          vital_id: "v",
          patient_id: "record-id",
          recorded_by_user_id: "clinician",
          kind: "blood_pressure",
          value: "122/80",
          unit: "mmHg",
          recorded_at: "2026-09-13T12:00:00Z",
          note: "Seated",
        },
      ],
      next_cursor: "next",
    });
  const options = { isSessionCurrent: () => true, signal: new AbortController().signal };
  const page = await vitalTimelineApi.list(
    "patient/user",
    { kind: "blood pressure", from: "2026-09-01T00:00:00Z" },
    "a+b/c",
    options,
  );
  const path = jest.mocked(client.get).mock.calls[0][0];
  expect(path).toContain("/v1/patients/patient%2Fuser/vitals?");
  expect(path).toContain("kind=blood+pressure");
  expect(path).toContain("cursor=a%2Bb%2Fc");
  expect(client.get).toHaveBeenCalledWith(path, options);
  expect(page.items[0]).toMatchObject({
    value: "122/80",
    unit: "mmHg",
    note: "Seated",
    recordedAtIso: "2026-09-13T12:00:00Z",
  });
  expect(page.nextCursor).toBe("next");
});

test("range starts at the local midnight and unknown measurement names remain visible", () => {
  const now = new Date(2026, 8, 13, 18, 0);
  expect(rangeStart(7, now.getTime())).toBe(new Date(2026, 8, 7).toISOString());
  expect(rangeStart(null, now.getTime())).toBeUndefined();
  expect(vitalLabel("blood_pressure")).toBe("Blood pressure");
  expect(vitalLabel("custom_measurement")).toBe("custom measurement");
});
