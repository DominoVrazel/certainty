import React, { useState, useEffect } from "react";
import { loginUser } from "../services/FirebaseService";

function LoginModal() {
  // State to store form data
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

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

      if (userData && userData.sportClub) {
        localStorage.setItem("sportClub", userData.sportClub); // Store sport club in session storage
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
            <button className="RegButton" type="submit">
              Prihlásiť
            </button>{" "}
            {/* React's onClick handler */}
            {/* Display message to user */}
            <div id="user_message">{message}</div>
          </form>
        </div>
      </div>
    </>
  );
}

export default LoginModal;
