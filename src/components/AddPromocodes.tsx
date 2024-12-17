import React, { useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../services/FirebaseService"; // Ensure this path is correct

interface AddPromoCodesProps {
  selectedResort: string | null;
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

const AddPromocodes: React.FC<AddPromoCodesProps> = ({
  selectedResort,
  onUpdate,
}) => {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
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

  const handleAddPromoCodes = async () => {
    if (!selectedResort || !csvFile) {
      alert("Prosím vyberte stredisko a nahrajte CSV súbor.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resortDocRef = doc(db, "resorts", selectedResort);
      const resortDoc = await getDoc(resortDocRef);
      if (resortDoc.exists()) {
        const data = resortDoc.data();
        const existingPromoCodes = data.promocodes || [];
        const updatedPromoCodes = [...existingPromoCodes, ...csvData];
        await updateDoc(resortDocRef, { promocodes: updatedPromoCodes });
        alert("Promo kódy úspešne pridané!");
        onUpdate();
      } else {
        alert("Stredisko neexistuje.");
      }
    } catch (err) {
      console.error("Chyba pri pridávaní promo kódov: ", err);
      setError("Chyba pri pridávaní promo kódov.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-promocodes-container">
      <h3>Pridať Promo Kódy</h3>
      <div>
        <label>
          Nahrať CSV súbor:
          <input type="file" accept=".csv" onChange={handleFileUpload} />
        </label>
      </div>
      <button onClick={handleAddPromoCodes} disabled={loading}>
        {loading ? "Pridávam..." : "Pridať Promo Kódy"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default AddPromocodes;
