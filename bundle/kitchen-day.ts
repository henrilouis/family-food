// The Kitchen Display's idea of "today": the local calendar date, except that a day lasts until
// 03:00 the next morning, so late cleanup doesn't jump to tomorrow. Used on the Mac and on the page.

export const DAY_STARTS_AT_HOUR = 3;

/** The kitchen's date at `now`, as YYYY-MM-DD. */
export function kitchenDate(now: Date): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < DAY_STARTS_AT_HOUR ? 1 : 0));
  return [day.getFullYear(), day.getMonth() + 1, day.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

/** The date `days` after a YYYY-MM-DD date, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
