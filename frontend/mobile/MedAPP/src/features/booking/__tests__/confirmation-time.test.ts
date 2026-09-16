import { confirmationTime } from "../confirmation-time";
it("shows a half-hour zone from UTC instants", () => {
  expect(confirmationTime("2035-05-13T04:30:00Z", "2035-05-13T05:00:00Z", "Asia/Kolkata")).toEqual({
    date: "2035-05-13",
    time: "10:00 GMT+5:30",
    endTime: "10:30 GMT+5:30",
    timezone: "Your device time · Asia/Kolkata",
  });
});
it("distinguishes the repeated hour at the daylight-saving fallback", () => {
  expect(
    confirmationTime("2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "America/New_York"),
  ).toMatchObject({ date: "2026-11-01", time: "01:30 GMT-4", endTime: "01:30 GMT-5" });
});
it("shows the skipped hour when daylight-saving time begins", () => {
  expect(
    confirmationTime("2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z", "America/New_York"),
  ).toMatchObject({ time: "01:30 GMT-5", endTime: "03:30 GMT-4" });
});
it("includes the end date when the appointment crosses local midnight", () => {
  expect(confirmationTime("2035-05-13T23:30:00Z", "2035-05-14T00:30:00Z", "UTC")).toMatchObject({
    date: "2035-05-13",
    // Intl data can spell the zero offset as either GMT or GMT+0.
    time: expect.stringMatching(/^23:30 GMT(?:\+0)?$/),
    endTime: expect.stringMatching(/^2035-05-14 00:30 GMT(?:\+0)?$/),
  });
});
