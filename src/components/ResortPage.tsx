import React, { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  where,
  query,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { format, addDays, set } from "date-fns";
import { getApp } from "firebase/app";
import {
  httpsCallable,
  getFunctions,
  connectFunctionsEmulator,
} from "firebase/functions";

import ReservationModal from "./ReservationModal";
import EditReservationModal from "./EditReservationModal";
import ReservationDetailsModal from "./ReservationDetailsModal";
import AddToTrainingModal from "./AddToTrainigModal";
import CloseTrackModal from "./CloseTrackModal";
import ShowInfoModal from "./ShowInfoModal";
import { fetchPromoCodes, deletePromoCodes } from "./getPromoCodes";

import LoadingAnimation, { LoaderState } from "./LoadingAnimation";

import "../Modal.css";
import "../ResortPage.css";
import "../Calendar.css";

interface ResortPageProps {
  resortId: string;
  isLoggedIn: boolean;
}

interface Day {
  dayOfWeek: Record<string, string>;
  date: string;
  training?: string;
  timeSessions?: { startTime: string; endTime: string }[];
}

interface Week {
  startDate: string;
  endDate: string;
  days: Day[];
  season: string;
}

interface Season {
  id: string;
  season: string;
  weeks: Week[];
}

interface User {
  email: string;
  firstName: string;
  secondName: string;
  sportClub?: string; // Optional field
  ownRacers: number; // Required field
}

interface ReservationDetails {
  createdAt: string;
  date: string;
  discipline: string;
  category: string;
  tickets: number;
  lineNumber: number;
  availableRacers: number;
  status: string;
  user: User;
  id: string;
  session: { startTime: string; endTime: string };
  addedUsers?: User[]; // Add the addedUsers property
  // Include any other fields you expect in your reservation details
}

const app = getApp();
console.log("App: ", app);
const functions = getFunctions(app);

if (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

const ResortPage: React.FC<ResortPageProps> = ({ resortId, isLoggedIn }) => {
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [seasons, setSeasons] = useState<Record<string, Season[]>>({});
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [currentDates, setCurrentDates] = useState<Record<string, Date>>({});
  const [courseCapacities, setCourseCapacities] = useState<
    Record<string, number>
  >({});
  const [individualLineCapacities, setIndividualLineCapacities] = useState<
    Record<string, number>
  >({});
  const [weekOffset, setWeekOffset] = useState<Record<string, number>>({});
  const db = getFirestore();
  const lang = "sk";
  const [reservationStatus, setReservationStatus] = useState<
    "vytvorená" | "prijata" | "zrusena"
  >("vytvorená"); // NEW: Reservation status state

  const [selectedSession, setSelectedSession] = useState<{
    date: string;
    session: { startTime: string; endTime: string };
    course: string; // Include course in selectedSession
    lineNumber: number;
    existingDetails?: any;
  } | null>(null);

  const [reservationExists, setReservationExists] = useState<
    Record<string, ReservationDetails | null>
  >({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); // State to control edit modal
  const [editReservationDetails, setEditReservationDetails] =
    useState<ReservationDetails | null>(null); // State for the reservation being edited
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsReservation, setDetailsReservation] =
    useState<ReservationDetails | null>(null);
  const [isAddToTrainingModalOpen, setIsAddToTrainingModalOpen] =
    useState(false);
  const [addToTrainingSession, setAddToTrainingSession] = useState<{
    date: string;
    session: { startTime: string; endTime: string };
    course: string;
    lineNumber: number;
    sportClub: string;
  } | null>(null);

  const [dropdownVisible, setDropdownVisible] = useState<
    Record<string, boolean>
  >({});
  const [closedTracks, setClosedTracks] = useState<
    Record<string, { reason: string }>
  >({});
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeTrackDetails, setCloseTrackDetails] = useState<{
    course: string;
    lineNumber: number;
    date: string;
  } | null>(null);

  const [isShowInfoModalOpen, setisShowInfoModalOpen] = useState(false);
  const handleInfoClick = () => {
    setisShowInfoModalOpen(true);
  };
  const isAdmin = localStorage.getItem("userAdmin") === "true";

  const [resortEmail, setResortEmail] = useState<string | null>(null);
  const [verifyLoadingState, setVerifyLoadingState] = useState(
    LoaderState.Loading
  );

  const [isReservationConfirmed, setIsReservationConfirmed] = useState(false); // NEW: State for reservation confirmation

  useEffect(() => {
    const fetchCoursesAndSeasons = async () => {
      try {
        const coursesSnapshot = await getDocs(
          collection(db, "resorts", resortId, "courses")
        );
        const fetchedCourses: { id: string; name: string }[] = [];
        const fetchedSeasons: Record<string, Season[]> = {};
        const courseCapacities: Record<string, number> = {};
        const individualLineCapacities: Record<string, number> = {}; // New state for individual line capacities

        for (const doc of coursesSnapshot.docs) {
          const courseName = doc.id;
          const courseData = doc.data();
          fetchedCourses.push({ id: courseName, name: courseData.name });
          courseCapacities[courseName] = courseData.capacity;
          individualLineCapacities[courseName] =
            courseData.individualLineCapacity;

          const seasonsSnapshot = await getDocs(
            collection(
              db,
              "resorts",
              resortId,
              "courses",
              courseName,
              "seasons"
            )
          );
          const filteredSeasons: Season[] = [];
          const currentSeason = getCurrentSeason();

          seasonsSnapshot.forEach((seasonDoc) => {
            const data = seasonDoc.data();
            if (data.season.includes(currentSeason)) {
              filteredSeasons.push({
                id: seasonDoc.id,
                season: data.season,
                weeks: data.weeks.map((week: Week) => ({
                  ...week,
                  days: week.days.map((day: Day) => ({
                    ...day,
                    timeSessions: courseData.timeSessions || [],
                  })),
                })),
              });
            }
          });

          if (filteredSeasons.length > 0) {
            fetchedSeasons[courseName] = filteredSeasons;
          }
        }

        setCourses(fetchedCourses);
        setSeasons(fetchedSeasons);
        setCourseCapacities(courseCapacities);
        setIndividualLineCapacities(individualLineCapacities);

        if (fetchedCourses.length > 0) {
          setSelectedCourse(fetchedCourses[0].id);
        }
      } catch (error) {
        console.error("Error fetching data: ", error);
      }
    };

    const fetchResortEmail = async () => {
      try {
        const resortDoc = await getDoc(doc(db, "resorts", resortId));
        if (resortDoc.exists()) {
          const resortData = resortDoc.data();
          setResortEmail(resortData.email);
        } else {
          console.error("Resort document does not exist.");
        }
      } catch (error) {
        console.error("Error fetching resort email: ", error);
      }
    };

    function getCurrentSeason() {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();

      if (currentMonth < 4) {
        const previousYear = currentYear - 1;
        return `sezóna ${previousYear}/${currentYear}`;
      } else {
        const nextYear = currentYear + 1;
        return `sezóna ${currentYear}/${nextYear}`;
      }
    }

    const fetchReservations = async (isAdmin: boolean) => {
      try {
        let reservationsSnapshot;
        if (isAdmin) {
          // Fetch all reservations for admin
          reservationsSnapshot = await getDocs(collection(db, "reservations"));
        } else {
          // Fetch reservations from today to two weeks into the future for normal users
          const today = new Date();
          const twoWeeksFromNow = new Date();
          twoWeeksFromNow.setDate(today.getDate() + 21);

          const startDate = today.toISOString().split("T")[0]; // Format as YYYY-MM-DD
          const endDate = twoWeeksFromNow.toISOString().split("T")[0]; // Format as YYYY-MM-DD

          const reservationsQuery = query(
            collection(db, "reservations"),
            where("date", ">=", startDate),
            where("date", "<=", endDate)
          );

          reservationsSnapshot = await getDocs(reservationsQuery);
        }

        const reservations: Record<string, ReservationDetails> = {};
        for (const reservationDoc of reservationsSnapshot.docs) {
          const reservationData = reservationDoc.data();

          const reservationKey = `${reservationData.date}_${reservationData.session.startTime}_${reservationData.session.endTime}_${reservationData.reservationDetails.course}_${reservationData.lineNumber}`;

          const addedUsersSnapshot = await getDocs(
            collection(reservationDoc.ref, "addedUsers")
          );
          const addedUsers = addedUsersSnapshot.docs.map((doc) => doc.data());

          reservations[reservationKey] = {
            createdAt: reservationData.createdAt,
            date: reservationData.date,
            discipline: reservationData.discipline,
            category: reservationData.category,
            tickets: reservationData.tickets,
            lineNumber: reservationData.lineNumber,
            availableRacers: reservationData.availableRacers,
            status: reservationData.status,
            user: reservationData.user,
            id: reservationDoc.id,
            session: reservationData.session,
            addedUsers: addedUsers as User[],
          };
        }
        setReservationExists(reservations);
        setVerifyLoadingState(LoaderState.Finished);
      } catch (error) {
        console.error("Error fetching reservations: ", error);
      }
    };

    const fetchClosedTracks = async () => {
      try {
        const db = getFirestore();
        const closedTracksSnapshot = await getDocs(
          collection(db, "closedTracks")
        );
        const closedTracksData: Record<string, { reason: string }> = {};

        closedTracksSnapshot.forEach((doc) => {
          const data = doc.data();
          const trackKey = `${data.course}_${data.lineNumber}_${data.date}`;
          closedTracksData[trackKey] = { reason: data.reason };
        });

        setClosedTracks(closedTracksData);
      } catch (error) {
        console.error("Error fetching closed tracks: ", error);
      }
    };

    fetchCoursesAndSeasons();
    fetchResortEmail();
    fetchReservations(isAdmin);
    fetchClosedTracks();
  }, [db, resortId]);

  function formatDate(date: string) {
    return format(new Date(date), "dd.MM");
  }

  const handleNextWeek = (course: string, isAdmin: boolean) => {
    const futureLimit = isAdmin
      ? addDays(new Date(), 365)
      : addDays(new Date(), 14); // Admin can go up to 1 year forward
    const nextOffset = (weekOffset[course] || 0) + 1;
    const nextDate = addDays(new Date(), nextOffset * 7);

    if (nextDate <= futureLimit) {
      setWeekOffset((prev) => ({ ...prev, [course]: nextOffset }));
      setCurrentDates((prev) => ({
        ...prev,
        [course]: nextDate,
      }));
    }
  };

  const handlePreviousWeek = (course: string) => {
    const previousOffset = (weekOffset[course] || 0) - 1;
    const previousDate = addDays(new Date(), previousOffset * 7);

    if (previousDate >= new Date()) {
      setWeekOffset((prev) => ({ ...prev, [course]: previousOffset }));
      setCurrentDates((prev) => ({
        ...prev,
        [course]: previousDate,
      }));
    }
  };
  const getDaysInRange = (startDate: Date, daysCount: number) => {
    const days = [];
    for (let i = 0; i < daysCount; i++) {
      days.push(addDays(startDate, i));
    }
    return days;
  };

  const renderCalendar = (weeks: Week[], course: string) => {
    const currentDateForCourse = currentDates[course] || new Date();
    const daysInRange = getDaysInRange(currentDateForCourse, 7);
    const days = weeks.flatMap((week) => week.days);
    const filteredDays = days.filter((day) =>
      daysInRange.some(
        (rangeDate) => day.date === format(rangeDate, "yyyy-MM-dd")
      )
    );

    const capacity = courseCapacities[course] || 0;
    const individualLineCapacity = individualLineCapacities[course] || 0;
    const today = format(new Date(), "yyyy-MM-dd");

    const toggleDropdown = (key: string) => {
      setDropdownVisible((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    };

    return (
      <div className="current-week-container">
        <div className="week-navigation">
          <div className="navigate-backwards">
            <button
              onClick={() => handlePreviousWeek(course)}
              disabled={currentDateForCourse <= new Date()}
            >
              <i className="fas fa-arrow-circle-left"></i>
              <span className="tooltip-text">naspäť</span>
            </button>
          </div>
          <div className="curr-date-heading">
            <p>
              REZERVÁCIE od {format(currentDateForCourse, "dd.MM.yy")} do{" "}
              {format(addDays(currentDateForCourse, 6), "dd.MM.yy")}
            </p>
          </div>
          <div className="navigate-forwards">
            <button
              onClick={() => handleNextWeek(course, isAdmin)}
              disabled={
                addDays(currentDateForCourse, 7) >
                (isAdmin ? addDays(new Date(), 365) : addDays(new Date(), 14))
              }
            >
              <span className="tooltip-text">dopredu</span>
              <i className="fas fa-arrow-circle-right"></i>
            </button>
          </div>
        </div>

        <div className="week-hints">
          <div className="hints-left">
            <button onClick={handleInfoClick} className="info-button">
              <i className="fas fa-glasses"></i> Návod ako postupovať
            </button>
          </div>
          <div className="hints-right">
            <i className="fas fa-circle free"></i> Voľná
            <i className="fas fa-circle created"></i> Vytvorená
            <i className="fas fa-circle confirmed"></i> Potvrdená
          </div>
        </div>
        <div className="calendar-week">
          {filteredDays.length > 0 ? (
            filteredDays.map((day) => {
              const isWeekend =
                new Date(day.date).getDay() === 6 ||
                new Date(day.date).getDay() === 0;

              return (
                <div
                  className={`whole-day-info ${isWeekend ? "weekend" : ""}`}
                  key={day.date + course}
                >
                  <div className="day">{`${day.dayOfWeek[lang]}: ${formatDate(
                    day.date
                  )}`}</div>
                  <div className="calendar-day">
                    {[...Array(capacity)].map((_, index) => {
                      const trackKey = `${course}_${index + 1}_${day.date}`;
                      const closedTrack = closedTracks[trackKey];
                      const isClosed = !!closedTrack;

                      return (
                        <div
                          key={`${day.date}_${index}`}
                          className={`line-container ${
                            isClosed ? "closed" : ""
                          }`}
                        >
                          <div className="session-course-lines">
                            <span>TRAŤ {index + 1}</span>
                            {isAdmin && (
                              <button
                                className="track-toggle-button"
                                onClick={() => {
                                  if (isClosed) {
                                    handleOpenTrack(
                                      course,
                                      index + 1,
                                      day.date
                                    );
                                  } else {
                                    setCloseTrackDetails({
                                      course,
                                      lineNumber: index + 1,
                                      date: day.date,
                                    });
                                    setIsCloseModalOpen(true);
                                  }
                                }}
                              >
                                <i
                                  className={
                                    isClosed ? "fa fa-unlock-alt" : "fa fa-lock"
                                  }
                                ></i>
                                <span className="tooltip-text">
                                  {isClosed ? "Otvorit trať" : "Zavrieť trať"}
                                </span>
                              </button>
                            )}
                          </div>

                          {isClosed ? (
                            <div className="closed-reason">
                              <strong>Dôvod uzávierky:</strong> <br></br>
                              {closedTrack.reason || "No reason provided"}
                            </div>
                          ) : (
                            day.timeSessions?.map((session, sessionIndex) => {
                              const reservationKey = `${day.date}_${
                                session.startTime
                              }_${session.endTime}_${course}_${index + 1}`;
                              const isReserved =
                                reservationExists[reservationKey];

                              return (
                                <div
                                  className={`res-container ${
                                    isClosed
                                      ? "closed"
                                      : isReserved
                                      ? isReserved.status === "potvrdená"
                                        ? "potvrdená"
                                        : "vytvorená"
                                      : "not-reserved"
                                  }`}
                                  key={`${reservationKey}_${sessionIndex}`}
                                >
                                  {!isClosed && (
                                    <div className="res-details-container">
                                      <div className="session-course-times">
                                        {session.startTime} - {session.endTime}
                                      </div>

                                      {isReserved &&
                                      typeof isReserved === "object" ? (
                                        <>
                                          {(isLoggedIn &&
                                            (isReserved.user.email ===
                                              localStorage.getItem(
                                                "userEmail"
                                              ) ||
                                              isReserved.addedUsers?.some(
                                                (user) =>
                                                  user.email ===
                                                  localStorage.getItem(
                                                    "userEmail"
                                                  )
                                              ))) ||
                                          isAdmin ? (
                                            <>
                                              {day.date !== today &&
                                                (isReserved.status !==
                                                  "potvrdená" ||
                                                  isAdmin) && (
                                                  <div className="delEditButtons-group">
                                                    <button
                                                      className="handler-edit"
                                                      onClick={() =>
                                                        handleEdit(isReserved)
                                                      }
                                                    >
                                                      <i
                                                        className={
                                                          isReserved.user
                                                            .email ===
                                                            localStorage.getItem(
                                                              "userEmail"
                                                            ) || isAdmin
                                                            ? "fas fa-pen"
                                                            : "fa fa-wrench"
                                                        }
                                                      ></i>
                                                      <span className="tooltip-text">
                                                        {isReserved.user
                                                          .email ===
                                                          localStorage.getItem(
                                                            "userEmail"
                                                          ) || isAdmin
                                                          ? "Upraviť rezerváciu"
                                                          : "Editovať rezerváciu"}
                                                      </span>
                                                    </button>
                                                    {(isReserved.user.email ===
                                                      localStorage.getItem(
                                                        "userEmail"
                                                      ) ||
                                                      isAdmin) && (
                                                      <button
                                                        className="handler-delete"
                                                        onClick={() =>
                                                          handleDelete(
                                                            reservationExists[
                                                              reservationKey
                                                            ]?.id || "",
                                                            isReserved.user
                                                              .email,
                                                            isReserved.user
                                                              .firstName,
                                                            isReserved.user
                                                              .secondName
                                                          )
                                                        }
                                                      >
                                                        <i className="fas fa-trash-alt"></i>
                                                        <span className="tooltip-text">
                                                          Zmazať svoju
                                                          rezerváciu
                                                        </span>
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                            </>
                                          ) : null}

                                          <div className="res-details">
                                            <div>
                                              {isReserved.availableRacers !==
                                              undefined ? (
                                                isReserved.availableRacers >
                                                0 ? (
                                                  <>
                                                    <b>VOĽNÝCH:</b>{" "}
                                                    {`${
                                                      isReserved.availableRacers
                                                    } / ${
                                                      individualLineCapacities[
                                                        course
                                                      ] || "N/A"
                                                    }`}
                                                  </>
                                                ) : (
                                                  "OBSADENÉ"
                                                )
                                              ) : (
                                                <div className="loading-indicator">
                                                  Načítavam...
                                                </div>
                                              )}
                                              <hr></hr>
                                              <b>DISCIPLÍNA:</b>{" "}
                                              {isReserved.discipline || "N/A"}
                                              <br></br>
                                              <b>KATEGÓRIA:</b>{" "}
                                              {isReserved.category || "N/A"}
                                            </div>
                                            <div>
                                              <div>
                                                <button
                                                  className="clubs-dropdown-button"
                                                  onClick={() =>
                                                    toggleDropdown(
                                                      reservationKey
                                                    )
                                                  }
                                                >
                                                  <i className="fa fa-sort-down"></i>
                                                  <b>ZOBRAZIŤ KLUBY</b>
                                                </button>
                                                {dropdownVisible[
                                                  reservationKey
                                                ] && (
                                                  <div className="dropdown-content">
                                                    <b>KLUB:</b>{" "}
                                                    {`${isReserved.user.sportClub}`}
                                                    <br></br>
                                                    <b>POČET JAZDCOV:</b>{" "}
                                                    {`${isReserved.user.ownRacers}`}
                                                    {isReserved.addedUsers?.map(
                                                      (user, idx) => (
                                                        <div key={idx}>
                                                          <hr></hr>
                                                          <b>KLUB:</b>{" "}
                                                          {user.sportClub}
                                                          <br></br>
                                                          <b>
                                                            POČET JAZDCOV:
                                                          </b>{" "}
                                                          {user.ownRacers}
                                                        </div>
                                                      )
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <button
                                            className="detail-button"
                                            onClick={() => {
                                              setDetailsReservation(isReserved);
                                              setIsDetailsModalOpen(true);
                                            }}
                                          >
                                            <i className="fa fa-info-circle"></i>
                                            DETAIL
                                          </button>

                                          {((!isLoggedIn &&
                                            isReserved.availableRacers !== 0) ||
                                            (isReserved.availableRacers !== 0 &&
                                              isReserved.availableRacers <
                                                individualLineCapacity &&
                                              isReserved.user.email !==
                                                localStorage.getItem(
                                                  "userEmail"
                                                ) &&
                                              !isReserved.addedUsers?.some(
                                                (user) =>
                                                  user.email ===
                                                  localStorage.getItem(
                                                    "userEmail"
                                                  )
                                              ))) && (
                                            <button
                                              className="add-to-training-button"
                                              onClick={() => {
                                                if (!isLoggedIn) {
                                                  alert(
                                                    "Musíte sa najprv prihlásiť."
                                                  );
                                                } else {
                                                  handleAddToTrainingClick(
                                                    day.date,
                                                    session,
                                                    course,
                                                    index + 1,
                                                    isReserved.user.sportClub ||
                                                      ""
                                                  );
                                                }
                                              }}
                                            >
                                              PRIDAŤ SA NA TRÉNING
                                            </button>
                                          )}

                                          {isAdmin &&
                                            isReserved.status !==
                                              "potvrdená" && (
                                              <button
                                                className="accept-training-button"
                                                onClick={() =>
                                                  handleConfirmReservation(
                                                    isReserved.id
                                                  )
                                                }
                                              >
                                                <i className="fa fa-check"></i>
                                                POTVRDIŤ TRÉNING
                                              </button>
                                            )}
                                        </>
                                      ) : (
                                        <>
                                          {day.date !== today && (
                                            <button
                                              className="reservation-button"
                                              onClick={() =>
                                                handleSessionClick(
                                                  day.date,
                                                  session,
                                                  course,
                                                  index + 1
                                                )
                                              }
                                              disabled={day.date === today}
                                            >
                                              REZERVOVAŤ
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="unable-calendar-p">
              Nedostupný žiadny ďalší tréningový deň.
            </p>
          )}
        </div>
      </div>
    );
  };

  const sendEmail = async (
    reservationId: string | undefined,
    subject: string,
    recipient: string,
    course: string | undefined,
    courseName: string | undefined,
    date: string | undefined,
    startTime: string | undefined,
    endTime: string | undefined,
    lineNumber: number | undefined,
    racers: number | undefined,
    discipline: string | undefined,
    category: string | undefined,
    tickets: number | undefined,
    promoCodesString: string | undefined,
    userFirstName: string,
    userSecondName: string,
    userTelNumber: string | undefined,
    userEmail: string | undefined,
    emailIdentifier: string
  ) => {
    const sendEmailFunction = httpsCallable<{
      reservationId: string | undefined;
      emailData: {
        recipient: string;
        subject: string;
        course: string | undefined;
        courseName: string | undefined;
        date: string | undefined;
        startTime: string | undefined;
        endTime: string | undefined;
        lineNumber: number | undefined;
        racers: number | undefined;
        discipline: string | undefined;
        category: string | undefined;
        tickets: number | undefined;
        promoCodesString: string | undefined;
        userFirstName: string;
        userSecondName: string;
        userTelNumber: string | undefined;
        userEmail: string | undefined;
        emailIdentifier: string;
      };
    }>(functions, "sendEmail");
    try {
      const result = await sendEmailFunction({
        reservationId: reservationId,
        emailData: {
          recipient,
          subject,
          course,
          courseName,
          date,
          endTime,
          lineNumber,
          startTime,
          racers,
          discipline,
          category,
          tickets,
          promoCodesString,
          userFirstName,
          userSecondName,
          userTelNumber,
          userEmail,
          emailIdentifier,
        },
      });
      console.log("Email sent:", result);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  const handleSessionClick = async (
    date: string,
    session: { startTime: string; endTime: string },
    course: string,
    lineNumber: number // Add line number to handle session clicks
  ) => {
    const reservationKey = `${date}_${session.startTime}_${session.endTime}_${course}_${lineNumber}`;

    if (reservationExists[reservationKey]) {
      try {
        const reservationsRef = collection(db, "reservations");
        const q = query(
          reservationsRef,
          where("date", "==", date),
          where("session.startTime", "==", session.startTime),
          where("session.endTime", "==", session.endTime),
          where("reservationDetails.course", "==", course),
          where("lineNumber", "==", lineNumber)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const existingReservationDoc = querySnapshot.docs[0];
          const existingReservationDetails = existingReservationDoc.data();
          setSelectedSession({
            date,
            session,
            course,
            lineNumber,
            existingDetails: {
              ...existingReservationDetails,
              id: existingReservationDoc.id, // Capture the Firestore document ID
            }, // Pass the existing details
          });
        }
      } catch (error) {
        console.error("Error fetching existing reservation details: ", error);
      }
    } else if (isLoggedIn) {
      setSelectedSession({ date, session, course, lineNumber }); // Set for a new reservation
    } else {
      alert("Pre rezervovanie trate je potrebné prihlásenie.");
    }
  };

  const handleReservationSubmit = async (formData: any) => {
    try {
      setVerifyLoadingState(LoaderState.Loading);
      if (!selectedSession) {
        console.error("Error: selectedSession is undefined or null.");
        return;
      }

      const db = getFirestore();

      const courseDoc = await getDoc(
        doc(db, "resorts", resortId, "courses", selectedSession.course)
      );
      const courseName = courseDoc.exists()
        ? courseDoc.data().name
        : selectedSession.course;

      const ZSL_code = localStorage.getItem("userZSL_code") || "";
      let promoCodesString = "";

      if (formData.tickets > 0) {
        const promoCodes = await fetchPromoCodes(resortId, ZSL_code);
        promoCodesString = promoCodes.map((promo) => promo.code).join(",");
        await deletePromoCodes(resortId, promoCodes);
      }
      // const promoCodes = await fetchPromoCodes(resortId, ZSL_code);
      // const promoCodesString = promoCodes.map((promo) => promo.code).join(",");

      // await deletePromoCodes(resortId, promoCodes);

      // Create a new document in the 'reservations' collection
      const reservationRef = doc(collection(db, "reservations"));
      const userEmail = localStorage.getItem("userEmail");
      const userFirstName = localStorage.getItem("userFirstName");
      const userSecondName = localStorage.getItem("userSecondName");

      const availableRacers =
        individualLineCapacities[selectedSession.course] - formData.racers;

      if (availableRacers < 0) {
        console.error("Not enough available racers.");
        alert("Nedostatok voľných miest.");
        setVerifyLoadingState(LoaderState.Finished);
        return;
      }

      await setDoc(reservationRef, {
        date: selectedSession?.date || "",
        session: selectedSession.session,
        discipline: formData.discipline,
        category: formData.category,
        tickets: formData.tickets,
        status: "vytvorená",
        availableRacers: availableRacers,
        createdAt: new Date(),
        user: {
          email: localStorage.getItem("userEmail"),
          firstName: localStorage.getItem("userFirstName"),
          secondName: localStorage.getItem("userSecondName"),
          sportClub: localStorage.getItem("userSportClub"),
          ownRacers: formData.racers,
        },
        reservationDetails: {
          resort: resortId,
          course: selectedSession.course,
          courseName: courseName,
        },
        lineNumber: selectedSession.lineNumber,
      });

      const useremailSubject = `Úspešná rezervácie tréningu na ${selectedSession.date}`;
      const useremailIdentifier = "USER_SUCCESS_RES";

      // send email to user
      if (userEmail && userFirstName && userSecondName) {
        sendEmail(
          reservationRef.id,
          useremailSubject,
          userEmail,
          courseName,
          selectedSession.course,
          selectedSession.date,
          selectedSession.session.startTime,
          selectedSession.session.endTime,
          selectedSession.lineNumber,
          formData.racers,
          formData.discipline,
          formData.category,
          formData.tickets,
          promoCodesString,
          userFirstName,
          userSecondName,
          undefined,
          undefined,
          useremailIdentifier
        );
      } else {
        console.error("User email is null. Cannot send email.");
      }

      const adminEmailSubject = `Potvrdenie rezervácie tréningu na ${selectedSession.date}`;
      const adminEmailRecipient = resortEmail || "";
      const adminemailIdentifier = "ADMIN_SUCCESS_RES";
      const userTelNumber = localStorage.getItem("userTel_number") || "";

      if (userEmail && userFirstName && userSecondName) {
        sendEmail(
          reservationRef.id,
          adminEmailSubject,
          adminEmailRecipient,
          courseName,
          selectedSession.course,
          selectedSession.date,
          selectedSession.session.startTime,
          selectedSession.session.endTime,
          selectedSession.lineNumber,
          formData.racers,
          formData.discipline,
          formData.category,
          formData.tickets,
          undefined,
          userFirstName,
          userSecondName,
          userTelNumber,
          userEmail,
          adminemailIdentifier
        );
      } else {
        console.error("Admin email is null. Cannot send email.");
      }

      console.log("Rezervácia úspešne uložená!");

      const reservationKey = `${selectedSession.date}_${selectedSession.session.startTime}_${selectedSession.session.endTime}_${selectedSession.course}_${selectedSession.lineNumber}`;

      setReservationExists((prev) => ({
        ...prev,
        [reservationKey]: {
          availableRacers: formData.availableRacers,
          discipline: formData.discipline,
          category: formData.category,
          tickets: formData.tickets,
          status: "vytvorená", // or whatever status you want to set
          user: {
            email: localStorage.getItem("userEmail"),
            firstName: localStorage.getItem("userFirstName"),
            secondName: localStorage.getItem("userSecondName"),
            sportClub: localStorage.getItem("userSportClub"),
            ownRacers: formData.racers,
          },
        } as ReservationDetails, // Cast to ReservationDetails
      }));
      setSelectedSession(null);
      await handleUpdate(isAdmin);

      alert("Ďakujeme za rezerváciu, tešíme sa na vás.");
      setVerifyLoadingState(LoaderState.Finished);
    } catch (error) {
      console.error("Error saving reservation: ", error);
      alert("There was an error saving the reservation.");
    }
  };

  const handleCloseModal = () => {
    setSelectedSession(null);
  };

  const handleDelete = async (
    reservationId: string,
    userEmail: string,
    userFirstName: string,
    userSecondName: string
  ) => {
    setVerifyLoadingState(LoaderState.Loading);
    if (!reservationId) {
      console.error("Error: reservationId is undefined or null.");
      return;
    }

    try {
      // Create a reference to the specific reservation document using reservationId
      const reservationRef = doc(db, "reservations", reservationId);
      await deleteDoc(reservationRef);

      const updatedReservations = { ...reservationExists };
      delete updatedReservations[reservationId]; // Delete the reservation from state
      setReservationExists(updatedReservations);
    } catch (error) {
      console.error("Error deleting reservation: ", error);
      alert("Pri zrušení rezervácie došlo k chybe.");
    } finally {
      // Reset loading state
      await handleUpdate(isAdmin);
      const useremailSubject = "Vaša rezervácia bola zrušená";
      const useremailIdentifier = "USER_DELETE_RES";
      if (userEmail && userFirstName && userSecondName && isAdmin) {
        sendEmail(
          undefined,
          useremailSubject,
          userEmail,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          userFirstName,
          userSecondName,
          undefined,
          undefined,
          useremailIdentifier
        );
      } else {
        console.error("User email is null. Cannot send email.");
      }
      setVerifyLoadingState(LoaderState.Finished);
    }
  };

  const handleEdit = (existingDetails: ReservationDetails) => {
    setEditReservationDetails(existingDetails); // Set the reservation details to be edited
    setIsEditModalOpen(true); // Open the edit modal
  };

  const handleConfirmReservation = async (reservationId: string) => {
    try {
      setVerifyLoadingState(LoaderState.Loading);
      const reservationRef = doc(db, "reservations", reservationId);
      await updateDoc(reservationRef, { status: "potvrdená" });

      const reservationDoc = await getDoc(reservationRef);
      if (reservationDoc.exists()) {
        const reservationData = reservationDoc.data();
        const userEmail = reservationData.user.email;
        const userFirstName = reservationData.user.firstName;
        const userSecondName = reservationData.user.secondName;

        const userConfirmEmailSubject = `Vaša rezervácia na ${reservationData.date} bola potvrdená `;
        const useremailIdentifier = "USER_ACCEPTED_RES";

        if (userEmail && userFirstName && userSecondName) {
          sendEmail(
            undefined,
            userConfirmEmailSubject,
            userEmail,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            userFirstName,
            userSecondName,
            undefined,
            undefined,
            useremailIdentifier
          );
        } else {
          console.error("User email is null. Cannot send email.");
        }

        await handleUpdate(isAdmin);
        setIsReservationConfirmed(true);
        console.log("Reservation status updated to 'potvrdená'");
      } else {
        console.error("No such reservation!");
      }
    } catch (error) {
      console.error("Error updating reservation status: ", error);
    } finally {
      setVerifyLoadingState(LoaderState.Finished);
    }
  };

  const handleUpdate = async (isAdmin: boolean) => {
    try {
      let reservationsSnapshot;
      if (isAdmin) {
        // Fetch all reservations for admin
        reservationsSnapshot = await getDocs(collection(db, "reservations"));
      } else {
        // Fetch reservations from today to two weeks into the future for normal users
        const today = new Date();
        const twoWeeksFromNow = new Date();
        twoWeeksFromNow.setDate(today.getDate() + 21);

        const startDate = today.toISOString().split("T")[0]; // Format as YYYY-MM-DD
        const endDate = twoWeeksFromNow.toISOString().split("T")[0]; // Format as YYYY-MM-DD

        const reservationsQuery = query(
          collection(db, "reservations"),
          where("date", ">=", startDate),
          where("date", "<=", endDate)
        );

        reservationsSnapshot = await getDocs(reservationsQuery);
      }

      const reservations: Record<string, ReservationDetails> = {};
      for (const reservationDoc of reservationsSnapshot.docs) {
        const reservationData = reservationDoc.data();

        const reservationKey = `${reservationData.date}_${reservationData.session.startTime}_${reservationData.session.endTime}_${reservationData.reservationDetails.course}_${reservationData.lineNumber}`;

        const addedUsersSnapshot = await getDocs(
          collection(reservationDoc.ref, "addedUsers")
        );
        const addedUsers = addedUsersSnapshot.docs.map(
          (doc) => doc.data() as User
        );

        reservations[reservationKey] = {
          createdAt: reservationData.createdAt,
          date: reservationData.date,
          availableRacers: reservationData.availableRacers,
          discipline: reservationData.discipline,
          category: reservationData.category,
          tickets: reservationData.tickets,
          lineNumber: reservationData.lineNumber,
          session: reservationData.session,
          status: reservationData.status,
          user: reservationData.user,
          id: reservationDoc.id,
          addedUsers: addedUsers,
        };
      }

      setReservationExists(reservations);
    } catch (error) {
      console.error("Error updating reservations: ", error);
    }
  };

  const handleAddToTrainingClick = (
    date: string,
    session: { startTime: string; endTime: string },
    course: string,
    lineNumber: number,
    sportClub: string
  ) => {
    setAddToTrainingSession({ date, session, course, lineNumber, sportClub });
    setIsAddToTrainingModalOpen(true);
  };

  const handleAddToTrainingSubmit = async (formData: { racers: number }) => {
    if (!addToTrainingSession) return;

    try {
      setVerifyLoadingState(LoaderState.Loading);
      const { date, session, course, lineNumber } = addToTrainingSession;
      const db = getFirestore();
      const userEmail = localStorage.getItem("userEmail");
      const userFirstName = localStorage.getItem("userFirstName");
      const userSecondName = localStorage.getItem("userSecondName");
      const sportClub = localStorage.getItem("userSportClub");
      const ZSL_code = localStorage.getItem("userZSL_code") || "";

      if (!userEmail || !userFirstName || !userSecondName) {
        console.error("User information is missing. Cannot add to training.");
        return;
      }

      // Query to find the existing reservation
      const reservationsRef = collection(db, "reservations");
      const q = query(
        reservationsRef,
        where("date", "==", date),
        where("session.startTime", "==", session.startTime),
        where("session.endTime", "==", session.endTime),
        where("reservationDetails.course", "==", course),
        where("lineNumber", "==", lineNumber)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const existingReservationDoc = querySnapshot.docs[0];
        const existingReservationData = existingReservationDoc.data();

        const newAvailableRacers =
          existingReservationData.availableRacers - formData.racers;
        if (newAvailableRacers < 0) {
          console.error("Not enough available racers.");
          alert("Nedostatok voľných miest.");
          return;
        }

        // Check if the user already exists in the addedUsers subcollection
        const addedUsersRef = collection(
          existingReservationDoc.ref,
          "addedUsers"
        );
        const userDocRef = doc(addedUsersRef, userEmail);
        const userDocSnapshot = await getDoc(userDocRef);

        const promoCodes = await fetchPromoCodes(resortId, ZSL_code);
        const promoCodesString = promoCodes
          .map((promo) => promo.code)
          .join(",");

        await deletePromoCodes(resortId, promoCodes);

        const useremailSubject = `Úspešná rezervácie tréningu na ${addToTrainingSession.date}`;
        const useremailIdentifier = "USER_ADDED_TO_TRAINING";

        // send email to user
        if (userEmail && userFirstName && userSecondName) {
          sendEmail(
            reservationsRef.id,
            useremailSubject,
            userEmail,
            undefined,
            addToTrainingSession.course,
            addToTrainingSession.date,
            addToTrainingSession.session.startTime,
            addToTrainingSession.session.endTime,
            addToTrainingSession.lineNumber,
            formData.racers,
            addToTrainingSession.sportClub,
            undefined,
            undefined,
            promoCodesString,
            userFirstName,
            userSecondName,
            undefined,
            undefined,
            useremailIdentifier
          );
        } else {
          console.error("User email is null. Cannot send email.");
        }

        if (!userDocSnapshot.exists()) {
          // Add the new user to the addedUsers subcollection
          await setDoc(userDocRef, {
            email: userEmail,
            firstName: userFirstName,
            secondName: userSecondName,
            sportClub: sportClub,
            ownRacers: formData.racers,
          });

          // Update the existing reservation to decrement the number of available racers
          await updateDoc(existingReservationDoc.ref, {
            availableRacers: newAvailableRacers,
          });

          console.log("Successfully added to training!");
          await handleUpdate(isAdmin);
          setVerifyLoadingState(LoaderState.Finished);
          alert("Boli ste úspešne pridaní na tréning.");
        } else {
          console.error("User already added to this training.");
          alert("Už ste pridaní na tento tréning.");
        }
      } else {
        console.error("No existing reservation found.");
        alert("Nebola nájdená žiadna existujúca rezervácia.");
      }
    } catch (error) {
      console.error("Error adding to training: ", error);
      alert("Pri pridávaní na tréning došlo k chybe.");
    }
  };

  const handleCloseTrack = async (
    course: string,
    lineNumber: number,
    date: string,
    reason: string
  ) => {
    const trackKey = `${course}_${lineNumber}_${date}`;
    const db = getFirestore();
    const closedTrackRef = doc(db, "closedTracks", trackKey);
    await setDoc(closedTrackRef, {
      course: course,
      lineNumber: lineNumber,
      date: date,
      closedAt: new Date(),
      reason: reason,
    });

    setClosedTracks((prev) => ({ ...prev, [trackKey]: { reason } }));
  };

  const handleOpenTrack = async (
    course: string,
    lineNumber: number,
    date: string
  ) => {
    const trackKey = `${course}_${lineNumber}_${date}`;
    const db = getFirestore();
    const closedTrackRef = doc(db, "closedTracks", trackKey); // Include the document ID

    try {
      await deleteDoc(closedTrackRef);

      setClosedTracks((prev) => {
        const newClosedTracks = { ...prev };
        delete newClosedTracks[trackKey];
        return newClosedTracks;
      });

      console.log(`Track ${trackKey} successfully reopened.`);
    } catch (error) {
      console.error("Error reopening track: ", error);
      alert("Pri otváraní trate došlo k chybe.");
    }
  };

  const toggleDropdown = () => {
    setDropdownVisible((prev) => ({
      ...prev,
      dropdown: !prev.dropdown,
    }));
  };

  return (
    <div className="resort-page">
      <div className="training-courses">
        TRÉNINGOVÉ ZJAZDOVKY STREDISKA:
        {dropdownVisible && (
          <select
            onChange={(e) => setSelectedCourse(e.target.value)}
            value={selectedCourse || ""}
            className="custom-dropdown"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {verifyLoadingState === LoaderState.Loading ? (
        <div className="loading-animation-container">
          <LoadingAnimation state={verifyLoadingState} />
        </div>
      ) : (
        <>
          {selectedCourse &&
            seasons[selectedCourse]?.map((season) => (
              <div key={season.id}>
                {renderCalendar(season.weeks, selectedCourse)}
              </div>
            ))}

          {/* Modal to reserve a session */}
          {selectedSession && (
            <ReservationModal
              date={selectedSession.date}
              session={selectedSession.session}
              individualLineCapacity={
                individualLineCapacities[selectedSession.course]
              }
              onClose={handleCloseModal}
              onSubmit={handleReservationSubmit}
              onUpdate={() => handleUpdate(isAdmin)}
              course={selectedSession.course}
              isExistingReservation={Boolean(selectedSession.existingDetails)} // Indicate if it's an existing reservation
              existingDetails={selectedSession.existingDetails} // Pass existing reservation details // Pass delete function
              isLoggedIn={isLoggedIn} // Pass login status
            />
          )}

          {/* Modal for adding to training */}
          {isAddToTrainingModalOpen && addToTrainingSession && (
            <AddToTrainingModal
              date={addToTrainingSession.date}
              session={addToTrainingSession.session}
              onClose={() => setIsAddToTrainingModalOpen(false)}
              onSubmit={handleAddToTrainingSubmit}
              course={addToTrainingSession.course}
            />
          )}

          {/* Modal for editing reservation */}
          {isEditModalOpen && editReservationDetails && (
            <EditReservationModal
              reservationDetails={editReservationDetails} // Pass the reservation details
              onClose={() => setIsEditModalOpen(false)} // Close function
              isLoggedIn={isLoggedIn} // Pass login status if needed
              isAdmin={isAdmin} // Pass admin status if needed
              onUpdate={() => handleUpdate(isAdmin)}
              setVerifyLoadingState={setVerifyLoadingState}
            />
          )}

          {isDetailsModalOpen && detailsReservation && (
            <ReservationDetailsModal
              reservationDetails={detailsReservation}
              onClose={() => setIsDetailsModalOpen(false)}
            />
          )}

          {isCloseModalOpen && closeTrackDetails && (
            <CloseTrackModal
              isOpen={isCloseModalOpen}
              onClose={() => setIsCloseModalOpen(false)}
              onSubmit={(reason) => {
                handleCloseTrack(
                  closeTrackDetails.course,
                  closeTrackDetails.lineNumber,
                  closeTrackDetails.date,
                  reason
                );
                setIsCloseModalOpen(false);
              }}
            />
          )}

          {/* Info Modal */}
          {isShowInfoModalOpen && (
            <ShowInfoModal
              isOpen={isShowInfoModalOpen}
              onClose={() => setisShowInfoModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default ResortPage;
