import React, { useState } from "react";
import type {
  CalendarActions,
  ReservationDetails,
  TimeSession,
  Viewer,
} from "../../types/calendar";

interface SessionCellProps {
  date: string;
  session: TimeSession;
  lineNumber: number;
  /** `null` is what the page's slot lookup returns for a free slot. */
  reservation?: ReservationDetails | null;
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
  reservation,
  individualLineCapacity,
  today,
  viewer,
  actions,
}) => {
  const [clubsVisible, setClubsVisible] = useState(false);

  const statusClass = reservation
    ? reservation.status === "potvrdená"
      ? "potvrdená"
      : "vytvorená"
    : "not-reserved";

  if (!reservation) {
    return (
      <div className={`res-container ${statusClass}`}>
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

  const isOwner = reservation.user.email === viewer.email;
  const hasJoined = reservation.addedUsers?.some(
    (user) => user.email === viewer.email
  );
  const mayManage = (viewer.isLoggedIn && (isOwner || hasJoined)) || viewer.isAdmin;
  const mayEditNow =
    date !== today && (reservation.status !== "potvrdená" || viewer.isAdmin);
  const mayDelete = isOwner || viewer.isAdmin;

  const canJoin =
    (!viewer.isLoggedIn && reservation.availableRacers !== 0) ||
    (reservation.availableRacers !== 0 &&
      reservation.availableRacers < individualLineCapacity &&
      !isOwner &&
      !hasJoined);

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
              onClick={() => actions.onEdit(reservation)}
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
            {mayDelete && (
              <button
                className="handler-delete"
                onClick={() =>
                  actions.onDelete(
                    reservation.id || "",
                    reservation.user.email,
                    reservation.user.firstName,
                    reservation.user.secondName
                  )
                }
              >
                <i className="fas fa-trash-alt"></i>
                <span className="tooltip-text">Zmazať svoju rezerváciu</span>
              </button>
            )}
          </div>
        )}

        <div className="res-details">
          <div>
            {reservation.availableRacers !== undefined ? (
              reservation.availableRacers > 0 ? (
                <>
                  <b>VOĽNÝCH:</b>{" "}
                  {`${reservation.availableRacers} / ${
                    individualLineCapacity || "N/A"
                  }`}
                </>
              ) : (
                "OBSADENÉ"
              )
            ) : (
              <div className="loading-indicator">Načítavam...</div>
            )}
            <hr></hr>
            <b>DISCIPLÍNA:</b> {reservation.discipline || "N/A"}
            <br></br>
            <b>KATEGÓRIA:</b> {reservation.category || "N/A"}
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
                  <b>KLUB:</b> {`${reservation.user.sportClub}`}
                  <br></br>
                  <b>POČET JAZDCOV:</b> {`${reservation.user.ownRacers}`}
                  <br></br>
                  <b>KONTAKT:</b> {`${reservation.user.tel_number}`}
                  {reservation.addedUsers?.map((user, idx) => (
                    <div key={idx}>
                      <hr></hr>
                      <b>KLUB:</b> {user.sportClub}
                      <br></br>
                      <b>POČET JAZDCOV:</b> {user.ownRacers}
                      <br></br>
                      <b>KONTAKT:</b> {user.tel_number}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="detail-button"
          onClick={() => actions.onShowDetails(reservation)}
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
                  reservation.user.sportClub || ""
                );
              }
            }}
          >
            PRIDAŤ SA NA TRÉNING
          </button>
        )}

        {viewer.isAdmin && reservation.status !== "potvrdená" && (
          <button
            className="accept-training-button"
            onClick={() => actions.onConfirm(reservation.id)}
          >
            <i className="fa fa-check"></i>
            POTVRDIŤ TRÉNING
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(SessionCell);
