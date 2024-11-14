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
import { logoutUser } from "./services/FirebaseService";

import Dropdown from "react-bootstrap/Dropdown";
import "bootstrap/dist/css/bootstrap.min.css";

import "./App.css";
import "./Modal.css";
import { getFirestore, collection, getDocs, doc } from "firebase/firestore";

function App() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // State to track if user is logged in
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userSecondName, setUserSecondName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [resorts, setResorts] = useState<{ id: string; name: string }[]>([]);

  const db = getFirestore();

  useEffect(() => {
    const storedFirstName = localStorage.getItem("userFirstName");
    const storedSecondName = localStorage.getItem("userSecondName");
    const storedIsAdmin = localStorage.getItem("userAdmin");

    if (storedFirstName && storedSecondName) {
      setUserFirstName(storedFirstName);
      setUserSecondName(storedSecondName);
      setIsAdmin(storedIsAdmin === "true");
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
      <div className="card text-center">
        <div className="card-header">
          <ul className="nav nav-tabs card-header-tabs">
            <div className="navleft">
              {isAdmin && (
                <li className="nav-item">
                  <Link
                    to="/AdminPage"
                    className="nav-link"
                    aria-current="true"
                  >
                    Admin
                  </Link>
                </li>
              )}
              {resorts.map((resort) => (
                <li key={resort.id} className="nav-item">
                  <Link to={`/resort/${resort.id}`} className="nav-link">
                    {resort.name}
                  </Link>
                </li>
              ))}
            </div>
          </ul>
          <div className="navright">
            <div className="user-greeting">
              {isLoggedIn ? `Ahoj ${userFirstName}.` : ""}
            </div>
            <div>
              <Dropdown>
                <Dropdown.Toggle variant="success" id="dropdown-basic">
                  {isLoggedIn && userFirstName && userSecondName
                    ? "Môj účet"
                    : "Prihlásenie"}
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  {isLoggedIn ? (
                    // Is logged in
                    <Dropdown.Item onClick={handleLogout}>
                      Odhlásiť
                    </Dropdown.Item>
                  ) : (
                    // Is logged out
                    <>
                      <Dropdown.Item onClick={() => setShowRegisterModal(true)}>
                        Register
                      </Dropdown.Item>
                      <Dropdown.Item onClick={() => setShowLoginModal(true)}>
                        Login
                      </Dropdown.Item>
                    </>
                  )}
                </Dropdown.Menu>
              </Dropdown>
            </div>
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
            <ReservationConfirm isAdminLoggedIn={isLoggedIn && isAdmin} />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
