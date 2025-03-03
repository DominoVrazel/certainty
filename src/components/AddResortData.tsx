import React, { useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db, storage } from "../services/FirebaseService"; // Ensure this path is correct

interface AddResortDataProps {
  onUpdate: () => void;
}

const AddResortData: React.FC<AddResortDataProps> = ({ onUpdate }) => {
  const [resortName, setResortName] = useState("");
  const [resortEmail, setResorEmail] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   if (file) {
  //     setImageFile(file);
  //   }
  // };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const addResortToDatabase = async () => {
    setLoading(true);
    setError(null);

    if (!resortName) {
      alert("Prosím zadajte názov strediska.");
      setLoading(false);
      return;
    }

    if (!validateEmail(resortEmail)) {
      alert("Neplatný email.");
      setLoading(false);
      return;
    }
    const notAllowedNameCharacters = [
      "\\",
      "/",
      ":",
      "*",
      "?",
      `"`,
      "<",
      ">",
      "|",
    ];

    const isNotAllowedName = resortName
      .split("")
      .some((char) => notAllowedNameCharacters.includes(char));

    try {
      const resortDocRef = doc(
        collection(db, "resorts"),
        resortName.replace(/[^a-zA-Z0-9]/g, "_")
      );
      await setDoc(resortDocRef, {
        name: resortName,
        email: resortEmail,
      });

      alert("Stredisko úspešne pridané do databázy!");
      //onUpdate();
      window.location.reload();
    } catch (err) {
      console.error("Chyba pri pridávaní strediska do databázy: ", err);
      setError("Chyba pri pridávaní strediska do databázy.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-resort-form">
      <h2 className="form-heading">Pridať informácie o stredisku</h2>
      <div className="form-group">
        <label className="form-label">
          Názov strediska:
          <input
            type="text"
            className="form-string-input"
            value={resortName}
            onChange={(e) => setResortName(e.target.value)}
            placeholder="Zadajte názov"
          />
        </label>
      </div>
      <div className="form-group">
        <label className="form-label">
          Administrátorský email:
          <input
            type="text"
            className="form-string-input"
            value={resortEmail}
            onChange={(e) => setResorEmail(e.target.value)}
            placeholder="Zadajte email"
          />
        </label>
      </div>
      <button
        className="btn btn-primary"
        onClick={addResortToDatabase}
        disabled={loading}
      >
        {loading ? "Pridávam..." : "Pridať stredisko"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
};

export default AddResortData;
