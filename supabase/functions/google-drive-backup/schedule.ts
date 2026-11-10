const INTERVAL_DAYS: Readonly<Record<string, number>> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  termly: 120,
  yearly: 365,
};

function schoolCalendarDayOrdinal(value: Date): number {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Backup schedule contains an invalid timestamp.");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(fields.year);
  const month = Number(fields.month);
  const day = Number(fields.day);

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * A cron job scheduled at 05:00 EAT must remain due at 05:00 the next day,
 * even when the previous backup completed a few seconds after 05:00.
 * Compare Uganda calendar dates, not 24-hour elapsed durations.
 */
export function isScheduledBackupDue(
  lastScheduledAt: string | null | undefined,
  frequency: string,
  now: Date = new Date(),
): boolean {
  const intervalDays = INTERVAL_DAYS[frequency];
  if (!intervalDays) {
    throw new Error("The saved automatic backup frequency is not supported.");
  }

  if (!lastScheduledAt) return true;

  const lastRun = new Date(lastScheduledAt);
  const daysElapsed = schoolCalendarDayOrdinal(now) - schoolCalendarDayOrdinal(lastRun);
  return daysElapsed >= intervalDays;
}
