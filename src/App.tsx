import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate,
} from "react-router-dom";
import RegisterModal from "./components/RegisterModal";
import LoginModal from "./components/LoginModal";
import AdminPage from "./components/AdminPage";
import ResortPage from "./components/ResortPage";
import Modal from "./components/Modal";
import EmptyResortsPage from "./components/EmptyResortsPage";

import ReservationConfirm from "./components/ReservationConfirm";
import ForgottenPassword from "./components/ForgottenPassword";
import { logoutUser } from "./services/FirebaseService";

import Dropdown from "react-bootstrap/Dropdown";
import "bootstrap/dist/css/bootstrap.min.css";

import ZSLLogo from "./assets/images/Logo-ZSL.png";

import "./App.css";
import "./Modal.css";
import { getFirestore, collection, getDocs, doc } from "firebase/firestore";
import VerifyUser from "./components/VerifyUser";
import AccountSettings from "./components/AccountSettings";

export interface User {
  firstName: string;
  secondName: string;
  tel_number: string;
  sportClub: string;
  ZSL_code: string;
  isAdmin: boolean;
}

function App() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // State to track if user is logged in
  const [user, setUser] = useState<User | null>(null);
  const [resorts, setResorts] = useState<{ id: string; name: string }[]>([]);

  const db = getFirestore();

  useEffect(() => {
    const storedFirstName = localStorage.getItem("userFirstName");
    const storedSecondName = localStorage.getItem("userSecondName");
    const storedIsAdmin = localStorage.getItem("userAdmin");

    if (storedFirstName && storedSecondName) {
      setUser({
        firstName: storedFirstName,
        secondName: storedSecondName,
        tel_number: localStorage.getItem("userTelNumber") || "",
        sportClub: localStorage.getItem("userSportClub") || "",
        ZSL_code: localStorage.getItem("userZSL_code") || "",
        isAdmin: storedIsAdmin === "true",
      });
      setIsLoggedIn(true); // Is logged in
    } else {
      setIsLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    const fetchResorts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "resorts"));
        const resortsData: { id: string; name: string }[] = [];
        querySnapshot.forEach((doc) => {
          // Assuming each document has a 'name' field in Firestore
          const data = doc.data();
          resortsData.push({ id: doc.id, name: data.name });
        });

        setResorts(resortsData);
      } catch (error) {
        console.error("Error fetching resorts:", error);
      }
    };
    fetchResorts();
  }, [db]);

  const handleLogout = async () => {
    await logoutUser();
    localStorage.clear();
    setIsLoggedIn(false);
    window.location.reload();
  };

  return (
    <Router>
      {/* Navigation Menu */}

      <div className="card-header">
        <div className="navleft">
          <img
            src={ZSLLogo}
            alt="logo"
            style={{ width: "120px", height: "auto" }}
          />
          <ul>
            {user?.isAdmin && (
              <li className="nav-item">
                <Link to="/AdminPage" className="nav-admin" aria-current="true">
                  Admin
                </Link>
              </li>
            )}
            {resorts.map((resort) => (
              <li key={resort.id} className="nav-item">
                <Link to={`/resort/${resort.id}`} className="nav-resort">
                  {resort.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="navright">
          <div className="user-greeting">
            {isLoggedIn ? `Ahoj ${user?.firstName}.` : ""}
          </div>
          <div>
            <Dropdown>
              <Dropdown.Toggle
                variant="success"
                id="dropdown-basic"
                className="dropdown"
              >
                <i className="fa fa-user-circle user-icon"></i>
                {isLoggedIn && user?.firstName && user?.secondName
                  ? "Môj účet"
                  : "Prihlásenie"}
              </Dropdown.Toggle>

              <Dropdown.Menu>
                {isLoggedIn ? (
                  <>
                    <Dropdown.Item as={Link} to="/account-settings">
                      Nastavenia
                    </Dropdown.Item>
                    <Dropdown.Item onClick={handleLogout}>
                      Odhlásiť
                    </Dropdown.Item>
                  </>
                ) : (
                  // Is logged out
                  <>
                    <Dropdown.Item onClick={() => setShowRegisterModal(true)}>
                      Registrovať
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => setShowLoginModal(true)}>
                      Prihlásiť
                    </Dropdown.Item>
                  </>
                )}
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
      </div>

      {/* Register modal closing functionality */}
      <Modal
        show={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
      >
        <RegisterModal
          setShowRegisterModal={setShowRegisterModal}
          setShowLoginModal={setShowLoginModal}
        />
      </Modal>

      {/* Login modal closing functionality*/}
      <Modal show={showLoginModal} onClose={() => setShowLoginModal(false)}>
        <LoginModal />
      </Modal>

      {/* Routing functionality */}
      <Routes>
        <Route
          path="/"
          element={
            resorts.length > 0 ? (
              <Navigate to={`/resort/${resorts[0].id}`} />
            ) : (
              <EmptyResortsPage />
            )
          }
        />
        <Route path="/AdminPage" element={<AdminPage />} />
        {/* Dynamic resort routes */}
        {resorts.map((resort) => (
          <Route
            key={resort.id}
            path={`/resort/${resort.id}`}
            element={
              <ResortPage resortId={resort.id} isLoggedIn={isLoggedIn} />
            }
          />
        ))}
        {/* Register and Login routes */}
        <Route
          path="/RegisterModal"
          element={
            <RegisterModal
              setShowRegisterModal={setShowRegisterModal}
              setShowLoginModal={setShowLoginModal} //because the login is displayed immediately after registration.
            />
          }
        />
        <Route path="/LoginModal" element={<LoginModal />} />

        <Route
          path="/reservations/:reservationId"
          element={
            <ReservationConfirm
              isAdminLoggedIn={!!(isLoggedIn && user?.isAdmin)}
            />
          }
        />

        <Route
          path="/reset-password"
          element={<ForgottenPassword resorts={resorts} />}
        />
        <Route path="/verify-user" element={<VerifyUser />} />
        <Route
          path="/account-settings"
          element={<AccountSettings user={user} setUser={setUser} />}
        />
      </Routes>
    </Router>
  );
}

export default App;
