import { useEffect, useState } from "react";
import "../AdminPage.css";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import AddSeasonData from "./AddSeasonData";
import AddResortData from "./AddResortData";
import AddCourseData from "./AddCourseData";
import AddPromocodes from "./AddPromocodes";
import ImageUpload from "./ImageUpload";

import LoadingAnimation, { LoaderState } from "./LoadingAnimation";
import { authReady } from "../services/FirebaseService";
import MonthlyReport from "./admin/MonthlyReport";
import { autoConfirmFrom, setAutoConfirm } from "../services/resorts";

interface Resort {
  id: string;
  name: string; // Resort name from Firestore
}

interface Course {
  id: string;
  name: string; // Course name from Firestore
}

interface Season {
  id: string; // Add an id for the document reference
  season: string; // This should match the structure in Firestore
  weeks: Array<any>; // This can be typed more specifically based on your data structure
}

interface PromoCode {
  id: string;
  code: string;
  Promo_name: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  secondName: string;
  tel_number: string;
  sportClub: string;
  ZSL_code: string;
  isAdmin: boolean;
  ownRacers: number; // Required field
}

interface Reservation {
  id: string;
  date: string;
  discipline: string;
  reservationDetails: {
    resort: string;
    course: string;
    courseName?: string;
  };
  availableRacers: number;
  user: {
    email: string;
    firstName: string;
    secondName: string;
    ownRacers: number;
    sportClub: string;
  };
  addedUsers?: User[];
}

function AdminPage() {
  const [firstName, setFirstName] = useState<string | null>(null);
  const [secondName, setSecondName] = useState<string | null>(null);
  const [resorts, setResorts] = useState<Resort[]>([]);
  const [selectedResort, setSelectedResort] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null); // State to hold the selected season
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0); // State for current week index
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [autoConfirm, setAutoConfirmState] = useState(true);
  const [savingAutoConfirm, setSavingAutoConfirm] = useState(false);
  const [users, setUsers] = useState<User[]>([]); // State to hold users
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const db = getFirestore();
  const lang = "sk";
  const [verifyLoadingState, setVerifyLoadingState] = useState(
    LoaderState.Loading
  );
  const [activeTab, setActiveTab] = useState<string>("resortData");

  // Retrieve the user's details from session storage when the component mounts
  useEffect(() => {
    const storedFirstName = localStorage.getItem("userFirstName");
    const storedSecondName = localStorage.getItem("userSecondName");
    setFirstName(storedFirstName);
    setSecondName(storedSecondName);
  }, []);

  const fetchResorts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "resorts"));
      const resortsData: Resort[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        resortsData.push({
          id: doc.id,
          name: data.name, // Assuming you have a "name"
        });
      });

      setResorts(resortsData);

      // Default to the first resort so the statistics tab has something to
      // report on without the admin picking from a dropdown first.
      setSelectedResort((current) => current ?? resortsData[0]?.id ?? null);
    } catch (error) {
      console.error("Chyba napájania kolekcie resorts: ", error);
    }
  };

  useEffect(() => {
    fetchResorts();
  }, [db]);

  const handleUpdate = async () => {
    try {
      const resortsSnapshot = await getDocs(collection(db, "resorts"));
      const resortsData: Resort[] = [];

      resortsSnapshot.forEach((doc) => {
        const data = doc.data();
        resortsData.push({
          id: doc.id,
          name: data.name, // Assuming you have a "name" field in the resort document
        });
      });

      // Optionally, update the state with fetched resorts
      setResorts(resortsData); // If you want to update the resorts state
    } catch (error) {
      console.error("Error fetching resorts: ", error);
    }
  };

  useEffect(() => {
    if (selectedResort) {
      const fetchCourses = async () => {
        try {
          const coursesSnapshot = await getDocs(
            collection(db, "resorts", selectedResort, "courses")
          );
          const coursesData: Course[] = [];
          coursesSnapshot.forEach((doc) => {
            const data = doc.data();
            coursesData.push({
              id: doc.id,
              name: data.name,
            });
          });
          setCourses(coursesData);
        } catch (error) {
          console.error("Chyba napájania kolekcie courses: ", error);
        }
      };
      fetchCourses();
    }
  }, [selectedResort, db]);

  // Fetch seasons when a course is selected
  useEffect(() => {
    if (selectedResort && selectedCourse) {
      const fetchSeasons = async () => {
        try {
          const seasonsSnapshot = await getDocs(
            collection(
              db,
              "resorts",
              selectedResort,
              "courses",
              selectedCourse,
              "seasons"
            )
          );
          const seasonsData: Season[] = [];
          seasonsSnapshot.forEach((doc) => {
            const data = doc.data();
            seasonsData.push({
              id: doc.id, // Document ID
              season: data.season,
              weeks: data.weeks,
            });
          });
          setSeasons(seasonsData);
        } catch (error) {
          console.error("Chyba napájania kolekcie seasons: ", error);
        }
      };
      fetchSeasons();
    }
  }, [selectedResort, selectedCourse, db]);

  // One read of the resort document for everything stored on it, rather than
  // one per setting.
  useEffect(() => {
    if (selectedResort) {
      const fetchResortSettings = async () => {
        try {
          const resortDoc = await getDoc(doc(db, "resorts", selectedResort));
          if (resortDoc.exists()) {
            const data = resortDoc.data();
            // A resort with no promo codes has no field at all, and mapping
            // over undefined threw before the rest of the settings could load.
            const promoCodesData = (data.promocodes ?? []).map(
              (promo: any, index: number) => ({
                id: index.toString(),
                code: promo.Code,
                Promo_name: promo.Promo_name,
              })
            );
            setPromoCodes(promoCodesData);
            setAutoConfirmState(autoConfirmFrom(data));
          } else {
            console.log("No such document!");
          }
        } catch (error) {
          console.error("Chyba napájania nastavení strediska: ", error);
        }
      };
      fetchResortSettings();
    }
  }, [selectedResort, db]);

  /**
   * Turns automatic confirmation on or off for this resort.
   *
   * On — the default — a booking counts as confirmed the moment it is made, so
   * nobody has to click anything. Off puts the club back in charge of saying it
   * is coming.
   */
  const handleAutoConfirmToggle = async (enabled: boolean) => {
    if (!selectedResort) return;
    const previous = autoConfirm;
    setAutoConfirmState(enabled);
    setSavingAutoConfirm(true);
    try {
      await setAutoConfirm(selectedResort, enabled);
    } catch (error) {
      console.error("Nastavenie sa nepodarilo uložiť: ", error);
      setAutoConfirmState(previous);
      alert("Nastavenie sa nepodarilo uložiť.");
    } finally {
      setSavingAutoConfirm(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const usersData: User[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        usersData.push({
          id: doc.id,
          email: data.email,
          firstName: data.firstName,
          secondName: data.secondName,
          tel_number: data.tel_number,
          sportClub: data.sportClub,
          ZSL_code: data.ZSL_code,
          isAdmin: data.isAdmin,
          ownRacers: data.ownRacers,
        });
      });
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users: ", error);
    }
  };

  useEffect(() => {
    // Listing users is admin-only, so the auth token has to be attached before
    // the query goes out — otherwise it is denied and the list renders empty.
    authReady.then(fetchUsers);
  }, [db]);

  /**
   * Loads the bookings the admin calendar shows.
   *
   * This used to read the entire `reservations` collection and then one
   * subcollection per booking — 705 documents and 705 sequential round trips.
   * It ran on mount, saturated the connection and starved every other read on
   * the page, which is why the resort list beside it came back empty.
   *
   * Now it reads a bounded window of `trainings`, where participants travel
   * inside the booking.
   */
  const fetchReservations = async () => {
    try {
      setVerifyLoadingState(LoaderState.Loading);

      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      const to = new Date();
      to.setMonth(to.getMonth() + 6);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      const snap = await getDocs(
        query(
          collection(db, "trainings"),
          where("date", ">=", iso(from)),
          where("date", "<=", iso(to))
        )
      );

      const reservationsData: Reservation[] = snap.docs.map((d) => {
        const t = d.data() as any;
        const participants = Object.values(t.participants ?? {}) as any[];
        const owner =
          participants.find((p) => p.role === "owner") ?? participants[0] ?? {};

        return {
          id: d.id,
          date: t.date,
          discipline: t.discipline,
          reservationDetails: {
            resort: t.resortId,
            course: t.courseId,
            courseName: t.courseName,
          },
          availableRacers: t.racersTotal,
          user: {
            email: owner.email,
            firstName: owner.firstName,
            secondName: owner.secondName,
            ownRacers: owner.racers,
            sportClub: owner.sportClub,
          },
          addedUsers: participants
            .filter((p) => p.role !== "owner")
            .map((p) => ({
              email: p.email,
              firstName: p.firstName,
              secondName: p.secondName,
              ownRacers: p.racers,
              sportClub: p.sportClub,
            })) as User[],
        };
      });

      setReservations(reservationsData);
    } catch (error) {
      console.error("Error fetching reservations: ", error);
    } finally {
      setVerifyLoadingState(LoaderState.Finished);
    }
  };


  useEffect(() => {
    fetchReservations();
  }, [db]);

  const handleDeletePromoCode = async (promoCodeId: string) => {
    if (!selectedResort) return;
    try {
      const resortDocRef = doc(db, "resorts", selectedResort);
      const resortDoc = await getDoc(resortDocRef);
      if (resortDoc.exists()) {
        const data = resortDoc.data();
        const updatedPromoCodes = data.promocodes.filter(
          (promo: any, index: number) => index.toString() !== promoCodeId
        );
        await updateDoc(resortDocRef, { promocodes: updatedPromoCodes });
        setPromoCodes((prevPromoCodes) =>
          prevPromoCodes.filter((promoCode) => promoCode.id !== promoCodeId)
        );
      }
    } catch (error) {
      console.error("Error deleting promo code: ", error);
    }
  };

  const handleNextWeek = () => {
    setCurrentWeekIndex((prevIndex) => prevIndex + 1);
  };

  const handlePreviousWeek = () => {
    setCurrentWeekIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  };

  const handleDeleteResort = async (resortId: string) => {
    try {
      await deleteDoc(doc(db, "resorts", resortId));
      setResorts((prevResorts) =>
        prevResorts.filter((resort) => resort.id !== resortId)
      );
      setSelectedResort(null);
      setSelectedCourse(null);
      setSelectedSeason(null);
      setPromoCodes([]);
    } catch (error) {
      console.error("Error deleting resort: ", error);
    }
  };

  // Delete course from Firestore
  const handleDeleteCourse = async (courseId: string) => {
    if (!selectedResort) return;
    try {
      await deleteDoc(doc(db, "resorts", selectedResort, "courses", courseId));
      setCourses((prevCourses) =>
        prevCourses.filter((course) => course.id !== courseId)
      );
      setSelectedCourse(null);
      setSelectedSeason(null);
    } catch (error) {
      console.error("Error deleting course: ", error);
    }
  };

  // Delete season from Firestore
  const handleDeleteSeason = async (seasonId: string) => {
    if (!selectedResort || !selectedCourse) return;
    try {
      await deleteDoc(
        doc(
          db,
          "resorts",
          selectedResort,
          "courses",
          selectedCourse,
          "seasons",
          seasonId
        )
      );
      setSeasons((prevSeasons) =>
        prevSeasons.filter((season) => season.id !== seasonId)
      );
      setSelectedSeason(null);
    } catch (error) {
      console.error("Error deleting season: ", error);
    }
  };

  return (
    <>
      <div className="AppBody">
        <div className="AppBody-header">
          <p>VITAJ, ADMINISTRÁTOR</p>{" "}
          <p className="info-text">
            Personalizuj si kalendár svojho strediska, nahraj logo svojho
            strediska či vytvor promokódy. Taktiež môžeš pozrieť kalendár so
            štatistikou všetkých svojích rezervácii.{" "}
          </p>
        </div>

        <div className="admin-tabs-menu">
          <button
            className={`creation-tabs-button ${
              activeTab === "resortData" ? "active" : ""
            }`}
            onClick={() => setActiveTab("resortData")}
          >
            Tvorba strediska
          </button>
          <button
            className={`stats-tabs-button ${
              activeTab === "usersCalendar" ? "active" : ""
            }`}
            onClick={() => setActiveTab("usersCalendar")}
          >
            Štatistiky strediska
          </button>
        </div>
        {activeTab === "resortData" && (
          <>
            <div className="creationTab">
              <div className="resortSetupContainer">
                <div className="addResortData">
                  <AddResortData onUpdate={handleUpdate} />
                </div>
                <div className="AddCourseData">
                  <AddCourseData onUpdate={handleUpdate} />
                </div>
                <div className="AddSeasonData">
                  <AddSeasonData />
                </div>
              </div>

              <div className="add-content-container">
                <h2 className="form-heading">
                  Pridajte logo strediska, prípadne promokódy
                </h2>
                <div className="form-group">
                  <label className="form-label-content">
                    Vyberte si stredisko:
                    <select
                      id="settings-resort"
                      value={selectedResort || ""}
                      onChange={(e) => {
                        setSelectedResort(e.target.value);
                        setPromoCodes([]); // Reset promo codes when resort changes
                      }}
                    >
                      <option value="">Vyberte stredisko</option>
                      {resorts.map((resort) => (
                        <option key={resort.id} value={resort.id}>
                          {resort.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label-content" htmlFor="auto-confirm">
                    <input
                      id="auto-confirm"
                      type="checkbox"
                      checked={autoConfirm}
                      disabled={!selectedResort || savingAutoConfirm}
                      onChange={(e) => handleAutoConfirmToggle(e.target.checked)}
                    />{" "}
                    Automaticky potvrdzovať rezervácie
                  </label>
                  <p className="form-hint">
                    {autoConfirm
                      ? "Rezervácia je potvrdená hneď po vytvorení. Kluby nemusia nič potvrdzovať."
                      : "Každý klub si musí účasť na tréningu potvrdiť sám."}
                  </p>
                </div>

                <div className="Image-promos-subcont">
                  <AddPromocodes
                    selectedResort={selectedResort}
                    onUpdate={handleUpdate}
                  />

                  <ImageUpload
                    selectedResort={selectedResort}
                    onImageUpload={handleUpdate}
                  />
                </div>
              </div>
            </div>
          </>
        )}
        {activeTab === "usersCalendar" && (
          <>
            <div className="statisticsTab">
              <MonthlyReport resortId={selectedResort ?? undefined} />
              <div className="siteUsers">
                <h4>Všetci požívatelia</h4>
                {users.length > 0 ? (
                  <div className="users-list">
                    <ul>
                      {users.map((user) => (
                        <li key={user.id}>
                          {user.firstName} {user.secondName} ({user.email}) (
                          {user.tel_number}) ({user.sportClub}) (
                          {user.ZSL_code ? user.ZSL_code : "nezadaný ZSL kód"})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>Žiadni užívatelia</p>
                )}
              </div>

              <div className="all-reservations">
                <h4 className="all-reservations-heading">Moje rezervácie</h4>
                <div className="block">
                  <div className="dokument-managment">
                    <h4>Výber kalendára</h4>
                    <label className="form-label">Vyberte si stredisko:</label>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <select
                        className="reservations-form-select"
                        value={selectedResort || ""}
                        onChange={(e) => {
                          setSelectedResort(e.target.value);
                          setSelectedCourse(null);
                          setSelectedSeason(null);
                        }}
                      >
                        <option value="">Vyberte stredisko</option>
                        {resorts.map((resort) => (
                          <option key={resort.id} value={resort.id}>
                            {resort.name}
                          </option>
                        ))}
                      </select>
                      {selectedResort && (
                        <button
                          className="cancel-button"
                          onClick={() => handleDeleteResort(selectedResort)}
                          style={{ marginLeft: "10px" }}
                        >
                          Zrušiť
                        </button>
                      )}
                    </div>

                    {selectedResort && (
                      <div>
                        <label className="form-label">Vyberte si trať:</label>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <select
                            className="reservations-form-select"
                            value={selectedCourse || ""}
                            onChange={(e) => {
                              setSelectedCourse(e.target.value);
                              setSelectedSeason(null); // Reset selected season when course changes
                            }}
                          >
                            <option value="">Vyberte trať</option>
                            {courses.map((course) => (
                              <option key={course.id} value={course.id}>
                                {course.name}
                              </option>
                            ))}
                          </select>
                          {selectedCourse && (
                            <button
                              className="cancel-button"
                              onClick={() => handleDeleteCourse(selectedCourse)}
                              style={{ marginLeft: "10px" }}
                            >
                              Zrušiť
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedCourse && (
                      <div>
                        <label className="form-label">Vyberte si sezónu:</label>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <select
                            className="reservations-form-select"
                            value={selectedSeason || ""}
                            onChange={(e) => setSelectedSeason(e.target.value)}
                          >
                            <option value="">Select Season</option>
                            {seasons.map((season) => (
                              <option key={season.id} value={season.id}>
                                {season.season}
                              </option>
                            ))}
                          </select>
                          {selectedSeason && (
                            <button
                              className="cancel-button"
                              onClick={() => handleDeleteSeason(selectedSeason)}
                              style={{ marginLeft: "10px" }}
                            >
                              Zrušiť
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedSeason && (
                    <div className="seasons-container">
                      {seasons
                        .filter((season) => season.id === selectedSeason)
                        .map((season) => (
                          <div key={season.id} className="season">
                            {/* <h3>{season.season}</h3> */}
                            <div className="week-navigation2">
                              <button
                                onClick={handlePreviousWeek}
                                disabled={currentWeekIndex === 0}
                              >
                                &#8592; {/* Left Arrow */}
                              </button>
                              <h4>
                                Týždeň sezóny {currentWeekIndex + 1}. z{" "}
                                {season.weeks.length}
                              </h4>
                              <button
                                onClick={handleNextWeek}
                                disabled={
                                  currentWeekIndex >= season.weeks.length - 1
                                }
                              >
                                &#8594; {/* Right Arrow */}
                              </button>
                            </div>
                            {verifyLoadingState === LoaderState.Loading ? (
                              <div className="loading-animation-container">
                                <LoadingAnimation state={verifyLoadingState} />
                              </div>
                            ) : (
                              season.weeks.length > 0 && (
                                <div className="calendar-week2">
                                  {season.weeks[currentWeekIndex].days.map(
                                    (day: any) => (
                                      <div
                                        key={day.date}
                                        className="calendar-day2"
                                      >
                                        <div className="day2">{`${day.dayOfWeek[lang]}, ${day.date}`}</div>

                                        {reservations
                                          .filter(
                                            (reservation) =>
                                              reservation.date === day.date &&
                                              reservation.reservationDetails
                                                .resort === selectedResort &&
                                              reservation.reservationDetails
                                                .course === selectedCourse
                                          )
                                          .map((reservation) => (
                                            <div
                                              key={reservation.id}
                                              className="reservation2"
                                            >
                                              <br></br>
                                              <p>
                                                <b>{reservation.discipline}</b>
                                              </p>
                                              <p>
                                                {reservation.user.sportClub}{" "}
                                                <b>
                                                  {reservation.user.ownRacers}
                                                </b>
                                              </p>
                                              <hr></hr>
                                              {reservation.addedUsers &&
                                                reservation.addedUsers.map(
                                                  (user) => (
                                                    <div key={user.email}>
                                                      <p>
                                                        {user.sportClub}{" "}
                                                        <b>{user.ownRacers}</b>
                                                        <hr></hr>
                                                      </p>
                                                    </div>
                                                  )
                                                )}
                                            </div>
                                          ))}
                                      </div>
                                    )
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default AdminPage;
