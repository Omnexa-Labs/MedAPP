/** Display saved instants in the device zone; an explicit zone supports deterministic QA. */
export function confirmationTime(
  startIso: string,
  endIso: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const start = new Date(startIso),
    end = new Date(endIso);
  const dates = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const clocks = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  });
  const dateOf = (date: Date) => {
    const parts = dates.formatToParts(date);
    const part = (type: string) => parts.find((value) => value.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const date = dateOf(start),
    endDate = dateOf(end);
  return {
    date,
    time: clocks.format(start),
    endTime: `${endDate !== date ? endDate + " " : ""}${clocks.format(end)}`,
    timezone: `Your device time · ${timeZone}`,
  };
}
