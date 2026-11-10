import { isScheduledBackupDue } from "./schedule.ts";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
  }
}

Deno.test("daily backup is due the next Uganda calendar day when the previous run finished after 05:00", () => {
  // 05:00:14 EAT on 9 Nov; the next cron fires at 05:00 EAT on 10 Nov.
  assertEqual(
    isScheduledBackupDue("2026-11-09T02:00:14.945Z", "daily", new Date("2026-11-10T02:00:00.000Z")),
    true,
    "next-day daily run",
  );
});

Deno.test("a second invocation on the same Uganda calendar day is skipped", () => {
  assertEqual(
    isScheduledBackupDue("2026-11-10T02:00:14.945Z", "daily", new Date("2026-11-10T03:00:00.000Z")),
    false,
    "same-day duplicate",
  );
});

Deno.test("weekly backup waits until seven Uganda calendar days have elapsed", () => {
  assertEqual(
    isScheduledBackupDue("2026-11-03T02:00:10.000Z", "weekly", new Date("2026-11-10T02:00:00.000Z")),
    true,
    "weekly due boundary",
  );
  assertEqual(
    isScheduledBackupDue("2026-11-04T02:00:10.000Z", "weekly", new Date("2026-11-10T02:00:00.000Z")),
    false,
    "weekly early boundary",
  );
});

Deno.test("unsupported frequencies fail closed", () => {
  let thrown = false;
  try {
    isScheduledBackupDue(null, "hourly", new Date("2026-11-10T02:00:00.000Z"));
  } catch {
    thrown = true;
  }
  assertEqual(thrown, true, "unsupported frequency");
});

Deno.test("missing prior schedule permits the first scheduled backup", () => {
  assertEqual(
    isScheduledBackupDue(null, "daily", new Date("2026-11-10T02:00:00.000Z")),
    true,
    "first run",
  );
});
