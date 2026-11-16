// The Kitchen Display's idea of "today": the local calendar date, except that a day lasts until
// 03:00 the next morning, so late cleanup doesn't jump to tomorrow. Used on the Mac and on the page.

import { localDate } from "./dates.ts";

export const DAY_STARTS_AT_HOUR = 3;

/** The kitchen's date at `now`, as YYYY-MM-DD. */
export function kitchenDate(now: Date): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < DAY_STARTS_AT_HOUR ? 1 : 0));
  return localDate(day);
}

/** When the kitchen's next day starts after `now`: the coming 03:00. */
export function nextDayStart(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_STARTS_AT_HOUR);
  if (start <= now) start.setDate(start.getDate() + 1);
  return start;
}
