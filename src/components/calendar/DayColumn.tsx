import React from "react";
import TrackColumn from "./TrackColumn";
import type { Training } from "../../services/trainings";
import type {
  CalendarActions,
  ClosedTrack,
  Day,
  Viewer,
} from "../../types/calendar";

interface DayColumnProps {
  day: Day;
  /** How many parallel tracks this course has. */
  capacity: number;
  closedTrackFor: (lineNumber: number, date: string) => ClosedTrack | undefined;
  closureForSessionFor: (
    lineNumber: number,
    date: string
  ) => (startTime: string) => ClosedTrack | undefined;
  trainingFor: (
    date: string,
    startTime: string,
    endTime: string,
    lineNumber: number
  ) => Training | undefined;
  individualLineCapacity: number;
  today: string;
  label: string;
  viewer: Viewer;
  actions: CalendarActions;
}

const DayColumn: React.FC<DayColumnProps> = ({
  day,
  capacity,
  closedTrackFor,
  closureForSessionFor,
  trainingFor,
  individualLineCapacity,
  today,
  label,
  viewer,
  actions,
}) => {
  const weekday = new Date(day.date).getDay();
  const isWeekend = weekday === 6 || weekday === 0;

  return (
    <div className={`whole-day-info ${isWeekend ? "weekend" : ""}`}>
      <div className="day">{label}</div>
      <div className="calendar-day">
        {Array.from({ length: capacity }, (_, index) => {
          const lineNumber = index + 1;
          return (
            <TrackColumn
              key={`${day.date}_${lineNumber}`}
              day={day}
              lineNumber={lineNumber}
              closedTrack={closedTrackFor(lineNumber, day.date)}
              closureForSession={closureForSessionFor(lineNumber, day.date)}
              trainingFor={trainingFor}
              individualLineCapacity={individualLineCapacity}
              today={today}
              viewer={viewer}
              actions={actions}
            />
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(DayColumn);
