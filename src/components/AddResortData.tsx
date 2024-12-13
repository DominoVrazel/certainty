import React, { useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../services/FirebaseService"; // Ensure this path is correct

interface AddResortDataProps {
  onUpdate: () => void;
}

function csvToJson(csvString: string): any[] {
  try {
    const rows = csvString.trim().split("\n");
    const headers = rows[0].split(",").map((header) => header.trim());

    const jsonData = rows.slice(1).map((row) => {
      const values = row.split(",").map((value) => value.trim());
      let obj: { [key: string]: string | null } = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || null;
      });
      return obj;
    });

    return jsonData;
  } catch (error) {
    console.error("Error converting CSV to JSON:", error);
    return [];
  }
}

const AddResortData: React.FC<AddResortDataProps> = ({ onUpdate }) => {
  const [resortName, setResortName] = useState("");
  const [resortEmail, setResorEmail] = useState("");
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== "text/csv") {
        alert("Neplatný formát súboru. Prosím nahrajte CSV súbor.");
        return;
      }
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvString = e.target?.result as string;
        const jsonData = csvToJson(csvString);
        setCsvData(jsonData);
        console.log("Parsed CSV Data:", jsonData);
      };
      reader.readAsText(file);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
    }
  };

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

    if (!csvFile) {
      alert("Prosím nahrajte CSV súbor.");
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
      // resorts/${resortName.replace(/[^a-zA-Z0-9]/g, "_")}/image
      if (imageFile) {
        console.log("file blob: ", imageFile);
        const storageRef = ref(
          storage,
          `resorts/${resortName}/${imageFile.name}`
        );
        const x = await uploadBytes(storageRef, imageFile);
        console.log("ahopj", x);
      }

      const resortDocRef = doc(
        collection(db, "resorts"),
        resortName.replace(/[^a-zA-Z0-9]/g, "_")
      );
      await setDoc(resortDocRef, {
        name: resortName,
        email: resortEmail,
        promocodes: csvData,
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
      <div>
        <label>
          Nahrať CSV súbor:
          <input type="file" accept=".csv" onChange={handleFileUpload} />
        </label>
      </div>
      <div>
        <label>
          Nahrať obrázok:
          <input type="file" accept="image/*" onChange={handleImageUpload} />
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
