import React from "react";
import Modal from "./Modal";
import { format } from "date-fns";

interface ReservationDetailsModalProps {
  reservationDetails: {
    createdAt: string;
    date: string;
    discipline: string;
    category: string;
    lineNumber: number;
    availableRacers: number;
    session: { startTime: string; endTime: string };
    status: string;
    user: {
      email: string;
      firstName: string;
      secondName: string;
      sportClub?: string;
      ownRacers: number;
    };
  };
  onClose: () => void;
}

const ReservationDetailsModal: React.FC<ReservationDetailsModalProps> = ({
  reservationDetails,
  onClose,
}) => {
  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-details-modal">
        <h4>Detail rezervácie</h4>
        <br></br>
        <p>
          <b>Zarezervoval/a: </b>
          {reservationDetails.user.firstName}{" "}
          {reservationDetails.user.secondName}
        </p>
        <p>
          <b>Športový club: </b>
          {reservationDetails.user.sportClub}
        </p>
        <p>
          <b>Kategória: </b>
          {reservationDetails.category}, <b>Pretekárov: </b>{" "}
          {reservationDetails.user.ownRacers}
        </p>
        <p>
          <b>Disciplína: </b>
          {reservationDetails.discipline}, <b>línia: </b>{" "}
          {reservationDetails.lineNumber}
        </p>
        <br></br>
        <p>
          <b>Počet voľných miest: </b>
          {reservationDetails.availableRacers}
        </p>
        <p>
          <b>Deň tréningu: </b>
          {formatDate(reservationDetails.date)}
        </p>

        <p>
          <b>Tréning od: </b>
          {reservationDetails.session.startTime} <b>do:</b>{" "}
          {reservationDetails.session.endTime}
        </p>
        <br></br>
        <p>
          <b>Status rezervácie: </b>
          {reservationDetails.status}
        </p>
        <p>
          <b>Vytvorená: </b>
          {formatTimestamp(reservationDetails.createdAt)}
        </p>
      </div>
    </Modal>
  );
};

function formatTimestamp(timestamp: any) {
  const date =
    timestamp instanceof Object
      ? format(new Date(timestamp.seconds * 1000), "dd.MM.yyyy")
      : format(new Date(timestamp), "dd.MM.yyyy");
  const time =
    timestamp instanceof Object
      ? format(new Date(timestamp.seconds * 1000), "HH:mm")
      : format(new Date(timestamp), "HH:mm");
  return `${date} o ${time}`;
}

function formatDate(date: string) {
  return format(new Date(date), "dd.MM.yyyy");
}

export default ReservationDetailsModal;
