import React, { useState, useEffect } from "react";
import { collection, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { rangesOverlap } from "../services/seasons";
import { db } from "../services/FirebaseService"; // Ensure this path is correct
import { format, addDays, eachDayOfInterval } from "date-fns";

const dayNames = {
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  sk: ["Nedeľa", "Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota"],
};

interface Resort {
  id: string;
  name: string;
}
interface Course {
  id: string;
  name: string;
}
interface ExistingSeason {
  id: string;
  season: string;
  startDate: string;
  endDate: string;
}

/** The document id a season name maps to. Historic scheme, kept as it is. */
const seasonDocId = (name: string) => name.replace(/[^a-zA-Z0-9]/g, "_");

const AddSeasonData: React.FC = () => {
  const [resorts, setResorts] = useState<Resort[]>([]);
  const [selectedResort, setSelectedResort] = useState<string>("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [seasonName, setSeasonName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What this slope already has, so a clash can be shown rather than saved. */
  const [existing, setExisting] = useState<ExistingSeason[]>([]);

  useEffect(() => {
    const fetchResorts = async () => {
      try {
        const resortCollectionRef = collection(db, "resorts");
        const resortSnapshot = await getDocs(resortCollectionRef);
        const resortList = resortSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || doc.id, // Fallback to id if name field is missing
        }));
        setResorts(resortList); // Set the resorts in state
      } catch (err) {
        console.error("Chyba napájania kolekcie resorts: ", err);
        setError("Chyba napájania kolekcie resorts.");
      }
    };
    fetchResorts();
  }, []);

  useEffect(() => {
    const fetchCourses = async () => {
      if (!selectedResort) return;

      try {
        const resortDocRef = collection(
          db,
          "resorts",
          selectedResort,
          "courses"
        );
        const coursesSnapshot = await getDocs(resortDocRef);
        const courseList = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || doc.id, // Fallback to id if name field is missing
        }));
        setCourses(courseList); // Set the courses in state
      } catch (err) {
        console.error("Chyba napájania kolekcie courses: ", err);
        setError("Chyba napájania kolekcie courses.");
      }
    };
    fetchCourses();
  }, [selectedResort]);

  // The seasons this slope already has. Loaded as soon as there is a slope,
  // because they are what the new one must not clash with — and because an
  // admin who can see them is unlikely to try.
  useEffect(() => {
    const fetchExisting = async () => {
      if (!selectedResort || !selectedCourse) {
        setExisting([]);
        return;
      }
      try {
        const snapshot = await getDocs(
          collection(
            db,
            "resorts",
            selectedResort,
            "courses",
            selectedCourse,
            "seasons"
          )
        );
        setExisting(
          snapshot.docs
            .map((d) => ({
              id: d.id,
              season: d.data().season ?? d.id,
              startDate: d.data().startDate ?? "",
              endDate: d.data().endDate ?? "",
            }))
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
        );
      } catch (err) {
        console.error("Chyba napájania sezón: ", err);
        setError("Existujúce sezóny sa nepodarilo načítať.");
      }
    };
    fetchExisting();
  }, [selectedResort, selectedCourse]);

  /**
   * Why this season cannot be saved, or null when it can.
   *
   * Overlapping calendars are not a cosmetic problem: the page picks which
   * season to show by date, so two covering the same day would both be
   * rendered, one under the other.
   */
  const clash = (): string | null => {
    if (!seasonName.trim() || !startDate || !endDate) {
      return "Vyplňte názov sezóny aj oba dátumy.";
    }
    if (endDate < startDate) {
      return "Koniec sezóny je pred jej začiatkom.";
    }
    const overlapping = existing.find(
      (e) =>
        !!e.startDate &&
        !!e.endDate &&
        rangesOverlap({ startDate, endDate }, e)
    );
    if (overlapping) {
      return (
        `Prekrýva sa so sezónou „${overlapping.season}“ ` +
        `(${overlapping.startDate} – ${overlapping.endDate}). ` +
        `Zmeňte dátumy, alebo najprv zmažte tú existujúcu.`
      );
    }
    // The id is the name with everything non-alphanumeric replaced, so two
    // different names can land on the same id — and `setDoc` would then
    // silently overwrite a season that does not overlap and was never shown
    // as a clash.
    if (existing.some((e) => e.id === seasonDocId(seasonName))) {
      return "Sezóna s takým názvom už na tejto zjazdovke existuje.";
    }
    return null;
  };

  const generateSeasonData = () => {

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate the first Monday before or on the start date
    const firstMonday =
      start.getDay() === 0
        ? addDays(start, 1)
        : addDays(start, -((start.getDay() + 6) % 7));

    // Generate weeks from start to end
    const weeks = [];
    let currentStart = firstMonday;

    while (currentStart <= end) {
      // Calculate end of this week
      const weekEnd = addDays(currentStart, 6);

      // If weekEnd exceeds end date, cap it at end date for incomplete weeks
      const actualWeekEnd = weekEnd > end ? end : weekEnd;

      // Collect days for the current week, whether complete or incomplete
      const days = eachDayOfInterval({
        start: currentStart,
        end: actualWeekEnd, // End on the last date if incomplete week
      }).map((currentDay) => {
        const dayIndex = currentDay.getDay();
        return {
          date: format(currentDay, "yyyy-MM-dd"),
          dayOfWeek: {
            en: dayNames.en[dayIndex],
            sk: dayNames.sk[dayIndex],
          },
        };
      });

      // Add the week to the list
      weeks.push({
        startOfWeek: format(currentStart, "yyyy-MM-dd"),
        endOfWeek: format(actualWeekEnd, "yyyy-MM-dd"),
        days,
      });

      // Move to the start of the next week
      currentStart = addDays(currentStart, 7);
    }

    return {
      season: seasonName,
      startDate,
      endDate,
      weeks,
    };
  };

  const addSeasonToDatabase = async () => {
    setError(null);

    if (!selectedResort || !selectedCourse) {
      setError("Vyberte stredisko aj zjazdovku.");
      return;
    }

    const problem = clash();
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    const seasonData = generateSeasonData();
    if (!seasonData) {
      // Used to return with `loading` still true, leaving the form stuck.
      setLoading(false);
      return;
    }

    try {
      const seasonDocRef = doc(
        db,
        "resorts",
        selectedResort,
        "courses",
        selectedCourse,
        "seasons",
        seasonDocId(seasonName)
      );

      // Checked again against the database, not just against what this form
      // loaded: two admins could be adding a season at the same time, and
      // `setDoc` overwrites without complaint.
      if ((await getDoc(seasonDocRef)).exists()) {
        setError("Sezóna s takým názvom už na tejto zjazdovke existuje.");
        return;
      }

      await setDoc(seasonDocRef, seasonData);
      setExisting((prev) =>
        [...prev, { id: seasonDocRef.id, season: seasonName, startDate, endDate }]
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
      );
      setSeasonName("");
      setStartDate("");
      setEndDate("");
      alert("Kalendár úspešne pridaný!");
    } catch (err) {
      console.error("Chyba pri pridávaní kalendáru: ", err);
      setError("Chyba pri pridávaní kalendáru.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-season-form">
      <h2 className="form-heading">Pridať sezónny kalendár</h2>
      <div className="form-group">
        <label className="form-label">
          Vybrať stredisko:
          <select
            value={selectedResort}
            onChange={(e) => setSelectedResort(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Vybrať stredisko --</option>
            {resorts.map((resort) => (
              <option key={resort.id} value={resort.id}>
                {resort.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedResort && (
        <div className="form-group">
          <label className="form-label">
            Vybrať tréningovú zjazdovku:
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Vybrať zjazdovku --</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* What the slope already has. Shown before the dates are typed, so a
          clash is apparent rather than something the save has to refuse. */}
      {selectedResort && selectedCourse && (
        <div className="form-group existing-seasons" data-testid="existing-seasons">
          <span className="form-label">Existujúce sezónne kalendáre:</span>
          {existing.length === 0 ? (
            <p className="form-hint">
              Na tejto zjazdovke ešte žiadny nie je.
            </p>
          ) : (
            <ul className="existing-seasons-list">
              {existing.map((e) => (
                <li key={e.id}>
                  <b>{e.season}</b>
                  {e.startDate && e.endDate
                    ? ` — ${e.startDate} až ${e.endDate}`
                    : " — bez dátumov"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">
          Názov nového sezónneho kalendára:
          <span className="info-icon">
            <i className="fas fa-info-circle"></i>
            <span className="tooltip-text">
              Musí obsahovať v názve rok sezóny v tvare 2024/2025, príklad:
              sezóna 2024/2025.
            </span>
          </span>
          <input
            type="text"
            className="form-string-input"
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            disabled={loading}
            placeholder="Zadajte názov"
          />
        </label>
      </div>
      <div className="form-group">
        <label className="form-label">
          Začiatok sezóny:
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
      </div>
      <div className="form-group">
        <label className="form-label">
          Koniec sezóny:
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn btn-primary"
        onClick={addSeasonToDatabase}
        disabled={loading}
      >
        {loading ? "Pridávam..." : "Pridať kalendár"}
      </button>
      {error && (
        <p className="form-error" data-testid="season-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default AddSeasonData;
