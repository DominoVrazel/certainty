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
import { slotKey, useTrainingWeek } from "../hooks/useTrainingWeek";
import {
  cancelTraining,
  checkIn,
  confirmAttendance,
  createTraining,
  closureId,
  getTraining,
  joinTraining,
  leaveTraining,
  slotId,
  TrainingError,
  type Training,
} from "../services/trainings";
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

  const [isEditModalOpen, setIsEditModalOpen] = useState(false); // State to control edit modal
  const [editTraining, setEditTraining] = useState<Training | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detailsTraining, setDetailsTraining] = useState<Training | null>(null);
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
  const viewerUid = localStorage.getItem("userId");

  const weekStart = selectedCourse
    ? currentDates[selectedCourse] || new Date()
    : new Date();

  const { bySlot, closureBySlot } = useTrainingWeek(
    resortId,
    selectedCourse,
    weekStart
  );

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
      } finally {
        // The calendar itself is driven by a listener now, so the page is ready
        // as soon as the courses and seasons it renders have arrived.
        setVerifyLoadingState(LoaderState.Finished);
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

    fetchCoursesAndSeasons();
    fetchResortEmail();
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

    if (bySlot.has(slotKey(date, session.startTime, session.endTime, lineNumber))) {
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

      const uid = localStorage.getItem("userId");
      if (!uid) {
        alert("Musíte sa najprv prihlásiť.");
        setVerifyLoadingState(LoaderState.Finished);
        return;
      }

      // One transaction over a slot-derived document id. Capacity is checked
      // against what the transaction reads, not against a number captured when
      // the modal opened.
      const trainingId = await createTraining(
        {
          resortId,
          courseId: selectedSession.course,
          date: selectedSession.date,
          session: selectedSession.session,
          lineNumber: selectedSession.lineNumber,
        },
        {
          uid,
          sportClub: localStorage.getItem("userSportClub"),
          firstName: userFirstName,
          secondName: userSecondName,
          email: userEmail,
          tel_number: localStorage.getItem("userTel_number"),
          racers: formData.racers,
          coaches: formData.coaches ?? 0,
          tickets: formData.tickets,
        },
        {
          discipline: formData.discipline,
          category: formData.category,
          courseName,
          capacity: individualLineCapacities[selectedSession.course],
        }
      );

      const useremailSubject = `Úspešná rezervácie tréningu na ${selectedSession.date}`;
      const useremailIdentifier = "USER_SUCCESS_RES";

      // send email to user
      if (userEmail && userFirstName && userSecondName) {
        sendEmail(
          trainingId,
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
          trainingId,
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

      setSelectedSession(null);

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

  /**
   * One control, two outcomes.
   *
   * A club that merely joined leaves, and the training carries on for everyone
   * else — previously the joined clubs lived in a subcollection of the booking,
   * so cancelling it stranded them. The organising club (or an admin) removing
   * itself cancels the training only when nobody else is left; otherwise the
   * earliest joiner takes it over. The service decides, because only it sees
   * the participant list inside the transaction.
   */
  const handleLeaveOrCancel = async (training: Training) => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;

    const others = Object.keys(training.participants ?? {}).filter(
      (k) => k !== uid
    );
    const isParticipant = !!training.participants?.[uid];
    const cancellingForEveryone = isAdmin && !isParticipant;

    const question = cancellingForEveryone
      ? "Naozaj zrušiť tento tréning pre všetky kluby?"
      : others.length > 0 && training.participants?.[uid]?.role !== "owner"
      ? "Naozaj sa odhlásiť z tohto tréningu?"
      : others.length > 0
      ? "Naozaj sa odhlásiť? Tréning zostane ostatným klubom."
      : "Naozaj zrušiť túto rezerváciu?";

    if (!window.confirm(question)) return;

    setVerifyLoadingState(LoaderState.Loading);
    try {
      if (cancellingForEveryone) {
        await cancelTraining(training.id);
      } else {
        await leaveTraining(training.id, uid);
      }

      const userEmail = localStorage.getItem("userEmail");
      const userFirstName = localStorage.getItem("userFirstName");
      const userSecondName = localStorage.getItem("userSecondName");
      if (userEmail && userFirstName && userSecondName && isAdmin) {
        sendEmail(
          undefined,
          "Vaša rezervácia bola zrušená",
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
          "USER_DELETE_RES"
        );
      }
    } catch (error) {
      console.error("Error leaving training: ", error);
      alert(
        error instanceof TrainingError
          ? error.message
          : "Pri zrušení rezervácie došlo k chybe."
      );
    } finally {
      // No refetch: the week listener repaints on its own.
      setVerifyLoadingState(LoaderState.Finished);
    }
  };

  const handleEdit = (training: Training) => {
    setEditTraining(training);
    setIsEditModalOpen(true); // Open the edit modal
  };

  /**
   * The club confirms its own attendance.
   *
   * This used to be an admin action, with a link e-mailed to the resort — which
   * meant somebody had to chase every booking. The training flips to confirmed
   * once every club on it has confirmed.
   */
  const handleConfirmAttendance = async (trainingId: string) => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;

    try {
      setVerifyLoadingState(LoaderState.Loading);
      await confirmAttendance(trainingId, uid);
    } catch (error) {
      console.error("Error confirming attendance: ", error);
      alert(
        error instanceof TrainingError
          ? error.message
          : "Ucast sa nepodarilo potvrdit."
      );
    } finally {
      setVerifyLoadingState(LoaderState.Finished);
    }
  };

  /** Marks the club present on the day of the training. */
  const handleCheckIn = async (trainingId: string, attended: boolean) => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;

    try {
      await checkIn(trainingId, uid, attended);
    } catch (error) {
      console.error("Error checking in: ", error);
      alert("Prichod sa nepodarilo oznacit.");
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

  const handleAddToTrainingSubmit = async (formData: {
    racers: number;
    coaches?: number;
  }) => {
    if (!addToTrainingSession) return;

    const { date, session, course, lineNumber } = addToTrainingSession;
    const uid = localStorage.getItem("userId");
    const userEmail = localStorage.getItem("userEmail");
    const userFirstName = localStorage.getItem("userFirstName");
    const userSecondName = localStorage.getItem("userSecondName");
    const ZSL_code = localStorage.getItem("userZSL_code") || "";

    if (!uid || !userEmail || !userFirstName || !userSecondName) {
      console.error("User information is missing. Cannot add to training.");
      return;
    }

    try {
      setVerifyLoadingState(LoaderState.Loading);

      const trainingId = slotId({
        resortId,
        courseId: course,
        date,
        session,
        lineNumber,
      });

      // The capacity check happens inside the transaction, against the
      // participants it reads there. The old code subtracted from a number the
      // modal had captured when it opened.
      await joinTraining(
        trainingId,
        {
          uid,
          sportClub: localStorage.getItem("userSportClub"),
          firstName: userFirstName,
          secondName: userSecondName,
          email: userEmail,
          tel_number: localStorage.getItem("userTel_number"),
          racers: formData.racers,
          coaches: formData.coaches ?? 0,
        },
        individualLineCapacities[course]
      );

      const promoCodes = await fetchPromoCodes(resortId, ZSL_code);
      const promoCodesString = promoCodes.map((promo) => promo.code).join(",");
      await deletePromoCodes(resortId, promoCodes);

      sendEmail(
        trainingId,
        `Uspesna rezervacia treningu na ${date}`,
        userEmail,
        undefined,
        course,
        date,
        session.startTime,
        session.endTime,
        lineNumber,
        formData.racers,
        undefined,
        undefined,
        undefined,
        promoCodesString,
        userFirstName,
        userSecondName,
        undefined,
        undefined,
        "USER_ADDED_TO_TRAINING"
      );

      setIsAddToTrainingModalOpen(false);
      setAddToTrainingSession(null);
      alert("Boli ste pridani na trening.");
    } catch (error) {
      console.error("Error adding to training: ", error);
      alert(
        error instanceof TrainingError
          ? error.message
          : "Pri pridavani na trening doslo k chybe."
      );
    } finally {
      setVerifyLoadingState(LoaderState.Finished);
    }
  };

  const handleCloseTrack = async (
    course: string,
    lineNumber: number,
    date: string,
    reason: string,
    session: { startTime: string; endTime: string } | null
  ) => {
    try {
      // A whole-day closure and a single-block one are the same document with
      // a different scope, so one query serves both.
      await setDoc(
        doc(
          db,
          "closures",
          closureId(resortId, course, date, lineNumber, session?.startTime)
        ),
        {
          resortId,
          courseId: course,
          date,
          lineNumber,
          scope: session ? "session" : "day",
          session,
          startAt: Timestamp.fromDate(
            new Date(`${date}T${session?.startTime ?? "00:00"}:00`)
          ),
          reason,
          closedAt: new Date(),
          closedBy: localStorage.getItem("userId"),
        }
      );
    } catch (error) {
      console.error("Error closing track: ", error);
      alert("Trat sa nepodarilo zavriet.");
    }
  };

  const handleOpenTrack = async (
    course: string,
    lineNumber: number,
    date: string,
    /** Omitted for a whole-day closure, given for a single block. */
    startTime?: string
  ) => {
    try {
      await deleteDoc(
        doc(
          db,
          "closures",
          closureId(resortId, course, date, lineNumber, startTime)
        )
      );
    } catch (error) {
      console.error("Error reopening track: ", error);
      alert("Trat sa nepodarilo otvorit.");
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
      // Participants are keyed by Auth uid in the new model.
      uid: viewerUid,
    }),
    [isLoggedIn, isAdmin, viewerUid]
  );

  const trainingFor = useCallback(
    (date: string, startTime: string, endTime: string, lineNumber: number) =>
      bySlot.get(slotKey(date, startTime, endTime, lineNumber)),
    [bySlot]
  );

  const closedTrackFor = useCallback(
    (lineNumber: number, date: string) => {
      const closure = closureBySlot.get(`${date}_ALL_${lineNumber}`);
      return closure ? { reason: closure.reason ?? "" } : undefined;
    },
    [closureBySlot]
  );

  const closureForSessionFor = useCallback(
    (lineNumber: number, date: string) => (startTime: string) => {
      const closure = closureBySlot.get(`${date}_${startTime}_${lineNumber}`);
      return closure ? { reason: closure.reason ?? "" } : undefined;
    },
    [closureBySlot]
  );

  const sessionsForSelectedCourse = useMemo(() => {
    if (!selectedCourse) return [];
    const days = (seasons[selectedCourse] ?? []).flatMap((s) =>
      s.weeks.flatMap((w) => w.days)
    );
    return days.find((d) => d.timeSessions?.length)?.timeSessions ?? [];
  }, [seasons, selectedCourse]);

  const dayLabel = useCallback(
    (day: Day) => `${day.dayOfWeek[lang]}: ${formatDate(day.date)}`,
    [lang]
  );

  const calendarActions = useMemo<CalendarActions>(
    () => ({
      onReserve: (date, session, lineNumber) =>
        handleSessionClick(date, session, selectedCourse ?? "", lineNumber),
      onEdit: (training) => handleEdit(training),
      onLeaveOrCancel: (training) => handleLeaveOrCancel(training),
      onShowDetails: (training) => {
        setDetailsTraining(training);
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
      onConfirm: (trainingId) => handleConfirmAttendance(trainingId),
      onCheckIn: (trainingId, attended) =>
        handleCheckIn(trainingId, attended),
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
      onOpenBlock: (lineNumber, date, startTime) =>
        handleOpenTrack(selectedCourse ?? "", lineNumber, date, startTime),
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
                  closureForSessionFor={closureForSessionFor}
                  trainingFor={trainingFor}
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
          {isEditModalOpen && editTraining && (
            <EditReservationModal
              training={editTraining}
              individualLineCapacity={
                individualLineCapacities[editTraining.courseId] || 0
              }
              onClose={() => setIsEditModalOpen(false)}
              isLoggedIn={isLoggedIn}
              isAdmin={isAdmin}
              setVerifyLoadingState={setVerifyLoadingState}
            />
          )}

          {isDetailsModalOpen && detailsTraining && (
            <ReservationDetailsModal
              training={detailsTraining}
              onClose={() => setIsDetailsModalOpen(false)}
            />
          )}

          {isCloseModalOpen && closeTrackDetails && (
            <CloseTrackModal
              isOpen={isCloseModalOpen}
              timeSessions={sessionsForSelectedCourse}
              onClose={() => setIsCloseModalOpen(false)}
              onSubmit={(reason, session) => {
                handleCloseTrack(
                  closeTrackDetails.course,
                  closeTrackDetails.lineNumber,
                  closeTrackDetails.date,
                  reason,
                  session
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
