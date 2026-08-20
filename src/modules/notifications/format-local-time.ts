// This app has no per-organization timezone setting yet — every session
// time entered through the wizard so far has been Cairo local time (the
// browser converts to/from UTC using the manager's own local clock, which
// has consistently been Egypt/UTC+3). Notification emails are rendered
// server-side with no browser to do that conversion, so it's hardcoded
// here rather than emailing a raw, confusing UTC time. Revisit once a real
// `Organization.timezone` field exists.
const NOTIFICATION_TZ_OFFSET_HOURS = 3;

export function formatLocalDateAndTime(utc: Date): { date: string; time: string } {
  const local = new Date(utc.getTime() + NOTIFICATION_TZ_OFFSET_HOURS * 60 * 60_000);
  const date = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  const hour24 = local.getUTCHours();
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const time = `${hour12}:${String(local.getUTCMinutes()).padStart(2, '0')} ${period}`;
  return { date, time };
}
