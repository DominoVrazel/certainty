import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import LoginModal from "./LoginModal";
import Modal from "./Modal";
import "../Modal.css";
import "../App.css";

import { getTrainingByAnyId, type Training } from "../services/trainings";

/**
 * What the resort's booking mail links to.
 *
 * It used to confirm the booking on arrival: it wrote `status: "potvrdená"` to
 * `reservations/{id}` and mailed the club that the resort had accepted it. Two
 * things have since made that wrong. Bookings live in `trainings` now, so the
 * write landed on nothing — and because the component never checked, it still
 * announced success, which is worse than failing. And confirming is no longer
 * the resort's job: a resort either confirms automatically or the club confirms
 * its own attendance.
 *
 * So the link now shows the booking instead of acting on it. Read-only by
 * design: the admin screens are where a booking is changed or cancelled.
 */

interface ReservationDetailProps {
  isAdminLoggedIn: boolean;
}

type LoadState = "loading" | "found" | "missing" | "error";

const ReservationDetail: React.FC<ReservationDetailProps> = ({
  isAdminLoggedIn,
}) => {
  const { reservationId } = useParams<{ reservationId: string }>();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [training, setTraining] = useState<Training | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    setShowLoginModal(!isAdminLoggedIn);
  }, [isAdminLoggedIn]);

  useEffect(() => {
    // The participant list carries names, e-mails and phone numbers, so nothing
    // is fetched until we know an admin is looking.
    if (!isAdminLoggedIn || !reservationId) return;

    let cancelled = false;
    setState("loading");

    getTrainingByAnyId(reservationId)
      .then((found) => {
        if (cancelled) return;
        setTraining(found);
        setState(found ? "found" : "missing");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Rezerváciu sa nepodarilo načítať:", error);
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminLoggedIn, reservationId]);

  const participants = Object.values(training?.participants ?? {});

  return (
    <div className="ReservationDetailPage" data-testid="reservation-detail">
      <Modal show={showLoginModal} onClose={() => setShowLoginModal(false)}>
        <LoginModal />
      </Modal>

      {!isAdminLoggedIn && (
        <h1>Rezerváciu môže zobraziť iba administrátor strediska.</h1>
      )}

      {isAdminLoggedIn && state === "loading" && <h1>Načítavam rezerváciu…</h1>}

      {isAdminLoggedIn && state === "error" && (
        <h1 data-testid="reservation-error">
          Rezerváciu sa nepodarilo načítať. Skúste to prosím znova.
        </h1>
      )}

      {isAdminLoggedIn && state === "missing" && (
        <h1 data-testid="reservation-missing">
          Táto rezervácia už neexistuje — pravdepodobne bola zrušená.
        </h1>
      )}

      {isAdminLoggedIn && state === "found" && training && (
        <>
          <h1>Detail rezervácie</h1>
          <p>
            Zjazdovka <b>{training.courseName ?? training.courseId}</b>, trať{" "}
            <b>{training.lineNumber}</b>
          </p>
          <p>
            <b>{training.date}</b> od <b>{training.session?.startTime}</b> do{" "}
            <b>{training.session?.endTime}</b>
          </p>
          <p>
            Disciplína: <b>{training.discipline ?? "—"}</b>, kategória:{" "}
            <b>{training.category ?? "—"}</b>
          </p>
          <p>
            Závodníci: <b>{training.racersTotal}</b>, tréneri:{" "}
            <b>{training.coachesTotal}</b>
          </p>
          <p data-testid="reservation-status">
            Stav:{" "}
            <b>
              {training.status === "confirmed"
                ? "potvrdená"
                : `potvrdili ${training.confirmedCount} z ${training.participantCount}`}
            </b>
          </p>

          <h2>Kluby na tréningu</h2>
          <ul data-testid="reservation-participants">
            {participants.map((p) => (
              <li key={p.email ?? `${p.firstName}-${p.secondName}`}>
                <b>{p.sportClub ?? "—"}</b> — {p.firstName} {p.secondName}
                {p.email ? `, ${p.email}` : ""}
                {p.tel_number ? `, ${p.tel_number}` : ""} ({p.racers} záv.,{" "}
                {p.coaches} tr.)
                {p.confirmedAt ? " ✓ potvrdené" : ""}
              </li>
            ))}
          </ul>

          {training.note && (
            <p>
              Poznámka: <b>{training.note}</b>
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default ReservationDetail;
