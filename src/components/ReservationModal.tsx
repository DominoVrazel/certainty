import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { getFirestore, doc, deleteDoc } from "firebase/firestore";

interface ReservationModalProps {
  date: string;
  session: { startTime: string; endTime: string };
  individualLineCapacity: number;
  onClose: () => void;
  onSubmit: (formData: any) => void;
  onUpdate: () => void;
  course: string;
  isExistingReservation?: boolean; // New prop to indicate if it's an existing reservation
  existingDetails?: any; // Add this prop to pass existing reservation details
  isLoggedIn: boolean;
}

const ReservationModal: React.FC<ReservationModalProps> = ({
  date,
  session,
  individualLineCapacity,
  onClose,
  onSubmit,
  onUpdate,
  course,
  isExistingReservation = false, // Default to false if not provided
  existingDetails = {},
  isLoggedIn,
}) => {
  const [racers, setRacers] = useState<number>(1);
  const [tickets, setTickets] = useState<number>(1);
  const [discipline, setDiscipline] = useState<string>("Slalom"); // Default discipline
  const [category, setCategory] = useState<string>("Žiaci");
  const db = getFirestore();
  useEffect(() => {
    // Populate form fields with existing reservation details if applicable
    if (isExistingReservation && existingDetails) {
      setRacers(existingDetails.racers || 1); // Set to existing racers count
      setDiscipline(existingDetails.discipline || "Slalom"); // Set to existing discipline
      setCategory(existingDetails.category || "Žiaci"); // Set to existing category
      setTickets(existingDetails.tickets || 1); // Set to existing tickets count
    }
  }, [isExistingReservation, existingDetails]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ racers, discipline, course, category, tickets });
    onUpdate(); // Update the reservation list after submission
    onClose(); // Close the modal after submission
  };

  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-modal">
        {isExistingReservation ? (
          <div>
            <h4>Existujúca rezervácia:</h4>
            <br></br>
            <p>
              Rezervoval:
              {` ${existingDetails.user.firstName} ${existingDetails.user.secondName}`}
            </p>
            <p>Počet pretekárov: {existingDetails.racers || "N/A"}</p>
            <p>Disciplína: {existingDetails.discipline || "N/A"}</p>
            <p>Status rezervácie: {existingDetails.status || "N/A"}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="heading">Rezervácia tréningu</h2>
            <br></br>
            <p>Dátum: {date}</p>
            <p>
              Čas: {session.startTime} - {session.endTime}
            </p>
            {/* Number of racers input */}
            <div className="form-group">
              <label htmlFor="racers">
                Počet pretekárov: (maximum {individualLineCapacity})
              </label>
              <input
                className="form-control"
                id="racers"
                type="number"
                value={racers}
                min={1}
                onChange={(e) => setRacers(parseInt(e.target.value))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="tickets">Množstvo tréningových lístkov:</label>
              <input
                className="form-control"
                id="tickets"
                type="number"
                value={tickets}
                min={1}
                onChange={(e) => setTickets(parseInt(e.target.value))}
                required
              />
            </div>

            {/* Discipline type selection */}
            <div className="form-group">
              <label htmlFor="discipline">Typ disciplíny:</label>
              <select
                className="form-control"
                id="discipline"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                required
              >
                <option value="Slalom">Slalom</option>
                <option value="Obrovský slalom">Obrovský slalom</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="category">Kategória:</label>
              <select
                className="form-control"
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                <option value="Predžiaci">Predžiaci u10/u12</option>
                <option value="Žiaci">Žiaci u14/u16</option>
                <option value="Juniori">Juniori/FIS</option>
              </select>
            </div>

            <button className="RegButton" type="submit">
              Rezervovať
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default ReservationModal;
