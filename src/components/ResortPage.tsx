import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/FirebaseService";

import ReservationModal from "./ReservationModal";
import EditReservationModal from "./EditReservationModal";
import ReservationDetailsModal from "./ReservationDetailsModal";
import AddToTrainingModal from "./AddToTrainigModal";
import CloseTrackModal from "./CloseTrackModal";
import ShowInfoModal from "./ShowInfoModal";
import { fetchPromoCodes, deletePromoCodes } from "./getPromoCodes";

import LoadingAnimation, { LoaderState } from "./LoadingAnimation";
import CalendarWeek from "./calendar/CalendarWeek";
import type {
  CalendarActions,
  Day,
  ReservationDetails,
  Season,
  User,
  Week,
} from "../types/calendar";

import "../Modal.css";
import "../ResortPage.css";
import "../Calendar.css";

interface ResortPageProps {
  resortId: string;
  isLoggedIn: boolean;
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

        if (fetchedCourses.length > 1) {
          const secondCourse = fetchedCourses.splice(1, 1)[0];
          fetchedCourses.unshift(secondCourse);
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
      const currentMonth = currentDate.getMonth() + 1;

      // const currentMonth = 6;

      if (currentMonth < 6) {
        //very important to have the month in the right order. Displaying seasons by that.
        const previousYear = currentYear - 1;
        return `${previousYear}/${currentYear}`;
      } else {
        const nextYear = currentYear + 1;
        return `${currentYear}/${nextYear}`;
      }
    }

    const fetchReservations = async (isAdmin: boolean) => {
      try {
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + (isAdmin ? 365 : 21));

        const startDateStr = today.toISOString().split("T")[0]; // Format as YYYY-MM-DD
        const endDateStr = endDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD

        const reservationsQuery = query(
          collection(db, "reservations"),
          where("date", ">=", startDateStr),
          where("date", "<=", endDateStr)
        );

        const reservationsSnapshot = await getDocs(reservationsQuery);

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
          tel_number: localStorage.getItem("userTel_number"),
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
            tel_number: localStorage.getItem("userTel_number"),
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
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + (isAdmin ? 365 : 21));

      const startDateStr = today.toISOString().split("T")[0]; // Format as YYYY-MM-DD
      const endDateStr = endDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD

      const reservationsQuery = query(
        collection(db, "reservations"),
        where("date", ">=", startDateStr),
        where("date", "<=", endDateStr)
      );
      const reservationsSnapshot = await getDocs(reservationsQuery);

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
      const tel_number = localStorage.getItem("userTel_number");

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
            tel_number: tel_number,
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
          alert("Už ste pridaní na tento tréning.");
        }
      } else {
        alert("Nebola nájdená žiadna existujúca rezervácia.");
      }
    } catch (error) {
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

  // --- calendar wiring ------------------------------------------------------
  //
  // The calendar is memoised, so everything handed to it has to keep a stable
  // identity between renders — otherwise React.memo compares new objects every
  // time and nothing is actually skipped.

  const viewer = useMemo(
    () => ({
      isLoggedIn,
      isAdmin,
      email: localStorage.getItem("userEmail"),
    }),
    [isLoggedIn, isAdmin]
  );

  const reservationFor = useCallback(
    (date: string, startTime: string, endTime: string, lineNumber: number) =>
      reservationExists[
        `${date}_${startTime}_${endTime}_${selectedCourse}_${lineNumber}`
      ],
    [reservationExists, selectedCourse]
  );

  const closedTrackFor = useCallback(
    (lineNumber: number, date: string) =>
      closedTracks[`${selectedCourse}_${lineNumber}_${date}`],
    [closedTracks, selectedCourse]
  );

  const dayLabel = useCallback(
    (day: Day) => `${day.dayOfWeek[lang]}: ${formatDate(day.date)}`,
    [lang]
  );

  const calendarActions = useMemo<CalendarActions>(
    () => ({
      onReserve: (date, session, lineNumber) =>
        handleSessionClick(date, session, selectedCourse ?? "", lineNumber),
      onEdit: (reservation) => handleEdit(reservation),
      onDelete: (id, email, firstName, secondName) =>
        handleDelete(id, email, firstName, secondName),
      onShowDetails: (reservation) => {
        setDetailsReservation(reservation);
        setIsDetailsModalOpen(true);
      },
      onJoinTraining: (date, session, lineNumber, sportClub) =>
        handleAddToTrainingClick(
          date,
          session,
          selectedCourse ?? "",
          lineNumber,
          sportClub
        ),
      onConfirm: (reservationId) => handleConfirmReservation(reservationId),
      onCloseTrack: (lineNumber, date) => {
        setCloseTrackDetails({
          course: selectedCourse ?? "",
          lineNumber,
          date,
        });
        setIsCloseModalOpen(true);
      },
      onOpenTrack: (lineNumber, date) =>
        handleOpenTrack(selectedCourse ?? "", lineNumber, date),
    }),
    [selectedCourse, isAdmin]
  );

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
                <CalendarWeek
                  weeks={season.weeks}
                  weekStart={currentDates[selectedCourse] || new Date()}
                  capacity={courseCapacities[selectedCourse] || 0}
                  individualLineCapacity={
                    individualLineCapacities[selectedCourse] || 0
                  }
                  closedTrackFor={closedTrackFor}
                  reservationFor={reservationFor}
                  viewer={viewer}
                  actions={calendarActions}
                  onPreviousWeek={() => handlePreviousWeek(selectedCourse)}
                  onNextWeek={() => handleNextWeek(selectedCourse, isAdmin)}
                  onShowInfo={handleInfoClick}
                  dayLabel={dayLabel}
                  lang={lang}
                />
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
