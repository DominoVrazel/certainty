import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../ForgottenPass.css";
import { getFunctions, httpsCallable } from "firebase/functions";

interface ResetPasswordResponse {
  status: string;
}

interface Resort {
  id: string;
  name: string;
}

interface ForgottenPasswordProps {
  resorts: Resort[];
}

const ForgottenPassword: React.FC<ForgottenPasswordProps> = ({ resorts }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const uuid = queryParams.get("uuid") as string;

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
    const functions = getFunctions();
    const resetPassword = httpsCallable<{
      uuid: string;
      newPassword: string;
    }>(functions, "resetPassword");

    try {
      const response = await resetPassword({
        uuid: uuid,
        newPassword: formData.password,
      });

      // Check if response.data is defined and has the expected structure
      if (response.data && (response.data as ResetPasswordResponse).status) {
        const responseData = response.data as ResetPasswordResponse;

        if (responseData.status === "Updated") {
          alert("Heslo bolo úspešne aktualizované.");
          navigate(`/resort/${resorts[0].id}`);
        } else {
          alert("Pri aktualizácii hesla došlo k chybe.");
        }
      } else {
        alert("Pri aktualizácii hesla došlo k chybe.");
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      alert("Pri aktualizácii hesla došlo k chybe.");
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
