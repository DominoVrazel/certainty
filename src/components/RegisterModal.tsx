import React, { useState } from "react";
import { registerUser } from "../services/FirebaseService";

interface RegisterModalProps {
  setShowRegisterModal: (show: boolean) => void;
  setShowLoginModal: (show: boolean) => void;
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
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
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
    } = formData; // This line already captures ConfirmPassword
    try {
      const isSuccess: boolean = await registerUser(
        first_name,
        second_name,
        email,
        password,
        ConfirmPassword,
        sport_club,
        tel_number
      );

      if (isSuccess) {
        // Only navigate if registration was successful
        setShowRegisterModal(false);
        setShowLoginModal(true);
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
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Krstné meno:
              </label>
              <input
                className="form-control"
                type="text"
                name="first_name"
                id="exampleFormControlInput1"
                placeholder="Vaše krstné meno"
                value={formData.first_name}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Priezvisko:
              </label>
              <input
                className="form-control"
                type="text"
                name="second_name"
                id="exampleFormControlInput1"
                placeholder="Vaše priezvisko"
                value={formData.second_name}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Email adresa:
              </label>
              <input
                className="form-control"
                type="email"
                name="email"
                id="exampleFormControlInput1"
                placeholder="Zadajte email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Heslo (minimum 6 pismen):
              </label>
              <input
                className="form-control"
                type="password"
                name="password"
                id="exampleFormControlInput1"
                placeholder="Zadajte heslo"
                value={formData.password}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Potvrdiť heslo (minimum 6 pismen):
              </label>
              <input
                className="form-control"
                type="password"
                name="ConfirmPassword"
                id="exampleFormControlInput1"
                placeholder="Potvrďte heslo"
                value={formData.ConfirmPassword}
                onChange={handleInputChange}
              />
            </div>
            <div className="mb3">
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Športový klub:
              </label>
              <input
                className="form-control"
                type="text"
                name="sport_club"
                id="exampleFormControlInput1"
                placeholder="Váš športový klub"
                value={formData.sport_club}
                onChange={handleInputChange}
              />
            </div>

            <div className="mb3">
              <label htmlFor="exampleFormControlInput1" className="form-label">
                Telefónne číslo:
              </label>
              <input
                className="form-control"
                type="number"
                name="tel_number"
                id="exampleFormControlInput1"
                placeholder="Vaše telefónne číslo"
                value={formData.tel_number}
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
