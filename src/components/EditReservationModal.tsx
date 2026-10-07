import React, { useState } from "react";
import Modal from "./Modal";
import { LoaderState } from "./LoadingAnimation";
import {
  TrainingError,
  updateParticipant,
  updateTrainingDetails,
  type Training,
} from "../services/trainings";

interface EditReservationModalProps {
  training: Training;
  individualLineCapacity: number;
  onClose: () => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
  setVerifyLoadingState: (state: LoaderState) => void;
}

/**
 * Edits one booking.
 *
 * All the Firestore work moved to services/trainings.ts. What used to happen
 * here was a pair of un-transacted writes that recomputed remaining capacity
 * from `availableRacers` as it looked when the modal opened — an unbounded
 * window for a lost update, and one of the reasons the counter could drift.
 * Deleting also lived here, duplicating the calendar's own control; it is now
 * only in the calendar, where leaving and cancelling are the same action.
 */
const EditReservationModal: React.FC<EditReservationModalProps> = ({
  training,
  individualLineCapacity,
  onClose,
  isAdmin,
  setVerifyLoadingState,
}) => {
  const uid = localStorage.getItem("userId");
  const mine = uid ? training.participants?.[uid] : undefined;
  const isOwner = mine?.role === "owner";

  const [formData, setFormData] = useState({
    discipline: training.discipline ?? "",
    category: training.category ?? "",
    ownRacers: mine?.racers ?? 0,
    ownCoaches: mine?.coaches ?? 0,
    note: training.note ?? "",
  });

  const availableDisciplines = ["Slalom", "Obrovský slalom"];
  const availableCategories = ["Predžiaci", "Žiaci", "Juniori"];

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      // Numeric fields must be parsed here. A string slipping through makes the
      // service's totals concatenate instead of add — 0 + "3" is "03".
      [name]:
        name === "ownRacers" || name === "ownCoaches"
          ? parseInt(value, 10) || 0
          : value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyLoadingState(LoaderState.Loading);

    try {
      if (
        uid &&
        mine &&
        (formData.ownRacers !== mine.racers ||
          formData.ownCoaches !== mine.coaches)
      ) {
        await updateParticipant(
          training.id,
          uid,
          { racers: formData.ownRacers, coaches: formData.ownCoaches },
          individualLineCapacity
        );
      }

      // The note is shared: any club on the training may write it, since it is
      // where coaches agree who sets the course and who brings what.
      if (formData.note !== (training.note ?? "")) {
        await updateTrainingDetails(training.id, { note: formData.note });
      }

      if (isOwner || isAdmin) {
        await updateTrainingDetails(training.id, {
          discipline: formData.discipline,
          category: formData.category,
        });
      }

      onClose();
    } catch (error) {
      console.error("Error updating training: ", error);
      alert(
        error instanceof TrainingError
          ? error.message
          : "Rezerváciu sa nepodarilo upraviť."
      );
    } finally {
      setVerifyLoadingState(LoaderState.Finished);
    }
  };

  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-modal">
        <form onSubmit={handleSave}>
          <h2 className="heading">Upraviť rezerváciu</h2>
          <br></br>
          {mine && (
            <div className="form-group">
              <label htmlFor="ownRacers">Počet pretekárov:</label>
              <input
                className="form-control"
                type="number"
                name="ownRacers"
                value={formData.ownRacers}
                onChange={handleInputChange}
                min="1"
                required
              />
            </div>
          )}
          {mine && (
            <div className="form-group">
              <label htmlFor="ownCoaches">Počet trénerov:</label>
              <input
                className="form-control"
                type="number"
                name="ownCoaches"
                value={formData.ownCoaches}
                onChange={handleInputChange}
                min="0"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="note">Poznámka (kto stavia trať, kto čo prinesie):</label>
            <textarea
              className="form-control"
              name="note"
              rows={3}
              value={formData.note}
              onChange={handleInputChange}
            />
          </div>
          {(isOwner || isAdmin) && (
            <>
              <div className="form-group">
                <label htmlFor="discipline">Disciplína:</label>
                <select
                  className="form-control"
                  name="discipline"
                  value={formData.discipline}
                  onChange={handleInputChange}
                  required
                >
                  {availableDisciplines.map((discipline) => (
                    <option key={discipline} value={discipline}>
                      {discipline}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="category">Kategória:</label>
                <select
                  className="form-control"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                >
                  {availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <button className="RegButton" type="submit">
            Uložiť
          </button>
        </form>
      </div>
    </Modal>
  );
};

export default EditReservationModal;
