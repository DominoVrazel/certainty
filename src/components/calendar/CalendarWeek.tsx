import React, { useMemo } from "react";
import { addDays, format } from "date-fns";
import DayColumn from "./DayColumn";
import type { Training } from "../../services/trainings";
import type {
  CalendarActions,
  ClosedTrack,
  Day,
  Viewer,
  Week,
} from "../../types/calendar";

interface CalendarWeekProps {
  weeks: Week[];
  weekStart: Date;
  capacity: number;
  individualLineCapacity: number;
  closedTrackFor: (lineNumber: number, date: string) => ClosedTrack | undefined;
  trainingFor: (
    date: string,
    startTime: string,
    endTime: string,
    lineNumber: number
  ) => Training | undefined;
  viewer: Viewer;
  actions: CalendarActions;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onShowInfo: () => void;
  /** Weekday name in the active language, keyed by date. */
  dayLabel: (day: Day) => string;
  lang: string;
}

/** The seven-day grid, its navigation and its legend. */
const CalendarWeek: React.FC<CalendarWeekProps> = ({
  weeks,
  weekStart,
  capacity,
  individualLineCapacity,
  closedTrackFor,
  trainingFor,
  viewer,
  actions,
  onPreviousWeek,
  onNextWeek,
  onShowInfo,
  dayLabel,
}) => {
  const today = format(new Date(), "yyyy-MM-dd");

  // Flattening the whole season and filtering it ran on every render before,
  // including when a single dropdown opened.
  const visibleDays = useMemo(() => {
    const inRange = new Set(
      Array.from({ length: 7 }, (_, i) =>
        format(addDays(weekStart, i), "yyyy-MM-dd")
      )
    );
    return weeks.flatMap((week) => week.days).filter((d) => inRange.has(d.date));
  }, [weeks, weekStart]);

  const now = new Date();
  const forwardLimit = viewer.isAdmin ? addDays(now, 365) : addDays(now, 14);

  return (
    <div className="current-week-container">
      <div className="week-navigation">
        <div className="navigate-backwards">
          <button onClick={onPreviousWeek} disabled={weekStart <= now}>
            <i className="fas fa-arrow-circle-left"></i>
            <span className="tooltip-text">naspäť</span>
          </button>
        </div>
        <div className="curr-date-heading">
          <p>
            REZERVÁCIE od {format(weekStart, "dd.MM.yy")} do{" "}
            {format(addDays(weekStart, 6), "dd.MM.yy")}
          </p>
        </div>
        <div className="navigate-forwards">
          <button
            onClick={onNextWeek}
            disabled={addDays(weekStart, 7) > forwardLimit}
          >
            <span className="tooltip-text">dopredu</span>
            <i className="fas fa-arrow-circle-right"></i>
          </button>
        </div>
      </div>

      <div className="week-hints">
        <div className="hints-left">
          <button onClick={onShowInfo} className="info-button">
            <i className="fas fa-glasses"></i> Návod ako postupovať
          </button>
        </div>
        <div className="hints-right">
          <i className="fas fa-circle free"></i> Voľná
          <i className="fas fa-circle created"></i> Vytvorená
          <i className="fas fa-circle confirmed"></i> Potvrdená
        </div>
      </div>

      <div className="calendar-week">
        {visibleDays.length > 0 ? (
          visibleDays.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              capacity={capacity}
              closedTrackFor={closedTrackFor}
              trainingFor={trainingFor}
              individualLineCapacity={individualLineCapacity}
              today={today}
              label={dayLabel(day)}
              viewer={viewer}
              actions={actions}
            />
          ))
        ) : (
          <p className="unable-calendar-p">
            Nedostupný žiadny ďalší tréningový deň.
          </p>
        )}
      </div>
    </div>
  );
};

export default React.memo(CalendarWeek);
