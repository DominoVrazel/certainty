import React, { useState } from "react";
import Modal from "./Modal";
import { updateDoc, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore"; // Ensure you import Firestore methods

interface User {
  email: string;
  firstName: string;
  secondName: string;
  sportClub?: string; // Optional field
  ownRacers: number; // Required field
}

interface EditReservationModalProps {
  reservationDetails: {
    id: string;
    availableRacers: number;
    discipline: string;
    category: string;
    tickets: number;
    status: string;

    user: User;
    addedUsers?: User[];
  };
  onClose: () => void;
  onUpdate: () => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
}

const EditReservationModal: React.FC<EditReservationModalProps> = ({
  reservationDetails,
  onClose,
  onUpdate,
  isLoggedIn,
  isAdmin,
}) => {
  const db = getFirestore(); // Initialize Firestore
  const loggedInUserEmail = localStorage.getItem("userEmail");

  const isOwner = reservationDetails.user.email === loggedInUserEmail;
  const addedUser = reservationDetails.addedUsers?.find(
    (user) => user.email === loggedInUserEmail
  );

  const [formData, setFormData] = useState({
    racers: reservationDetails.availableRacers,
    discipline: reservationDetails.discipline,
    category: reservationDetails.category,
    status: reservationDetails.status,
    ownRacers: isOwner
      ? reservationDetails.user.ownRacers
      : addedUser?.ownRacers || 0,
  });

  const availableDisciplines = ["Slalom", "Obrovský slalom"];
  const availableCategories = ["Predžiaci", "Žiaci", "Juniori"]; // Add your disciplines here

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const parsedValue = name === "ownRacers" ? parseInt(value, 10) : value;

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue, // Update state with parsed value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission
    try {
      const reservationRef = doc(db, "reservations", reservationDetails.id);

      if (isOwner || isAdmin) {
        const updates: any = {
          discipline: formData.discipline,
          category: formData.category,
          status: formData.status,
        };

        if (isOwner) {
          const ownRacersDifference =
            formData.ownRacers - reservationDetails.user.ownRacers;

          // Update availableRacers based on the difference
          const newAvailableRacers =
            reservationDetails.availableRacers - ownRacersDifference;
          if (newAvailableRacers < 0) {
            alert("Nedostatok voľných miest pre zvolený počet pretekárov.");
            return;
          }
          updates.availableRacers = newAvailableRacers;
          updates["user.ownRacers"] = formData.ownRacers;
        }

        await updateDoc(reservationRef, updates);
      } else if (addedUser) {
        const ownRacersDifference = formData.ownRacers - addedUser.ownRacers;

        // Update availableRacers based on the difference
        const newAvailableRacers =
          reservationDetails.availableRacers - ownRacersDifference;

        if (newAvailableRacers < 0) {
          alert("Nedostatok voľných miest pre zvolený počet pretekárov.");
          return;
        }
        // Fetch the current document
        const addedUserRef = doc(
          db,
          "reservations",
          reservationDetails.id,
          "addedUsers",
          addedUser.email // assuming email is the document ID in the addedUsers subcollection
        );

        const addedUserDoc = await getDoc(addedUserRef);
        // Update the document with the modified addedUsers array
        if (addedUserDoc.exists()) {
          // Update the ownRacers field for this addedUser if the document exists
          await updateDoc(addedUserRef, {
            ownRacers: formData.ownRacers,
          });
        } else {
          // If the document doesn't exist, create it with the necessary data
          await setDoc(addedUserRef, {
            email: addedUser.email,
            firstName: addedUser.firstName,
            secondName: addedUser.secondName,
            sportClub: addedUser.sportClub,
            ownRacers: formData.ownRacers,
          });
        }

        // Update the main reservation document's availableRacers field
        await updateDoc(reservationRef, {
          availableRacers: newAvailableRacers,
        });
      }

      onUpdate();
      onClose(); // Close the modal
    } catch (error) {
      console.error("Error updating reservation: ", error);
      alert("There was an error updating the reservation.");
    }
  };

  const handleDelete = async () => {
    try {
      const reservationRef = doc(db, "reservations", reservationDetails.id);
      if (isOwner || isAdmin) {
        await deleteDoc(reservationRef);
      } else if (addedUser) {
        // Remove the added user from the subcollection
        const addedUserRef = doc(
          db,
          "reservations",
          reservationDetails.id,
          "addedUsers",
          addedUser.email
        );
        await deleteDoc(addedUserRef);

        // Update the main reservation document's availableRacers field
        const newAvailableRacers =
          reservationDetails.availableRacers + addedUser.ownRacers;
        await updateDoc(reservationRef, {
          availableRacers: newAvailableRacers,
        });
      }
      onUpdate();
      onClose(); // Close the modal
    } catch (error) {
      console.error("Error deleting reservation: ", error);
      alert("There was an error deleting the reservation.");
    }
  };

  return (
    <Modal show={true} onClose={onClose}>
      <div className="reservation-modal">
        <form onSubmit={handleSave}>
          <h4>Upraviť rezerváciu</h4>
          <br></br>
          {!isAdmin && (
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
        {!isOwner && addedUser && !isAdmin && (
          <button className="RegButton" onClick={handleDelete}>
            Zmazať rezerváciu
          </button>
        )}
      </div>
    </Modal>
  );
};

export default EditReservationModal;
