import React, { useState } from "react";
import Modal from "./Modal";
import type { TimeSession } from "../types/calendar";

interface CloseTrackModalProps {
  isOpen: boolean;
  /** The blocks this track runs that day, so one of them can be picked. */
  timeSessions: TimeSession[];
  onClose: () => void;
  onSubmit: (reason: string, session: TimeSession | null) => void;
}

/**
 * Closes a track for a whole day, or for one time block.
 *
 * Previously only whole-day closures existed, so taking out a single morning
 * block meant closing the track for everything.
 */
const CloseTrackModal: React.FC<CloseTrackModalProps> = ({
  isOpen,
  timeSessions,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<string>("ALL");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const session =
      scope === "ALL"
        ? null
        : timeSessions.find((s) => s.startTime === scope) ?? null;

    onSubmit(reason, session);
    setReason("");
    setScope("ALL");
    onClose();
  };

  return (
    <Modal show={isOpen} onClose={onClose}>
      <div className="reservation-modal">
        <h2 className="heading">Zavrieť trať</h2>
        <br></br>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="scope">Rozsah uzávierky:</label>
            <select
              id="scope"
              className="form-control"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="ALL">Celý deň</option>
              {timeSessions.map((s) => (
                <option key={s.startTime} value={s.startTime}>
                  {s.startTime} - {s.endTime}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Zadajte dôvod uzavretia trate"
              className="form-control"
              required
            />
          </div>
          <button className="RegButton" type="submit">
            Potvrdiť
          </button>
        </form>
      </div>
    </Modal>
  );
};

export default CloseTrackModal;
