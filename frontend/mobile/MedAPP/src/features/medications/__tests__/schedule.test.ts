// The adherence figure, and the two ways it could defame a patient.
//
// The load-bearing cases here are:
//
//   1. Before any dose is due, adherence is ABSENT — not 0%. A 0 would render
//      "0% of the doses due so far today have been taken" at 6am to a patient who
//      has missed nothing.
//   2. An upcoming dose is not a miss. Counting it would open the day at a low
//      figure that climbs as doses fall due, so the number would be worst exactly
//      when the patient has done nothing wrong.
//
// Both live in `adherenceOf` rather than in the screen, so they are assertable
// without a render and without a fake clock — which is the same reason
// `deriveMedicationsState` exists next door.

import {
  adherenceOf,
  dayStrip,
  dosesByMedication,
  doseTimesOf,
  formatMinuteOfDay,
  localDateKey,
  type DaySchedule,
  type DoseStatus,
} from "../schedule";
import { buildSampleDaySchedule } from "../schedule-sample-data";
import { SAMPLE_MEDICATIONS } from "../sample-data";

function scheduleOf(...statuses: DoseStatus[]): DaySchedule {
  return {
    date: "2026-08-10",
    doses: statuses.map((status, index) => ({
      id: `dose-${index}`,
      medicationId: SAMPLE_MEDICATIONS[0].id,
      minuteOfDay: 8 * 60 + index * 60,
      status,
    })),
  };
}

describe("adherenceOf", () => {
  it("is undefined when nothing is due yet — NOT 0%", () => {
    expect(adherenceOf(scheduleOf("upcoming", "upcoming"))).toBeUndefined();
  });

  it("is undefined for a day with no doses at all", () => {
    expect(adherenceOf({ date: "2026-08-10", doses: [] })).toBeUndefined();
  });

  it("excludes upcoming doses from the denominator", () => {
    // 1 taken, 1 missed, 2 upcoming. Due = 2, so 50% — not 25%.
    expect(adherenceOf(scheduleOf("taken", "missed", "upcoming", "upcoming"))).toBe(50);
  });

  it("floors rather than rounds, so adherence is never overstated", () => {
    // 2 of 3 is 66.67%. Rounding gives 67, which overstates compliance.
    expect(adherenceOf(scheduleOf("taken", "taken", "missed"))).toBe(66);
  });

  it("reports 100 only when every due dose was taken", () => {
    expect(adherenceOf(scheduleOf("taken", "taken", "upcoming"))).toBe(100);
  });

  it("reports 0 when doses were due and none were taken", () => {
    // Distinct from the undefined case above: here a dose WAS due and missed, so
    // 0% is a fact rather than a reproach for a day that has not happened.
    expect(adherenceOf(scheduleOf("missed", "missed"))).toBe(0);
  });
});

describe("the sample day", () => {
  it("produces the 66% the frame shows, from its own doses", () => {
    expect(adherenceOf(buildSampleDaySchedule("2026-08-10"))).toBe(66);
  });

  it("only references drugs that exist in the shipped sample list", () => {
    const known = new Set(SAMPLE_MEDICATIONS.map((medication) => medication.id));
    for (const dose of buildSampleDaySchedule("2026-08-10").doses) {
      expect(known.has(dose.medicationId)).toBe(true);
    }
  });

  it("carries the date it was asked for, with no date of its own", () => {
    expect(buildSampleDaySchedule("2027-01-02").date).toBe("2027-01-02");
  });
});

describe("grid derivation", () => {
  it("orders columns by time and de-duplicates shared slots", () => {
    // Amlodipine and Metformin share 08:00; Vitamin D3 is at 13:00; Metformin
    // again at 19:00. Three columns, ascending.
    expect(doseTimesOf(buildSampleDaySchedule("2026-08-10"))).toEqual([8 * 60, 13 * 60, 19 * 60]);
  });

  it("groups doses under their medication, ordered within the row", () => {
    const rows = dosesByMedication(buildSampleDaySchedule("2026-08-10"), SAMPLE_MEDICATIONS);
    const metformin = rows.find((row) => row.medication.name === "Metformin");
    expect(metformin?.doses.map((dose) => dose.minuteOfDay)).toEqual([8 * 60, 19 * 60]);
  });

  it("drops doses whose medication is not in the list, rather than throwing", () => {
    const orphaned: DaySchedule = {
      date: "2026-08-10",
      doses: [{ id: "x", medicationId: "deleted-drug", minuteOfDay: 480, status: "taken" }],
    };
    const rows = dosesByMedication(orphaned, SAMPLE_MEDICATIONS);
    expect(rows.every((row) => row.doses.length === 0)).toBe(true);
  });
});

describe("formatMinuteOfDay", () => {
  it("zero-pads both halves", () => {
    expect(formatMinuteOfDay(8 * 60)).toBe("08:00");
    expect(formatMinuteOfDay(9 * 60 + 5)).toBe("09:05");
    expect(formatMinuteOfDay(0)).toBe("00:00");
    expect(formatMinuteOfDay(19 * 60 + 30)).toBe("19:30");
  });
});

describe("dayStrip", () => {
  it("marks exactly one day as today, and it is the anchor", () => {
    const anchor = new Date(2026, 7, 10);
    const days = dayStrip(anchor);
    expect(days.filter((day) => day.isToday)).toHaveLength(1);
    expect(days.find((day) => day.isToday)?.date).toBe(localDateKey(anchor));
  });

  it("crosses a month boundary without producing a day 0 or 32", () => {
    // 1 Sep looking back 3 days must reach 29 Aug, not "Sep -2".
    const days = dayStrip(new Date(2026, 8, 1), 3, 3);
    expect(days.map((day) => day.dayLabel)).toEqual(["29", "30", "31", "1", "2", "3", "4"]);
  });

  it("crosses a year boundary", () => {
    const days = dayStrip(new Date(2026, 11, 31), 1, 1);
    expect(days.map((day) => day.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("uses local date parts, so the key never shifts a day via UTC", () => {
    // 23:30 local on the 10th is the 11th in UTC for any positive offset. The
    // key must still say the 10th, which is what rules out toISOString().
    expect(localDateKey(new Date(2026, 7, 10, 23, 30))).toBe("2026-08-10");
  });
});
