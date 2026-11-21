// Calendar dates as YYYY-MM-DD, and as people read them.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The date `days` after a YYYY-MM-DD date, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whether `date` falls in the Week Menu's week: from its Saturday `weekStart` to the Friday after (YYYY-MM-DD). */
export function inWeek(weekStart: string, date: string | null | undefined): date is string {
  return !!date && date >= weekStart && date <= addDays(weekStart, 6);
}

/** The local calendar date at `time`, as YYYY-MM-DD. */
export function localDate(time: Date): string {
  return [time.getFullYear(), time.getMonth() + 1, time.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

/** "Saturday" for "2026-11-21". */
export function weekdayName(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** "Sat 21 Nov" for "2026-11-21", as a Week Menu's Day column writes it; "Saturday 21 Nov" with `long`. */
export function dayLabel(date: string, { long = false } = {}): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = weekdayName(date);
  return `${long ? weekday : weekday.slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Local time as people read it: "Fri 20 Nov 18:00". */
export function timeLabel(time: Date): string {
  const clock = [time.getHours(), time.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
  return `${dayLabel(localDate(time))} ${clock}`;
}
