import React, { useState, useEffect } from "react";
import { loginUser, checkIfEmailExists } from "../services/FirebaseService";
import {
  httpsCallable,
  getFunctions,
  connectFunctionsEmulator,
} from "firebase/functions";
import { getFirestore, collection, addDoc } from "firebase/firestore";

function LoginModal() {
  // State to store form data
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const functions = getFunctions();
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  //const navigate = useNavigate();

  // Check if user is already logged in when the component mounts
  useEffect(() => {
    const loggedInUser = localStorage.getItem("userEmail");
    const userFirstName = localStorage.getItem("userFirstName");
  }, []);

  // Function to handle login logic
  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent the default form submission
    try {
      // Call the loginUser function with email and password
      const userData = await loginUser(email, password); // Assuming this returns user data including sportclub

      if (userData && userData.sportClub && userData.isVerified) {
        localStorage.setItem("sportClub", userData.sportClub); // Store sport club in session storage
        localStorage.setItem("isVerified", userData.isVerified); // Store verification status in session storage
      }

      // After successful login, retrieve user details from session storage
      const userFirstName = localStorage.getItem("userFirstName");

      // Set the welcome message
      if (userFirstName) {
        window.location.reload();
      }
    } catch (error) {
      setMessage("Chyba pri prihlasovaní. Skúste znova."); // Set error message if login fails
    }
  };

  const sendEmail = async (
    subject: string,
    recipient: string,
    emailIdentifier: string,
    uuid: string
  ) => {
    const sendEmailFunction = httpsCallable<{
      emailData: {
        recipient: string;
        subject: string;
        emailIdentifier: string;
        uuid: string;
      };
    }>(functions, "sendEmail");
    try {
      const result = await sendEmailFunction({
        emailData: {
          recipient,
          subject,
          emailIdentifier,
          uuid,
        },
      });
      console.log("Email sent:", result);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  const handleForgottenPassSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    try {
      const emailExists = await checkIfEmailExists(resetEmail);
      if (!emailExists) {
        setMessage(
          "Používateľ neexistuje. Skontrolujte správnosť svojho emailu."
        );
        return;
      }

      const useremailIdentifier = "USER_FORGOTTEN_PASSWORD";

      const uuid = crypto.randomUUID();
      const db = getFirestore();

      await addDoc(collection(db, "user_sessions"), {
        uuid: uuid,
        email: resetEmail,
      });

      await sendEmail("Obnovenie hesla", resetEmail, useremailIdentifier, uuid);
      setMessage(
        "Email na obnovenie hesla bol odoslaný. <br /><br /> (Ak email neprichádza: počkajte 10 minút alebo skontrolujte SPAM.)"
      );
      setShowResetPassword(false);
    } catch (error) {
      setMessage(
        "Chyba pri odosielaní emailu na obnovenie hesla. Skúste znova."
      );
    }
  };

  return (
    <>
      <div className="RegisterPage-body">
        <div className="regcontainer">
          <h2>Prihlásenie</h2>
          <form onSubmit={handleLogin}>
            {" "}
            {/* Use form onSubmit */}
            <div className="mb3">
              <label htmlFor="login_email" className="form-label">
                Zadajte Váš email:
              </label>
              <input
                className="form-control"
                type="email"
                id="login_email" // Unique ID for email input
                placeholder="Váš email"
                value={email}
                onChange={(e) => setEmail(e.target.value)} // Update email state on change
                required // Makes the email input required
              />
            </div>
            <div className="mb3">
              <label htmlFor="login_password" className="form-label">
                Zadajte Vaše heslo:
              </label>
              <input
                className="form-control"
                type="password"
                id="login_password" // Unique ID for password input
                placeholder="Vaše heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)} // Update password state on change
                required // Makes the password input required
              />
            </div>
            <div className="ForgottenPassCon">
              <p className="ForgottenPassText">Zabudnuté heslo ?</p>
              <button
                className="ForgottenPassButton"
                type="button"
                onClick={() => setShowResetPassword(true)}
              >
                obnoviť heslo
              </button>
            </div>
            <button className="RegButton" type="submit">
              Prihlásiť
            </button>{" "}
            {/* React's onClick handler */}
            {/* Display message to user */}
            <div
              className="user_message"
              dangerouslySetInnerHTML={{ __html: message }}
            ></div>
          </form>
        </div>
      </div>

      {showResetPassword && (
        <div className="ForgottenPassDropdown">
          <div className="regcontainer">
            <h2>Obnovenie hesla</h2>
            <form onSubmit={handleForgottenPassSubmit}>
              <div className="mb3">
                <label htmlFor="reset_email" className="form-label">
                  Zadajte Váš email pre obnovenie hesla:
                </label>
                <input
                  className="form-control"
                  type="email"
                  id="reset_email"
                  placeholder="Váš email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
              <button className="SendForgottenPass" type="submit">
                Odoslať
              </button>
              <button
                className="CancelForgottenPass"
                type="button"
                onClick={() => setShowResetPassword(false)}
              >
                Zrušiť
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default LoginModal;
