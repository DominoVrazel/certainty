import { useParams } from "react-router-dom";
import LoginModal from "./LoginModal";
import Modal from "./Modal";
import { useState, useEffect } from "react";
import "../Modal.css";
import "../App.css";

import { getApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { send } from "vite";
import {
  httpsCallable,
  getFunctions,
  connectFunctionsEmulator,
} from "firebase/functions";

interface ReservatinConfirmProps {
  isAdminLoggedIn: boolean;
}

const app = getApp();
console.log("App: ", app);
const functions = getFunctions(app);

if (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

const ReservationConfirmRouteComponent: React.FC<ReservatinConfirmProps> = ({
  isAdminLoggedIn,
}) => {
  const app = getApp();
  const db = getFirestore(app);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isReservationConfirmed, setIsReservationConfirmed] = useState(false);

  const { reservationId } = useParams<{ reservationId: string }>();

  useEffect(() => {
    if (!isAdminLoggedIn) {
      setShowLoginModal(true);
    } else {
      setShowLoginModal(false);
      if (reservationId) {
        confirmReservation(reservationId);
      }
    }
  }, [isAdminLoggedIn, reservationId]);

  const confirmReservation = async (reservationId: string) => {
    try {
      const reservationRef = doc(db, "reservations", reservationId);
      const reservationDoc = await getDoc(reservationRef);

      if (reservationDoc.exists()) {
        const reservationData = reservationDoc.data();
        const userEmail = reservationData.user.email;
        const userFirstName = reservationData.user.firstName;
        const userSecondName = reservationData.user.secondName;

        await updateDoc(reservationRef, {
          status: "potvrdená",
        });
        setIsReservationConfirmed(true);
        console.log("Reservation status updated to 'potvrdená'");

        const useremailSubject = `Vaša rezervácia na ${reservationData.date} bola potvrdená `;
        const useremailIdentifier = "USER_ACCEPTED_RES";

        if (userEmail && userFirstName && userSecondName) {
          sendEmail(
            useremailSubject,
            userEmail,
            userFirstName,
            userSecondName,
            useremailIdentifier
          );
        } else {
          console.error("User email is null. Cannot send email.");
        }
      } else {
        console.error("No such reservation!");
      }
    } catch (error) {
      console.error("Error updating reservation status: ", error);
    }
  };

  return (
    <>
      <div className="ReservationConfirmPage">
        <Modal show={showLoginModal} onClose={() => setShowLoginModal(false)}>
          <LoginModal />
        </Modal>
        {isAdminLoggedIn ? (
          <>
            <h1>Rezervácia bola úspešne potvredná</h1>
            {isReservationConfirmed && <p>Nový status rezervácie: potvrdená</p>}
          </>
        ) : (
          <>
            <h1>Rezerváciu môže potvrdiť iba admin</h1>
          </>
        )}
      </div>
    </>
  );

  // TODO:
  // 1. Zistit, ci je prihlaseny pouzivatel s Admin kontom
  // 2. Pokial nie, tak vykreslit komponent na prihlasovanie -> prejst procesom prihlasovania
  // 3. Pokial ano, tak  potvrdit rezervaciu s id ${reservationId}
  // 3.1. VYhladat danu rezervaciu vo firestore
  // 3.2 Zmenit jej status na potvrdeny
};

export default ReservationConfirmRouteComponent;

const sendEmail = async (
  subject: string,
  recipient: string,
  userFirstName: string,
  userSecondName: string,
  emailIdentifier: string
) => {
  const sendEmailFunction = httpsCallable<{
    emailData: {
      recipient: string;
      subject: string;
      userFirstName: string;
      userSecondName: string;
      emailIdentifier: string;
    };
  }>(functions, "sendEmail");
  try {
    const result = await sendEmailFunction({
      emailData: {
        recipient,
        subject,
        userFirstName,
        userSecondName,
        emailIdentifier,
      },
    });
    console.log("Email sent:", result);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
