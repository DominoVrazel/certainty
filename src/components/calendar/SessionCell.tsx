import React, { useState } from "react";
import type { Training } from "../../services/trainings";
import { READ_ONLY } from "../../services/maintenance";
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
          {date !== today && !READ_ONLY && (
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

  const mayManage =
    !READ_ONLY && ((viewer.isLoggedIn && isParticipant) || viewer.isAdmin);
  // Editable while the training is still ahead. It used to lock once the
  // status was "confirmed", which meant the resort had accepted it — now the
  // clubs confirm their own attendance, so that same rule would have a club
  // lock itself out of its own booking the moment it said it was coming.
  /**
   * A confirmed booking is the resort's to change.
   *
   * Confirming says the resort has planned trails and lifts around this
   * session, so from then on a club asks rather than edits. That is what the
   * step meant before the rework, and without it confirming decided nothing
   * — it only changed a colour. The admin is deliberately unaffected.
   */
  const clubLocked = training.status === "confirmed" && !viewer.isAdmin;

  const mayEditNow = date !== today && !clubLocked;

  // Cancelling is not editing. A resort closes for weather on the day itself,
  // so an admin can call off anything dated today or later — including a
  // session that already finished this afternoon, because "it did not happen"
  // is noticed in the evening. Mirrors the rules, so the button is not offered
  // for a delete that would be refused. Clubs are unchanged: dropping out on
  // the day is a no-show, which check-in records.
  const mayCancelNow = mayEditNow || (viewer.isAdmin && date >= today);

  /** The rules refuse any update once a training has started. */
  const startsInPast = training.startAt
    ? training.startAt.toMillis() <= Date.now()
    : date < today;

  const canJoin =
    !READ_ONLY &&
    racersFree > 0 &&
    (!viewer.isLoggedIn || (!isParticipant && viewer.isLoggedIn));

  return (
    <div className={`res-container ${statusClass}`}>
      <div className="res-details-container">
        <div className="session-course-times">
          {session.startTime} - {session.endTime}
        </div>

        {mayManage && (mayEditNow || mayCancelNow) && (
          <div className="delEditButtons-group">
            {mayEditNow && (
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
            )}
            {mayCancelNow && (
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
            )}
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

        {viewer.isAdmin && date !== today && !READ_ONLY && (
          <button
            className="detail-button"
            onClick={() => actions.onMove(training)}
          >
            <i className="fa fa-arrows-alt"></i>
            PRESUNÚŤ
          </button>
        )}

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

        {/*
          The resort confirms, not the club.
          
          No separate flag is needed to know whether this resort confirms by
          hand: with automatic confirmation on, a booking is confirmed as it is
          written, so an unconfirmed one can only exist where the setting is
          off. The button therefore appears exactly where there is something to
          decide.
          
          Gated on the training still being ahead, which is what the rules
          require of any update — so no click is offered that would come back
          refused.
        */}
        {viewer.isAdmin &&
          training.status !== "confirmed" &&
          !startsInPast &&
          !READ_ONLY && (
            <button
              className="accept-training-button"
              onClick={() => actions.onConfirm(training)}
            >
              <i className="fa fa-check"></i>
              POTVRDIŤ REZERVÁCIU
            </button>
          )}

        {/*
          The way out of the lock. Conditions change, and a resort that
          confirmed by mistake would otherwise have to cancel the whole
          training to undo one click.
        */}
        {viewer.isAdmin &&
          training.status === "confirmed" &&
          !startsInPast &&
          !READ_ONLY && (
            <button
              className="detail-button"
              onClick={() => actions.onUnconfirm(training)}
            >
              <i className="fa fa-undo"></i>
              ZRUŠIŤ POTVRDENIE
            </button>
          )}

        {/* A club that cannot change it should be told why, not just find the
            buttons missing. */}
        {clubLocked && isParticipant && (
          <p className="locked-note" data-testid="locked-note">
            Rezerváciu potvrdilo stredisko. Zmeny a zrušenie už riešte s ním.
          </p>
        )}

        {/* On the day itself, the club marks that it actually turned up. */}
        {isParticipant && date === today && !READ_ONLY && (
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
