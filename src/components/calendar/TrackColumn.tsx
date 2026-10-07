import React from "react";
import SessionCell from "./SessionCell";
import type { Training } from "../../services/trainings";
import type {
  CalendarActions,
  ClosedTrack,
  Day,
  Viewer,
} from "../../types/calendar";

interface TrackColumnProps {
  day: Day;
  lineNumber: number;
  closedTrack?: ClosedTrack;
  /** Looks a booking up by the slot it occupies. */
  trainingFor: (
    date: string,
    startTime: string,
    endTime: string,
    lineNumber: number
  ) => Training | undefined;
  individualLineCapacity: number;
  today: string;
  viewer: Viewer;
  actions: CalendarActions;
}

/** One numbered track on one day: its header, and the blocks beneath it. */
const TrackColumn: React.FC<TrackColumnProps> = ({
  day,
  lineNumber,
  closedTrack,
  trainingFor,
  individualLineCapacity,
  today,
  viewer,
  actions,
}) => {
  const isClosed = !!closedTrack;

  return (
    <div className={`line-container ${isClosed ? "closed" : ""}`}>
      <div className="session-course-lines">
        <span>TRAŤ {lineNumber}</span>
        {viewer.isAdmin && (
          <button
            className="track-toggle-button"
            onClick={() =>
              isClosed
                ? actions.onOpenTrack(lineNumber, day.date)
                : actions.onCloseTrack(lineNumber, day.date)
            }
          >
            <i className={isClosed ? "fa fa-unlock-alt" : "fa fa-lock"}></i>
            <span className="tooltip-text">
              {isClosed ? "Otvorit trať" : "Zavrieť trať"}
            </span>
          </button>
        )}
      </div>

      {isClosed ? (
        <div className="closed-reason">
          <strong>Dôvod uzávierky:</strong> <br></br>
          {closedTrack.reason || "No reason provided"}
        </div>
      ) : (
        day.timeSessions?.map((session, sessionIndex) => (
          <SessionCell
            key={`${day.date}_${session.startTime}_${session.endTime}_${lineNumber}_${sessionIndex}`}
            date={day.date}
            session={session}
            lineNumber={lineNumber}
            training={trainingFor(
              day.date,
              session.startTime,
              session.endTime,
              lineNumber
            )}
            individualLineCapacity={individualLineCapacity}
            today={today}
            viewer={viewer}
            actions={actions}
          />
        ))
      )}
    </div>
  );
};

export default React.memo(TrackColumn);
