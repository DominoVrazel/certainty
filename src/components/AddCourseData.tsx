import React, { useEffect, useState } from "react";
import { collection, doc, setDoc, getDocs } from "firebase/firestore";
import { db } from "../services/FirebaseService"; // Ensure this path is correct
import "../AddCourseData.css";

interface Resort {
  id: string;
  name: string;
}

interface TimeSession {
  startTime: string;
  endTime: string;
}

interface AddCourseDataProps {
  onUpdate: () => Promise<void>;
}

const AddCourseData: React.FC<AddCourseDataProps> = ({ onUpdate }) => {
  const [resorts, setResorts] = useState<Resort[]>([]); // List of resorts fetched from Firestore
  const [selectedResort, setSelectedResort] = useState<Resort | null>(null); // Resort selected from dropdown
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
        const resortList = resortSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || doc.id, // Get the 'name' field or fallback to the ID
        }));
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
      const resortDocRef = doc(collection(db, "resorts"), selectedResort.id);
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
        `Trať "${courseName}" je pridaná do strediska "${selectedResort?.name}" úspešne!`
      );
    } catch (err) {
      console.error("Chyba pri pridávaní trate: ", err);
      setError("Chyba pri pridávaní trate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-course-form">
      <h2 className="form-heading">Pridajte traťové informácie</h2>
      <div className="form-group">
        <label className="form-label">
          Vyberte si stredisko:
          <select
            value={selectedResort?.id || ""}
            onChange={(e) =>
              setSelectedResort(
                resorts.find((resort) => resort.id === e.target.value) || null
              )
            }
            disabled={loading}
          >
            <option value="">-- Vyberte si stredisko --</option>
            {resorts.map((resort) => (
              <option key={resort.id} value={resort.id}>
                {resort.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Course Name Input */}
      <div className="form-group">
        <label className="form-label">
          Názov tréningovej trate:
          <input
            type="text"
            className="form-string-input"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            disabled={loading}
            placeholder="Zadajte názov"
          />
        </label>
      </div>

      {/* Course Capacity Input */}
      <div className="form-number-group">
        <label className="form-label">
          Traťová kapacita:
          <span className="info-icon">
            <i className="fas fa-info-circle"></i>
            <span className="tooltip-text">
              Maximum postavených slalomov v jeden čas.
            </span>
          </span>
        </label>
        <div className="number-input-container">
          <button
            className="number-btn"
            onClick={() => setCourseCapacity((prev) => Math.max(1, prev - 1))}
            disabled={loading}
          >
            -
          </button>
          <input
            type="number"
            className="form-number-input"
            value={courseCapacity}
            onChange={(e) => setCourseCapacity(Number(e.target.value))}
            min="1"
            disabled={loading}
          />
          <button
            className="number-btn"
            onClick={() => setCourseCapacity((prev) => prev + 1)}
            disabled={loading}
          >
            +
          </button>
        </div>
      </div>

      <div className="form-number-group">
        <label className="form-label">
          Kapacita tréningu:
          <span className="info-icon">
            <i className="fas fa-info-circle"></i>
            <span className="tooltip-text">
              Maximum pretekárov na jednej trati.
            </span>
          </span>
        </label>

        <div className="number-input-container">
          <button
            className="number-btn"
            onClick={() =>
              setIndividualLineCapacity((prev) => Math.max(1, prev - 1))
            }
            disabled={loading}
          >
            -
          </button>
          <input
            type="number"
            className="form-number-input"
            value={individualLineCapacity}
            onChange={(e) => setIndividualLineCapacity(Number(e.target.value))}
            min="1"
            disabled={loading}
          />
          <button
            className="number-btn"
            onClick={() => setIndividualLineCapacity((prev) => prev + 1)}
            disabled={loading}
          >
            +
          </button>
        </div>
      </div>

      {/* Time Sessions Input */}
      <div className="form-group">
        <label className="form-label">Dostupné tréningové časy:</label>
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
        <button
          className="training-times-button"
          type="button"
          onClick={addNewSessionField}
          disabled={loading}
        >
          Pridať tréningový čas
        </button>
      </div>

      {/* Add Course Button */}
      <button
        className="btn btn-primary"
        onClick={addCourseToDatabase}
        disabled={loading}
      >
        {loading ? "Pridávam..." : "Pridať trať"}
      </button>

      {/* Error Display */}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default AddCourseData;
