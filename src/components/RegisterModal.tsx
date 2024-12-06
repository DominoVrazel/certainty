import React, { useState } from "react";
import { registerUser } from "../services/FirebaseService";
import { getFunctions, httpsCallable } from "firebase/functions";
import { addDoc, collection, getFirestore } from "firebase/firestore";

interface RegisterModalProps {
  setShowRegisterModal: (show: boolean) => void;
  setShowLoginModal: (show: boolean) => void;
}

async function sendRegistrationEmail(email: string, firstName: string) {
  const functions = getFunctions();

  const sendVerifyEmail = httpsCallable<{
    emailData: {
      recipient: string;
      subject: string;
      userFirstName: string;
      emailIdentifier: string;
      uuid: string;
    };
  }>(functions, "sendEmail");

  const uuid = crypto.randomUUID();
  const db = getFirestore();

  await addDoc(collection(db, "verify_user_sessions"), {
    uuid: uuid,
    email,
  });

  await sendVerifyEmail({
    emailData: {
      recipient: email,
      subject: "Overenie emailu",
      userFirstName: firstName,
      emailIdentifier: "USER_VERIFY_EMAIL",
      uuid,
    },
  });
}

const RegisterModal: React.FC<RegisterModalProps> = ({
  setShowRegisterModal,
  setShowLoginModal,
}) => {
  const [formData, setFormData] = useState({
    first_name: "",
    second_name: "",
    email: "",
    password: "",
    ConfirmPassword: "",
    sport_club: "",
    tel_number: "",
    ZSL_code: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === "tel_number" ? value.replace(/\s+/g, "") : value, // Remove spaces from tel_number
    });
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (isSubmitting) return; // Prevent multiple submissions
    setIsSubmitting(true); // Set the submitting flag

    const {
      first_name,
      second_name,
      email,
      password,
      ConfirmPassword,
      sport_club,
      tel_number,
      ZSL_code,
    } = formData; // This line already captures ConfirmPassword
    try {
      const isSuccess = await registerUser(
        first_name,
        second_name,
        email,
        password,
        ConfirmPassword,
        sport_club,
        tel_number,
        ZSL_code
      );

      if (isSuccess) {
        // Only navigate if registration was successful
        setShowRegisterModal(false);
        setShowLoginModal(true);
        await sendRegistrationEmail(email, first_name);
        //window.location.reload();
      } else {
        // Reset submitting flag if registration failed
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Error during registration: ", error);
      setIsSubmitting(false); // Reset submitting flag if an error occurs
    }
  };

  return (
    <>
      <div className="RegisterPage-body">
        <div className="regcontainer">
          <h2>Registrácia</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb3">
              <label htmlFor="nameInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Krstné meno:
              </label>
              <input
                className="form-control"
                type="text"
                name="first_name"
                id="nameInput"
                placeholder="Vaše krstné meno"
                value={formData.first_name}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="surnameInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Priezvisko:
              </label>
              <input
                className="form-control"
                type="text"
                name="second_name"
                id="surnameInput"
                placeholder="Vaše priezvisko"
                value={formData.second_name}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="emailInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Email adresa:
              </label>
              <input
                className="form-control"
                type="email"
                name="email"
                id="emailInput"
                placeholder="Zadajte email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="passwordInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Heslo:
                <span
                  className="info-icon"
                  data-tooltip="Heslo musí obsahovať aspoň jedno veľké písmeno, jedno malé písmeno, jedno číslo a musí mať minimálne 6 znakov."
                >
                  <i className="fas fa-info-circle"></i>
                </span>
              </label>
              <input
                className="form-control"
                type="password"
                name="password"
                id="passwordInput"
                placeholder="napríklad: Jablko123"
                value={formData.password}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="repeatPasswordInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Potvrdiť heslo:
              </label>
              <input
                className="form-control"
                type="password"
                name="ConfirmPassword"
                id="repeatPasswordInput"
                placeholder="Potvrďte heslo"
                value={formData.ConfirmPassword}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="sportClubInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Športový klub:
              </label>
              <input
                className="form-control"
                type="text"
                name="sport_club"
                id="sportClubInput"
                placeholder="Váš športový klub"
                value={formData.sport_club}
                onChange={handleInputChange}
              />
            </div>

            <div className="mb3">
              <label htmlFor="telNumberInput" className="form-label">
                <span style={{ color: "red" }}>*</span> Telefónne číslo:
                <span
                  className="info-icon"
                  data-tooltip="Číslo s predvoľbou bez medzier."
                >
                  <i className="fas fa-info-circle"></i>
                </span>
              </label>
              <input
                className="form-control"
                type="text"
                name="tel_number"
                id="telNumberInput"
                placeholder="napríklad: +421905010001"
                value={formData.tel_number}
                onChange={handleInputChange}
              />
            </div>

            <div className="mb3">
              <label htmlFor="ZSLcodeInput" className="form-label">
                Registračné číslo ZSL:
                <span
                  className="info-icon"
                  data-tooltip="6 miestné ZSL číslo pre Vaše overenie a prístup kú výhodam členstva vo ZSL"
                >
                  <i className="fas fa-info-circle"></i>
                </span>
              </label>
              <input
                className="form-control"
                type="text"
                name="ZSL_code"
                id="ZSLcodeInput"
                placeholder="ZSL číslo (NEPOVINNÝ ÚDAJ)"
                value={formData.ZSL_code}
                onChange={handleInputChange}
              />
            </div>

            <button className="RegButton" type="submit">
              Registrovať
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default RegisterModal;
