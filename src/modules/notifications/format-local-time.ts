// This app has no per-organization timezone setting yet — every session
// time entered through the wizard so far has been Cairo local time (the
// browser converts to/from UTC using the manager's own local clock, which
// has consistently been Egypt/UTC+3). Notification emails are rendered
// server-side with no browser to do that conversion, so it's hardcoded
// here rather than emailing a raw, confusing UTC time. Revisit once a real
// `Organization.timezone` field exists.
const NOTIFICATION_TZ_OFFSET_HOURS = 3;

/**
 * The UTC instants bounding the local calendar day that `utc` falls in, as a
 * half-open `[from, to)` range — for "is there already a session on this day"
 * style queries. Shares `NOTIFICATION_TZ_OFFSET_HOURS` with
 * `formatLocalDateAndTime` deliberately: two different notions of "the same
 * day" in one codebase would disagree either side of midnight, which is
 * exactly where the collision bug this supports was reported.
 */
export function localDayBounds(utc: Date): { from: Date; to: Date } {
  const offsetMs = NOTIFICATION_TZ_OFFSET_HOURS * 60 * 60_000;
  const local = new Date(utc.getTime() + offsetMs);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const from = new Date(localMidnight - offsetMs);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60_000) };
}

export function formatLocalDateAndTime(utc: Date): { date: string; time: string } {
  const local = new Date(utc.getTime() + NOTIFICATION_TZ_OFFSET_HOURS * 60 * 60_000);
  const date = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  const hour24 = local.getUTCHours();
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const time = `${hour12}:${String(local.getUTCMinutes()).padStart(2, '0')} ${period}`;
  return { date, time };
}
