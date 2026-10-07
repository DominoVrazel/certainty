import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import {
  subscribeToClosures,
  subscribeToWeek,
  type Closure,
  type Training,
} from "../services/trainings";

/**
 * Holds the one week of one course that is actually on screen.
 *
 * The page used to fetch 21 days (365 for an admin) across every resort, then
 * one extra round trip per booking to collect its participants, and repeat the
 * whole thing after each write. Here the query is bounded by the visible week
 * and participants travel inside the booking, so a week costs
 * `tracks × blocks × 7` documents at most.
 */
export interface TrainingWeek {
  trainings: Training[];
  closures: Closure[];
  loading: boolean;
  error: Error | null;
  /** Keyed by `date_start_end_line`, for direct slot lookup while rendering. */
  bySlot: Map<string, Training>;
  closureBySlot: Map<string, Closure>;
}

export function weekDatesFrom(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(start, i), "yyyy-MM-dd")
  );
}

export const slotKey = (
  date: string,
  startTime: string,
  endTime: string,
  lineNumber: number
) => `${date}_${startTime}_${endTime}_${lineNumber}`;

export function useTrainingWeek(
  resortId: string | null,
  courseId: string | null,
  weekStart: Date
): TrainingWeek {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const dates = useMemo(() => weekDatesFrom(weekStart), [weekStart]);
  const cacheKey = `${resortId}|${courseId}|${dates[0]}`;

  // Paging back to a week already visited repaints from memory while the
  // listener reattaches, instead of blanking the calendar for a round trip.
  const cache = useRef(new Map<string, Training[]>());

  useEffect(() => {
    if (!resortId || !courseId) {
      setTrainings([]);
      setClosures([]);
      setLoading(false);
      return;
    }

    const cached = cache.current.get(cacheKey);
    if (cached) {
      setTrainings(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    const unsubscribeTrainings = subscribeToWeek(
      resortId,
      courseId,
      dates,
      (next) => {
        cache.current.set(cacheKey, next);
        setTrainings(next);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    const unsubscribeClosures = subscribeToClosures(
      resortId,
      courseId,
      dates,
      setClosures,
      (err) => setError(err)
    );

    return () => {
      unsubscribeTrainings();
      unsubscribeClosures();
    };
  }, [resortId, courseId, cacheKey]);

  const bySlot = useMemo(() => {
    const map = new Map<string, Training>();
    for (const t of trainings) {
      map.set(
        slotKey(t.date, t.session.startTime, t.session.endTime, t.lineNumber),
        t
      );
    }
    return map;
  }, [trainings]);

  const closureBySlot = useMemo(() => {
    const map = new Map<string, Closure>();
    for (const c of closures) {
      // A day-wide closure covers every block on that track; a session closure
      // covers one. The calendar checks the specific key, then the day key.
      const key =
        c.scope === "session" && c.session
          ? `${c.date}_${c.session.startTime}_${c.lineNumber}`
          : `${c.date}_ALL_${c.lineNumber}`;
      map.set(key, c);
    }
    return map;
  }, [closures]);

  return { trainings, closures, loading, error, bySlot, closureBySlot };
}
