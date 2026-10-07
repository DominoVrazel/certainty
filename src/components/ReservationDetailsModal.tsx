import React from "react";
import Modal from "./Modal";
import { format } from "date-fns";
import type { Training } from "../services/trainings";

interface ReservationDetailsModalProps {
  training: Training;
  /** Needed to show free space, which is derived rather than stored. */
  individualLineCapacity?: number;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  created: "vytvorená",
  confirmed: "potvrdená",
};

const ReservationDetailsModal: React.FC<ReservationDetailsModalProps> = ({
  training,
  individualLineCapacity,
  onClose,
}) => {
  const participants = Object.values(training.participants ?? {});
  const owner =
    participants.find((p) => p.role === "owner") ?? participants[0];

  const racersFree =
    individualLineCapacity !== undefined
      ? Math.max(individualLineCapacity - training.racersTotal, 0)
      : null;

  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-details-modal">
        <h2 className="heading">Detail rezervácie</h2>
        <br></br>
        <p>
          <b>Zarezervoval/a: </b>
          {owner?.firstName} {owner?.secondName}
        </p>
        <p>
          <b>Športový club: </b>
          {owner?.sportClub}
        </p>
        <p>
          <b>Kategória: </b>
          {training.category}, <b>Pretekárov: </b> {owner?.racers}
        </p>
        <p>
          <b>Disciplína: </b>
          {training.discipline}, <b>línia: </b> {training.lineNumber}
        </p>
        <br></br>
        {racersFree !== null && (
          <p>
            <b>Počet voľných miest: </b>
            {racersFree}
          </p>
        )}
        <p>
          <b>Prihlásené kluby: </b>
          {training.clubs?.join(", ") || "—"}
        </p>
        <p>
          <b>Pretekárov spolu: </b>
          {training.racersTotal}
        </p>
        <p>
          <b>Deň tréningu: </b>
          {formatDate(training.date)}
        </p>

        <p>
          <b>Tréning od: </b>
          {training.session.startTime} <b>do:</b> {training.session.endTime}
        </p>
        <br></br>
        <p>
          <b>Status rezervácie: </b>
          {STATUS_LABELS[training.status] ?? training.status}
        </p>
        <p>
          <b>Vytvorená: </b>
          {formatTimestamp(training.createdAt)}
        </p>
      </div>
    </Modal>
  );
};

function formatTimestamp(timestamp: any) {
  if (!timestamp) return "—";
  const date =
    timestamp instanceof Object && "seconds" in timestamp
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp);
  return `${format(date, "dd.MM.yyyy")} o ${format(date, "HH:mm")}`;
}

function formatDate(date: string) {
  return format(new Date(date), "dd.MM.yyyy");
}

export default ReservationDetailsModal;
