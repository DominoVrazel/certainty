import React, { useEffect, useState } from "react";
import { collection, doc, setDoc, getDocs } from "firebase/firestore";
import { db } from "../services/FirebaseService"; // Ensure this path is correct
import "../AddCourseData.css";

interface TimeSession {
  startTime: string;
  endTime: string;
}

interface AddCourseDataProps {
  onUpdate: () => Promise<void>;
}

const AddCourseData: React.FC<AddCourseDataProps> = ({ onUpdate }) => {
  const [resorts, setResorts] = useState<string[]>([]); // List of resorts fetched from Firestore
  const [selectedResort, setSelectedResort] = useState<string>(""); // Resort selected from dropdown
  const [courseName, setCourseName] = useState<string>(""); // New course name input by user
  const [courseCapacity, setCourseCapacity] = useState<number>(0); // New state for course capacity
  const [individualLineCapacity, setIndividualLineCapacity] =
    useState<number>(0); // New state for individual line capacity
  const [timeSessions, setTimeSessions] = useState<TimeSession[]>([
    { startTime: "", endTime: "" },
  ]); // State for time sessions
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch resorts from Firestore on component mount
  useEffect(() => {
    const fetchResorts = async () => {
      try {
        const resortCollectionRef = collection(db, "resorts");
        const resortSnapshot = await getDocs(resortCollectionRef);
        const resortList = resortSnapshot.docs.map((doc) => doc.id); // Get resort document IDs (names)
        setResorts(resortList); // Set the resorts in state
      } catch (err) {
        console.error("Chyba napájania kolekcie resorts: ", err);
        setError("Chyba napájania kolekcie resorts");
      }
    };

    fetchResorts();
  }, []);

  const handleSessionChange = (
    index: number,
    key: "startTime" | "endTime",
    value: string
  ) => {
    const updatedSessions = [...timeSessions];
    updatedSessions[index] = { ...updatedSessions[index], [key]: value };
    setTimeSessions(updatedSessions);
  };

  const addNewSessionField = () => {
    setTimeSessions([...timeSessions, { startTime: "", endTime: "" }]);
  };

  const removeSessionField = (index: number) => {
    const updatedSessions = timeSessions.filter((_, i) => i !== index);
    setTimeSessions(updatedSessions);
  };

  const addCourseToDatabase = async () => {
    setLoading(true);
    setError(null);

    // Validate that both resort and course name are provided
    if (!selectedResort || !courseName || courseCapacity <= 0) {
      alert(
        "Prosím vyberte si stredisko a zadajte názov novej tréningovej trate s jej kapacitou."
      );
      setLoading(false);
      return;
    }

    if (individualLineCapacity <= 0) {
      alert("Prosím zadajte kapacitu pretekárov tréningovej jednotky.");
      setLoading(false);
      return;
    }

    for (let session of timeSessions) {
      if (!session.startTime || !session.endTime) {
        alert("Prosím zadajte začiatok a koniec tréningovej jednotky.");
        setLoading(false);
        return;
      }
      if (session.startTime >= session.endTime) {
        alert("Začiatok musí byť pred koncom tréningovej jednotky.");
        setLoading(false);
        return;
      }
    }

    try {
      // Reference to the selected resort's courses subcollection
      const resortDocRef = doc(collection(db, "resorts"), selectedResort);
      const courseDocRef = doc(
        collection(resortDocRef, "courses"),
        courseName.replace(/[^a-zA-Z0-9]/g, "_")
      );

      // Add the course to Firestore
      await setDoc(courseDocRef, {
        name: courseName,
        capacity: courseCapacity,
        individualLineCapacity,
        timeSessions: timeSessions.filter(
          (session) => session.startTime && session.endTime
        ), // Store valid sessions
      });
      onUpdate();
      alert(
        `Trať "${courseName}" je pridaná do strediska "${selectedResort}" úspešne!`
      );
    } catch (err) {
      console.error("Chyba pri pridávaní trate: ", err);
      setError("Chyba pri pridávaní trate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Pridajte traťové informácie</h2>

      {/* Resort Selection Dropdown */}
      <div>
        <label>
          Vyberte si stredisko:
          <select
            value={selectedResort}
            onChange={(e) => setSelectedResort(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Vyberte si stredisko --</option>
            {resorts.map((resort) => (
              <option key={resort} value={resort}>
                {resort}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Course Name Input */}
      <div>
        <label>
          Názov tréningovej trate:
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            disabled={loading}
          />
        </label>
      </div>

      {/* Course Capacity Input */}
      <div>
        <label>
          Traťová kapacita:
          <span className="info-icon">
            ⓘ
            <span className="tooltip-text">
              Maximum postavených slalomov v jeden čas.
            </span>
          </span>
          <input
            type="number"
            value={courseCapacity}
            onChange={(e) => setCourseCapacity(Number(e.target.value))}
            min="1"
            disabled={loading}
          />
        </label>
      </div>

      <div>
        <label>
          Kapacita tréningu:
          <span className="info-icon">
            ⓘ
            <span className="tooltip-text">
              Maximum pretekárov na jednej trati.
            </span>
          </span>
          <input
            type="number"
            value={individualLineCapacity}
            onChange={(e) => setIndividualLineCapacity(Number(e.target.value))}
            min="1"
            disabled={loading}
          />
        </label>
      </div>

      {/* Time Sessions Input */}
      <div>
        <label>Dostupné tréningové časy:</label>
        {timeSessions.map((session, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center" }}>
            <span>od:</span>
            <input
              type="time"
              value={session.startTime}
              onChange={(e) =>
                handleSessionChange(index, "startTime", e.target.value)
              }
              disabled={loading}
            />
            <span>do:</span>
            <input
              type="time"
              value={session.endTime}
              onChange={(e) =>
                handleSessionChange(index, "endTime", e.target.value)
              }
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => removeSessionField(index)}
              disabled={timeSessions.length <= 1 || loading}
            >
              Zmazať
            </button>
          </div>
        ))}
        <button type="button" onClick={addNewSessionField} disabled={loading}>
          Pridať tréningový čas
        </button>
      </div>

      {/* Add Course Button */}
      <button onClick={addCourseToDatabase} disabled={loading}>
        {loading ? "Pridávam..." : "Pridať trať"}
      </button>

      {/* Error Display */}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default AddCourseData;
