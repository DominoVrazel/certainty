import React, { useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../services/FirebaseService"; // Ensure this path is correct

interface AddResortDataProps {
  onUpdate: () => void;
}

const AddResortData: React.FC<AddResortDataProps> = ({ onUpdate }) => {
  const [resortName, setResortName] = useState("");
  const [resortEmail, setResorEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addResortToDatabase = async () => {
    setLoading(true);
    setError(null);

    if (!resortName) {
      alert("Prosím zadajte názov strediska.");
      setLoading(false);
      return;
    }

    try {
      // Reference for the resort in the 'resorts' collection
      const resortDocRef = doc(
        collection(db, "resorts"),
        resortName.replace(/[^a-zA-Z0-9]/g, "_")
      );
      await setDoc(resortDocRef, { name: resortName, email: resortEmail });

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
    <div>
      <h2>Pridať informácie o stredisku</h2>
      <div>
        <label>
          Názov strediska:
          <input
            type="text"
            value={resortName}
            onChange={(e) => setResortName(e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          Administrátorský email:
          <input
            type="text"
            value={resortEmail}
            onChange={(e) => setResorEmail(e.target.value)}
          />
        </label>
      </div>
      <button onClick={addResortToDatabase} disabled={loading}>
        {loading ? "Pridávam..." : "Pridať stredisko"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default AddResortData;
