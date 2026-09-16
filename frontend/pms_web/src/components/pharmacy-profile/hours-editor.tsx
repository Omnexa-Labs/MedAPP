"use client";
const days = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
export function HoursEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  function set(day: string, hours: string) {
    const next = { ...value };
    if (hours) next[day] = hours;
    else delete next[day];
    onChange(next);
  }
  return (
    <div id="profile-operating_hours" className="space-y-3">
      <p className="text-xs text-slate-500">
        Use local pharmacy time. An end time earlier than the start means
        closing the following day. Hours are published as a weekly schedule.
      </p>
      {days.map((day) => {
        const hours = value[day] || "",
          ranged = hours.includes("-");
        const [start = "", end = ""] = ranged ? hours.split("-") : [];
        return (
          <fieldset
            key={day}
            className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
          >
            <legend className="px-1 text-sm font-medium capitalize">
              {day}
            </legend>
            <select
              aria-label={day + " opening"}
              value={ranged ? "hours" : hours}
              onChange={(event) =>
                set(
                  day,
                  event.target.value === "hours"
                    ? "08:00-18:00"
                    : event.target.value,
                )
              }
              className="min-h-11 rounded-md border px-3"
            >
              <option value="">Not provided</option>
              <option value="closed">Closed</option>
              <option value="24 hours">24 hours</option>
              <option value="hours">Set hours</option>
            </select>
            {ranged && (
              <>
                <label className="text-sm">
                  Opens
                  <input
                    aria-label={day + " opens"}
                    type="time"
                    required
                    value={start}
                    onChange={(event) =>
                      set(day, event.target.value + "-" + end)
                    }
                    className="ml-2 min-h-11 rounded-md border px-2"
                  />
                </label>
                <label className="text-sm">
                  Closes
                  <input
                    aria-label={day + " closes"}
                    type="time"
                    required
                    value={end}
                    onChange={(event) =>
                      set(day, start + "-" + event.target.value)
                    }
                    className="ml-2 min-h-11 rounded-md border px-2"
                  />
                </label>
              </>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
