import React, { useState } from "react";
import Modal from "./Modal";
import type { Day, TimeSession } from "../types/calendar";
import type { Training } from "../services/trainings";

interface MoveTrainingModalProps {
  training: Training;
  /** Days currently on the calendar, so a target can be picked without typing. */
  days: Day[];
  timeSessions: TimeSession[];
  trackCount: number;
  onClose: () => void;
  onSubmit: (target: {
    date: string;
    session: TimeSession;
    lineNumber: number;
  }) => void;
}

/**
 * Moves an existing booking to another day, time or track.
 *
 * Previously the only way was to delete it and ask the club to book again,
 * which lost everyone who had joined.
 */
const MoveTrainingModal: React.FC<MoveTrainingModalProps> = ({
  training,
  days,
  timeSessions,
  trackCount,
  onClose,
  onSubmit,
}) => {
  const [date, setDate] = useState(training.date);
  const [startTime, setStartTime] = useState(training.session.startTime);
  const [lineNumber, setLineNumber] = useState(training.lineNumber);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const session =
      timeSessions.find((s) => s.startTime === startTime) ?? training.session;
    onSubmit({ date, session, lineNumber });
    onClose();
  };

  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-modal">
        <h2 className="heading">Presunúť tréning</h2>
        <p>
          Teraz: {training.date} {training.session.startTime} – trať{" "}
          {training.lineNumber}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="move-date">Deň:</label>
            <select
              id="move-date"
              className="form-control"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="move-time">Čas:</label>
            <select
              id="move-time"
              className="form-control"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            >
              {timeSessions.map((s) => (
                <option key={s.startTime} value={s.startTime}>
                  {s.startTime} - {s.endTime}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="move-track">Trať:</label>
            <select
              id="move-track"
              className="form-control"
              value={lineNumber}
              onChange={(e) => setLineNumber(Number(e.target.value))}
            >
              {Array.from({ length: trackCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  TRAŤ {n}
                </option>
              ))}
            </select>
          </div>

          <button className="RegButton" type="submit">
            Presunúť
          </button>
        </form>
      </div>
    </Modal>
  );
};

export default MoveTrainingModal;
