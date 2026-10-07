import React, { useState } from "react";
import type { Training } from "../../services/trainings";
import type {
  CalendarActions,
  TimeSession,
  Viewer,
} from "../../types/calendar";

interface SessionCellProps {
  date: string;
  session: TimeSession;
  lineNumber: number;
  training?: Training;
  /** Maximum racers allowed on one track for one block. */
  individualLineCapacity: number;
  today: string;
  viewer: Viewer;
  actions: CalendarActions;
}

/**
 * One bookable time block on one track.
 *
 * The club dropdown keeps its open/closed state here rather than in a
 * page-level record: with it one level up, opening a single dropdown
 * re-rendered every cell in the week.
 */
const SessionCell: React.FC<SessionCellProps> = ({
  date,
  session,
  lineNumber,
  training,
  individualLineCapacity,
  today,
  viewer,
  actions,
}) => {
  const [clubsVisible, setClubsVisible] = useState(false);

  if (!training) {
    return (
      <div className="res-container not-reserved">
        <div className="res-details-container">
          <div className="session-course-times">
            {session.startTime} - {session.endTime}
          </div>
          {date !== today && (
            <button
              className="reservation-button"
              onClick={() => actions.onReserve(date, session, lineNumber)}
              disabled={date === today}
            >
              REZERVOVAŤ
            </button>
          )}
        </div>
      </div>
    );
  }

  const statusClass = training.status === "confirmed" ? "potvrdená" : "vytvorená";

  // Derived, not stored. The old `availableRacers` was a hand-maintained
  // counter that baked in whatever capacity applied when it was written, so a
  // later change to the course capacity silently made it wrong.
  const racersFree = Math.max(individualLineCapacity - training.racersTotal, 0);

  const participants = Object.entries(training.participants ?? {});
  const owner =
    participants.find(([, p]) => p.role === "owner")?.[1] ??
    participants[0]?.[1];

  const myUid = viewer.uid;
  const mine = myUid ? training.participants?.[myUid] : undefined;
  const isParticipant = !!mine;
  const isOwner = !!(myUid && training.participants?.[myUid]?.role === "owner");

  const mayManage = (viewer.isLoggedIn && isParticipant) || viewer.isAdmin;
  // Editable while the training is still ahead. It used to lock once the
  // status was "confirmed", which meant the resort had accepted it — now the
  // clubs confirm their own attendance, so that same rule would have a club
  // lock itself out of its own booking the moment it said it was coming.
  const mayEditNow = date !== today;

  const canJoin =
    racersFree > 0 && (!viewer.isLoggedIn || (!isParticipant && viewer.isLoggedIn));

  return (
    <div className={`res-container ${statusClass}`}>
      <div className="res-details-container">
        <div className="session-course-times">
          {session.startTime} - {session.endTime}
        </div>

        {mayManage && mayEditNow && (
          <div className="delEditButtons-group">
            <button
              className="handler-edit"
              onClick={() => actions.onEdit(training)}
            >
              <i
                className={isOwner || viewer.isAdmin ? "fas fa-pen" : "fa fa-wrench"}
              ></i>
              <span className="tooltip-text">
                {isOwner || viewer.isAdmin
                  ? "Upraviť rezerváciu"
                  : "Editovať rezerváciu"}
              </span>
            </button>
            <button
              className="handler-delete"
              onClick={() => actions.onLeaveOrCancel(training)}
            >
              <i className="fas fa-trash-alt"></i>
              <span className="tooltip-text">
                {/* Leaving no longer cancels the training for the clubs that
                    joined it — the defect that stranded 101 records. */}
                {isOwner || viewer.isAdmin
                  ? "Zmazať svoju rezerváciu"
                  : "Odhlásiť sa z tréningu"}
              </span>
            </button>
          </div>
        )}

        <div className="res-details">
          <div>
            {racersFree > 0 ? (
              <>
                <b>VOĽNÝCH:</b>{" "}
                {`${racersFree} / ${individualLineCapacity || "N/A"}`}
              </>
            ) : (
              "OBSADENÉ"
            )}
            <hr></hr>
            <b>DISCIPLÍNA:</b> {training.discipline || "N/A"}
            <br></br>
            <b>KATEGÓRIA:</b> {training.category || "N/A"}
            <br></br>
            <b>POTVRDENÉ:</b> {training.confirmedCount ?? 0} /{" "}
            {training.participantCount ?? 0}
            {training.coachesTotal > 0 && (
              <>
                <br></br>
                <b>TRÉNERI:</b> {training.coachesTotal}
              </>
            )}
            {training.note && (
              <>
                <hr></hr>
                <b>POZNÁMKA:</b> {training.note}
              </>
            )}
          </div>
          <div>
            <div>
              <button
                className="clubs-dropdown-button"
                onClick={() => setClubsVisible((open) => !open)}
              >
                <i className="fa fa-sort-down"></i>
                <b>ZOBRAZIŤ KLUBY</b>
              </button>
              {clubsVisible && (
                <div className="dropdown-content">
                  {participants.map(([uid, p], idx) => (
                    <div key={uid}>
                      {idx > 0 && <hr></hr>}
                      <b>KLUB:</b> {p.sportClub}
                      <br></br>
                      <b>POČET JAZDCOV:</b> {p.racers}
                      <br></br>
                      <b>TRÉNEROV:</b> {p.coaches ?? 0}
                      <br></br>
                      <b>KONTAKT:</b> {p.tel_number}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="detail-button"
          onClick={() => actions.onShowDetails(training)}
        >
          <i className="fa fa-info-circle"></i>
          DETAIL
        </button>

        {canJoin && (
          <button
            className="add-to-training-button"
            onClick={() => {
              if (!viewer.isLoggedIn) {
                alert("Musíte sa najprv prihlásiť.");
              } else {
                actions.onJoinTraining(
                  date,
                  session,
                  lineNumber,
                  owner?.sportClub || ""
                );
              }
            }}
          >
            PRIDAŤ SA NA TRÉNING
          </button>
        )}

        {/* Confirming is the club's own job now; the resort no longer has to
            chase every booking. */}
        {isParticipant && !mine?.confirmedAt && (
          <button
            className="accept-training-button"
            onClick={() => actions.onConfirm(training.id)}
          >
            <i className="fa fa-check"></i>
            POTVRDIŤ ÚČASŤ
          </button>
        )}

        {/* On the day itself, the club marks that it actually turned up. */}
        {isParticipant && date === today && (
          <button
            className="accept-training-button"
            onClick={() => actions.onCheckIn(training.id, !mine?.attended)}
          >
            <i
              className={mine?.attended ? "fa fa-user-check" : "fa fa-flag"}
            ></i>
            {mine?.attended ? "SME TU" : "OZNAČIŤ PRÍCHOD"}
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(SessionCell);
