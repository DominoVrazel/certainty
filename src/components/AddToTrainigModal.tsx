import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { getFirestore, doc, deleteDoc } from "firebase/firestore";

interface ReservationModalProps {
  date: string;
  session: { startTime: string; endTime: string };
  onClose: () => void;
  onSubmit: (formData: any) => void;
  course: string;
  isExistingReservation?: boolean; // New prop to indicate if it's an existing reservation
  existingDetails?: any; // Add this prop to pass existing reservation details
}

const ReservationModal: React.FC<ReservationModalProps> = ({
  date,
  session,
  onClose,
  onSubmit,
  course,
  isExistingReservation = false, // Default to false if not provided
  existingDetails = {},
}) => {
  const [racers, setRacers] = useState<number>(1); // Default to 1 racer
  const [discipline, setDiscipline] = useState<string>("Slalom"); // Default discipline
  const [category, setCategory] = useState<string>("Žiaci");
  const db = getFirestore();
  useEffect(() => {
    // Populate form fields with existing reservation details if applicable
    if (isExistingReservation && existingDetails) {
      setRacers(existingDetails.racers || 1); // Set to existing racers count
      setDiscipline(existingDetails.discipline || "Slalom"); // Set to existing discipline
      setCategory(existingDetails.category || "Žiaci"); // Set to existing category
    }
  }, [isExistingReservation, existingDetails]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ racers, discipline, course, category });
    onClose(); // Close the modal after submission
  };

  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-modal">
        {isExistingReservation ? (
          <div>
            <h2 className="heading">Existujúca rezervácia:</h2>
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
            <h3>Rezervácia tréningu</h3>
            <br></br>
            <p>Dátum: {date}</p>
            <p>
              Čas: {session.startTime} - {session.endTime}
            </p>
            {/* Number of racers input */}
            <div className="form-group">
              <label htmlFor="racers">Počet pretekárov:</label>
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
