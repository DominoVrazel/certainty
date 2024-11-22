import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getAuth,
  signInWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import "../ForgottenPass.css";

const ForgottenPassword: React.FC = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const email = queryParams.get("email");

  const [formData, setFormData] = useState({
    password: "",
    ConfirmPassword: "",
  });
  const [message, setMessage] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("Email:", email);

    if (formData.password !== formData.ConfirmPassword) {
      //   setMessage("Heslá sa nezhodujú.");
      alert("Heslá sa nezhodujú.");
      return;
    } else if (!isStrongPassword(formData.password)) {
      alert(
        "Heslo musí obsahovať aspoň jedno veľké písmeno, jedno malé písmeno, jedno číslo a musí mať minimálne 6 znakov."
      );
      return false;
    }

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        throw new Error("No user is currently authenticated.");
      }
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email!,
        formData.password
      );
      //   const user = userCredential.user;

      await updatePassword(user, formData.password);
      setMessage("Heslo bolo úspešne obnovené.");
    } catch (error: any) {
      console.error("Error updating password:", error);
      setMessage("Chyba pri obnove hesla. Skúste znova.");
    }
  };

  const isStrongPassword = (password: string): boolean => {
    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,}$/;
    return strongPasswordRegex.test(password);
  };

  return (
    <>
      {/* {email && <p>Email: {email}</p>} */}
      <div className="ForgottenPass-body">
        <div className="ForgottenPass-container">
          <h2>Obnova hesla</h2>
          <form onSubmit={handleSubmit}>
            <div className="pass1">
              <label htmlFor="forgottenpassInput" className="form-label">
                Nové heslo:
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
                id="exampleFormControlInput1"
                placeholder="napríklad: Jablko123"
                value={formData.password}
                onChange={handleInputChange}
              />
            </div>
            <div className="pass2">
              <label htmlFor="forgottenpassInput2" className="form-label">
                Potvrdiť heslo:
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

            <button className="RegButton" type="submit">
              Obnoviť
            </button>
          </form>
          {/* {message && <p>{message}</p>} */}
        </div>
      </div>
    </>
  );
};

export default ForgottenPassword;
