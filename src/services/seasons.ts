import type { Season } from "../types/calendar";

/**
 * Which season calendars a slope should show.
 *
 * This used to be decided by the season's *name*. The page built a string from
 * today's date — `"2026/2027"` — and kept a season only if its name contained
 * that substring. Two ways to be wrong, and both happened in production:
 *
 *   - "sezóna 2025/2026" on Malá Franková, running 2025-06-09 to 2026-06-10,
 *     never matched, so that slope's calendar was simply blank.
 *   - "dg 2026/2027" on Krajňáka matched all year regardless of the dates it
 *     actually covered — it showed up only because somebody happened to type
 *     those digits.
 *
 * `startDate` and `endDate` were stored on every season from the start and
 * never consulted. They are what decides it now, and the name is a label.
 */
export function currentSeasons(all: Season[], today: string): Season[] {
  const running = all.filter(
    (s) => !!s.startDate && !!s.endDate && s.startDate <= today && today <= s.endDate
  );
  if (running.length > 0) return byStart(running);

  // Nothing running today. Fall forward to the one that starts soonest, so a
  // slope whose season opens in a fortnight shows that calendar rather than
  // nothing at all — clubs book ahead, and an admin who has just created next
  // winter's calendar needs to see it.
  const upcoming = byStart(all.filter((s) => !!s.startDate && s.startDate > today));
  return upcoming.length > 0 ? [upcoming[0]] : [];
}

const byStart = (seasons: Season[]) =>
  [...seasons].sort((a, b) => a.startDate.localeCompare(b.startDate));

/** Two closed date ranges overlap unless one ends before the other begins. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string }
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Today in the resort's own zone, as `YYYY-MM-DD`. */
export function todayIso(timeZone = "Europe/Bratislava"): string {
  // `sv-SE` formats as YYYY-MM-DD, which is the shape the season dates use.
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

/**
 * The last date the loaded calendars actually have a day for.
 *
 * Derived from the days themselves rather than from `endDate`, because that is
 * what decides when the grid runs out: the week view keeps only the days whose
 * date is on screen, so once it is past the final day there is nothing left to
 * render. A season whose `endDate` outruns its last day would otherwise still
 * hand out empty weeks.
 */
export function lastCalendarDay(seasons: Season[]): string | null {
  let last: string | null = null;
  for (const season of seasons) {
    for (const week of season.weeks ?? []) {
      for (const day of week.days ?? []) {
        if (day.date && (last === null || day.date > last)) last = day.date;
      }
    }
  }
  return last;
}

/**
 * How far forward the week navigation may go, as `YYYY-MM-DD`.
 *
 * Two bounds, whichever comes first:
 *
 *   - by role — a club books a fortnight ahead, an admin a year;
 *   - by data — the last day the calendar has.
 *
 * The role bound used to be the only one, computed separately in the page and
 * in the calendar component. An admin could therefore page ten months past the
 * end of the season, every week of it showing "no further training day" with
 * the arrow still lit. Clamping to the data makes the arrow go dead where the
 * calendar does.
 *
 * Measured against the *last* loaded day, not the current season's `endDate`:
 * `currentSeasons` deliberately hands back a season that has not started yet
 * when none is running, and an admin who has just built next winter has to be
 * able to reach it.
 */
export function forwardLimit(
  seasons: Season[],
  isAdmin: boolean,
  today: string
): string {
  const byRole = isoAddDays(today, isAdmin ? 365 : 14);
  const lastDay = lastCalendarDay(seasons);
  return lastDay && lastDay < byRole ? lastDay : byRole;
}

/** `YYYY-MM-DD` plus n days, staying in that shape. */
function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const moved = new Date(y, m - 1, d + days);
  return new Intl.DateTimeFormat("sv-SE").format(moved);
}
