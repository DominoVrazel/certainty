import React, { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { User } from "../App";
import "../AccountSettings.css";
import LoadingAnimation, { LoaderState } from "./LoadingAnimation";

interface AccountSettingsProps {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ user, setUser }) => {
  const [formData, setFormData] = useState<User>({
    firstName: "",
    secondName: "",
    tel_number: "",
    sportClub: "",
    ZSL_code: "",
    isAdmin: false,
  });
  const [verifyLoadingState, setVerifyLoadingState] = useState(
    LoaderState.Loading
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const db = getFirestore();
      const userId = localStorage.getItem("userId"); // Assuming user ID is stored in localStorage

      if (userId) {
        const userDocRef = doc(db, "users", userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser(userData);
          setFormData(userData);
        } else {
          console.error("No such user!");
        }
      } else {
        console.error("User ID is not available in localStorage.");
      }

      setVerifyLoadingState(LoaderState.Finished);
    };

    fetchUserData();
  }, [setUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const isValidPhoneNumber = (tel_number: string): boolean => {
    const phoneNumberRegex = /^\+\d{3}\d{9}$/;
    return phoneNumberRegex.test(tel_number);
  };

  const isValidZSL_code = (ZSL_code: string): boolean => {
    const zslCodeRegex = /^(\d{3}|\d{6})$/;
    return zslCodeRegex.test(ZSL_code);
  };

  //   const handleUpdate = (updatedData: User) => {
  //     setUser(updatedData);
  //     localStorage.setItem("userFirstName", updatedData.firstName);
  //     localStorage.setItem("userSecondName", updatedData.secondName);
  //     localStorage.setItem("userTelNumber", updatedData.tel_number);
  //     localStorage.setItem("userSportClub", updatedData.sportClub);
  //     localStorage.setItem("userZSL_code", updatedData.ZSL_code);
  //   };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.firstName ||
      !formData.secondName ||
      !formData.tel_number ||
      !formData.sportClub
    ) {
      setErrorMessage("Všetky povinné polia musia byť vyplnené.");
      return;
    }

    if (!isValidPhoneNumber(formData.tel_number)) {
      setErrorMessage(
        "Neplatné telefónne číslo. Zadajte v tvare s predvoľbou: +421900000000 ."
      );
      return;
    }

    if (!isValidZSL_code(formData.ZSL_code)) {
      setErrorMessage(
        "Neplatné ZSL číslo. Zadajte pre klub: 3 číslie, pre pretekára: 6 číslie."
      );
      return;
    }

    const db = getFirestore();
    const userId = localStorage.getItem("userId");

    if (userId) {
      const userDocRef = doc(db, "users", userId);
      try {
        await updateDoc(userDocRef, { ...formData });
        setUser(formData); // Update state in App component
        localStorage.setItem("userFirstName", formData.firstName);
        localStorage.setItem("userSecondName", formData.secondName);
        localStorage.setItem("userSportClub", formData.sportClub);
        localStorage.setItem("userZSL_code", formData.ZSL_code);
        setErrorMessage(null);
        alert("Account settings updated successfully!");
      } catch (error) {
        console.error("Error updating account settings: ", error);
        setErrorMessage("Failed to update account settings.");
      }
    } else {
      console.error("User ID is not available in localStorage.");
      setErrorMessage("User ID is not available in localStorage.");
    }
  };

  if (!user) {
    return <div>Nepríhlasený používateľ.</div>;
  }

  if (verifyLoadingState === LoaderState.Loading) {
    return (
      <div className="loading-animation-container">
        <LoadingAnimation state={verifyLoadingState} />
      </div>
    );
  }

  return (
    <div className="account-settings-container">
      <h2>Nastavenia účtu</h2>
      <p>
        V nastaveniach účtu môžete zmeniť Vaše osobné údaje. Jednoducho dané
        údaje prepíšte a zakliknite "Upraviť nastavenia".
      </p>
      {errorMessage && <div className="error-message">{errorMessage}</div>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            <b>Meno:</b>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
            />
          </label>
        </div>
        <div>
          <label>
            <b>Priezvisko:</b>
            <input
              type="text"
              name="secondName"
              value={formData.secondName}
              onChange={handleInputChange}
            />
          </label>
        </div>
        <div>
          <label>
            <b>Telefónne číslo:</b>
            <input
              type="text"
              name="tel_number"
              value={formData.tel_number}
              onChange={handleInputChange}
            />
          </label>
        </div>
        <div>
          <label>
            <b>Športový klub:</b>
            <input
              type="text"
              name="sportClub"
              value={formData.sportClub}
              onChange={handleInputChange}
            />
          </label>
        </div>
        <div>
          <label>
            <b>ZSL číslo:</b> (nepovinné, iba pre členov ZSL)
            <input
              type="text"
              name="ZSL_code"
              value={formData.ZSL_code}
              onChange={handleInputChange}
            />
          </label>
        </div>
        <button type="submit">Upraviť nastavenia</button>
      </form>
    </div>
  );
};

export default AccountSettings;
