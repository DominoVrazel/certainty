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
  /** Closure covering just one block, if any. */
  closureForSession?: (startTime: string) => ClosedTrack | undefined;
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
  closureForSession,
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
        day.timeSessions?.map((session, sessionIndex) => {
          const blockClosure = closureForSession?.(session.startTime);
          if (blockClosure) {
            return (
              <div
                className="res-container closed"
                key={`${day.date}_${session.startTime}_${lineNumber}_closed`}
              >
                <div className="closed-reason">
                  <strong>
                    {session.startTime} - {session.endTime}
                  </strong>
                  <br></br>
                  {blockClosure.reason || "Blok je uzavretý"}
                  {viewer.isAdmin && (
                    <>
                      <br></br>
                      {/* The track header's lock only knows about whole-day
                          closures, so a blocked block needs its own control. */}
                      <button
                        className="track-toggle-button"
                        onClick={() =>
                          actions.onOpenBlock(
                            lineNumber,
                            day.date,
                            session.startTime
                          )
                        }
                      >
                        <i className="fa fa-unlock-alt"></i>
                        <span className="tooltip-text">Otvoriť blok</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }
          return (
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
          );
        })
      )}
    </div>
  );
};

export default React.memo(TrackColumn);
