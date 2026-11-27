/**
 * When a booking may be made, and when it stops being the club's to change.
 *
 * Kept apart from the data layer so it can be read and tested without pulling
 * Firebase in, and so there is exactly one answer to each question. There used
 * to be two answers to the second: the screen closed editing for the whole
 * calendar day, while the security rules allowed a write right up to the
 * moment the training started. The visible rule and the enforced one
 * disagreed by up to a working day.
 *
 * Both limits are the resort's to set. `firestore.rules` reads the same two
 * fields off the resort document and applies the same defaults, so a club
 * cannot get round the screen by going to the database. The rules say so at
 * the point where they use them.
 */

/** How a cut-off is expressed. */
export type CutoffMode = "day" | "minutes";

export interface ResortCutoffs {
  /**
   * Booking a slot that does not exist yet. "day" closes the whole calendar
   * day of the training, which is how the app behaved before any of this was
   * configurable and so is the default.
   */
  bookingCutoffMode: CutoffMode;
  bookingCutoffMinutes: number;
  /**
   * Changing or cancelling a booking you are on. Measured from the start of
   * the session rather than from midnight: a day boundary gave a 09:00
   * training nine hours of notice and a 13:30 one thirteen and a half, which
   * nobody had decided.
   */
  changeCutoffMode: CutoffMode;
  changeCutoffMinutes: number;
}

export const DEFAULT_CUTOFFS: ResortCutoffs = {
  bookingCutoffMode: "day",
  bookingCutoffMinutes: 120,
  changeCutoffMode: "minutes",
  changeCutoffMinutes: 120,
};

const MINUTE_MS = 60 * 1000;

/** Reads the settings off a resort document, filling in what is missing. */
export function cutoffsFrom(resortData: unknown): ResortCutoffs {
  const d = (resortData ?? {}) as Partial<ResortCutoffs>;
  return {
    bookingCutoffMode: mode(d.bookingCutoffMode, DEFAULT_CUTOFFS.bookingCutoffMode),
    bookingCutoffMinutes: minutes(
      d.bookingCutoffMinutes,
      DEFAULT_CUTOFFS.bookingCutoffMinutes
    ),
    changeCutoffMode: mode(d.changeCutoffMode, DEFAULT_CUTOFFS.changeCutoffMode),
    changeCutoffMinutes: minutes(
      d.changeCutoffMinutes,
      DEFAULT_CUTOFFS.changeCutoffMinutes
    ),
  };
}

const mode = (value: unknown, fallback: CutoffMode): CutoffMode =>
  value === "day" || value === "minutes" ? value : fallback;

/**
 * A stored minute count is only used when it is a sane positive number.
 *
 * A zero or a negative would quietly disable the limit, and that is not a
 * thing anybody should be able to do by accident — turning a limit off is
 * what the "day" mode and a deliberate value are for.
 */
const minutes = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;

/**
 * Whether a free slot may still be booked.
 *
 * `todayIso` and `dateIso` are plain `YYYY-MM-DD` in the resort's own zone, so
 * the day comparison does not depend on where the browser is.
 */
export function mayBook(
  cutoffs: ResortCutoffs,
  slot: { dateIso: string; startAtMs: number | null | undefined },
  now: { todayIso: string; nowMs: number }
): boolean {
  if (cutoffs.bookingCutoffMode === "day") {
    return slot.dateIso > now.todayIso;
  }
  return beyond(slot.startAtMs, now.nowMs, cutoffs.bookingCutoffMinutes);
}

/**
 * Whether the clubs on a training may still change or cancel it themselves.
 *
 * An admin is never subject to this — the resort can always act, which is the
 * point of having a resort.
 */
export function clubMayChange(
  cutoffs: ResortCutoffs,
  training: { dateIso: string; startAtMs: number | null | undefined },
  now: { todayIso: string; nowMs: number }
): boolean {
  if (cutoffs.changeCutoffMode === "day") {
    return training.dateIso > now.todayIso;
  }
  return beyond(training.startAtMs, now.nowMs, cutoffs.changeCutoffMinutes);
}

/**
 * Strictly more than `mins` away.
 *
 * A training with no stored start instant is closed rather than open: that
 * would open the window on exactly the documents we know least about.
 */
function beyond(
  startAtMs: number | null | undefined,
  nowMs: number,
  mins: number
): boolean {
  if (typeof startAtMs !== "number") return false;
  return startAtMs - mins * MINUTE_MS > nowMs;
}

/** "2 hodiny", "90 minút" — for telling a club what the limit actually is. */
export function describeCutoff(cutoffs: ResortCutoffs, which: "booking" | "change"): string {
  const mode = which === "booking" ? cutoffs.bookingCutoffMode : cutoffs.changeCutoffMode;
  const mins = which === "booking" ? cutoffs.bookingCutoffMinutes : cutoffs.changeCutoffMinutes;
  if (mode === "day") return "v deň tréningu";
  if (mins % 60 === 0) {
    const h = mins / 60;
    return `${h} ${h === 1 ? "hodinu" : h < 5 ? "hodiny" : "hodín"} pred začiatkom`;
  }
  return `${mins} ${mins < 5 ? "minúty" : "minút"} pred začiatkom`;
}
