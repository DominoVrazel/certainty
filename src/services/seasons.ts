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
