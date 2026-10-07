/**
 * Security-rules matrix for the new `trainings` / `closures` model.
 *
 * Run with:  npm run test:rules
 *
 * The behaviour these pin down is the point of the rework:
 *   - a club leaving does not disturb the others on the same training,
 *   - nobody can edit a training that has already happened,
 *   - a club cannot book, edit or cancel in somebody else's name.
 */
import { test, before, after, describe } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  deleteField,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

const PROJECT_ID = "certaintyapp-trainings-test";

const CLUB = "club-alpha-uid";
const OTHER = "club-beta-uid";
const ADMIN = "admin-uid";

const FUTURE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

let env;
let anon, club, other, adminUser;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  anon = env.unauthenticatedContext().firestore();
  club = env.authenticatedContext(CLUB, { email: "alpha@club.test" }).firestore();
  other = env.authenticatedContext(OTHER, { email: "beta@club.test" }).firestore();
  adminUser = env
    .authenticatedContext(ADMIN, { email: "admin@resort.test" })
    .firestore();
});

after(async () => {
  await env?.cleanup();
});

function trainingDoc({ startAt, participantUids, participants }) {
  return {
    resortId: "Bachledka",
    courseId: "C1",
    date: "2099-01-10",
    session: { startTime: "09:00", endTime: "11:00" },
    lineNumber: 1,
    startAt,
    endAt: startAt,
    discipline: "Slalom",
    category: "Žiaci",
    status: "created",
    note: "",
    participants,
    participantUids,
    clubs: ["Alpha"],
    racersTotal: 10,
    coachesTotal: 0,
    participantCount: participantUids.length,
    confirmedCount: 0,
    createdBy: participantUids[0],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const participant = (club) => ({
  sportClub: club,
  racers: 5,
  coaches: 0,
  role: "owner",
  attended: null,
  confirmedAt: null,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "users", CLUB), {
      email: "alpha@club.test",
      isAdmin: false,
      isVerified: true,
    });
    await setDoc(doc(db, "users", OTHER), {
      email: "beta@club.test",
      isAdmin: false,
      isVerified: true,
    });
    await setDoc(doc(db, "users", ADMIN), {
      email: "admin@resort.test",
      isAdmin: true,
      isVerified: true,
    });

    // A future training owned by CLUB, with OTHER joined.
    await setDoc(
      doc(db, "trainings", "future-shared"),
      trainingDoc({
        startAt: FUTURE,
        participantUids: [CLUB, OTHER],
        participants: {
          [CLUB]: participant("Alpha"),
          [OTHER]: { ...participant("Beta"), role: "joined" },
        },
      })
    );

    // A future training nobody has joined yet.
    await setDoc(
      doc(db, "trainings", "future-open"),
      trainingDoc({
        startAt: FUTURE,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      })
    );

    // One that has already happened.
    await setDoc(
      doc(db, "trainings", "past"),
      trainingDoc({
        startAt: PAST,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      })
    );

    await setDoc(doc(db, "closures", "Bachledka__C1__2099-01-11__ALL__L1"), {
      resortId: "Bachledka",
      courseId: "C1",
      date: "2099-01-11",
      lineNumber: 1,
      scope: "day",
      reason: "údržba",
      startAt: FUTURE,
    });

    await setDoc(doc(db, "trainingsOrphanedParticipants", "legacy-1"), {
      legacyReservationId: "legacy-1",
      participants: [{ email: "someone@club.test", racers: 3 }],
    });
  });
}

describe("reading the calendar", () => {
  test("anyone may read trainings", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(anon, "trainings")));
    await assertSucceeds(getDoc(doc(anon, "trainings", "future-shared")));
  });

  test("anyone may read closures", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(anon, "closures")));
  });
});

describe("booking", () => {
  test("a signed-in club can create a future training it is part of", async () => {
    await seed();
    await assertSucceeds(
      setDoc(
        doc(club, "trainings", "Bachledka__C1__2099-03-01__0900__L2"),
        trainingDoc({
          startAt: FUTURE,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        })
      )
    );
  });

  test("an anonymous visitor cannot create a training", async () => {
    await seed();
    await assertFails(
      setDoc(
        doc(anon, "trainings", "Bachledka__C1__2099-03-02__0900__L2"),
        trainingDoc({
          startAt: FUTURE,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        })
      )
    );
  });

  test("a club cannot book in another club's name", async () => {
    await seed();
    await assertFails(
      setDoc(
        doc(other, "trainings", "Bachledka__C1__2099-03-03__0900__L2"),
        trainingDoc({
          startAt: FUTURE,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        })
      )
    );
  });

  test("nobody can create a training in the past", async () => {
    await seed();
    await assertFails(
      setDoc(
        doc(club, "trainings", "Bachledka__C1__2020-01-01__0900__L2"),
        trainingDoc({
          startAt: PAST,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        })
      )
    );
  });
});

describe("joining and leaving", () => {
  test("a club can add itself to an existing training", async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(other, "trainings", "future-open"), {
        [`participants.${OTHER}`]: { ...participant("Beta"), role: "joined" },
        participantUids: arrayUnion(OTHER),
        racersTotal: 15,
        participantCount: 2,
      })
    );
  });

  test("a club can remove itself without disturbing the others", async () => {
    // The whole point of the rework: leaving is a field delete on one shared
    // document, so the remaining clubs keep their training.
    await seed();
    await assertSucceeds(
      updateDoc(doc(other, "trainings", "future-shared"), {
        [`participants.${OTHER}`]: deleteField(),
        participantUids: arrayRemove(OTHER),
        racersTotal: 5,
        participantCount: 1,
      })
    );
  });

  test("a club cannot remove a different club", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(anon, "trainings", "future-shared"), {
        [`participants.${CLUB}`]: deleteField(),
        participantUids: arrayRemove(CLUB),
      })
    );
  });

  test("an anonymous visitor cannot join", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(anon, "trainings", "future-open"), {
        [`participants.${OTHER}`]: participant("Beta"),
        participantUids: arrayUnion(OTHER),
      })
    );
  });
});

describe("cancelling", () => {
  test("a participant can delete a future training", async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(club, "trainings", "future-open")));
  });

  test("an unrelated club cannot delete somebody else's training", async () => {
    await seed();
    await assertFails(deleteDoc(doc(anon, "trainings", "future-open")));
  });

  test("admin can delete any future training", async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(adminUser, "trainings", "future-shared")));
  });
});

describe("the past is frozen", () => {
  test("a participant cannot edit a training that has happened", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "trainings", "past"), { note: "spätná úprava" })
    );
  });

  test("not even an admin can edit a past training", async () => {
    // History feeds the monthly report, so it must not be rewritable at all.
    await seed();
    await assertFails(
      updateDoc(doc(adminUser, "trainings", "past"), { note: "spätná úprava" })
    );
  });

  test("a past training cannot be deleted", async () => {
    await seed();
    await assertFails(deleteDoc(doc(adminUser, "trainings", "past")));
  });

  test("a training cannot be moved into the past", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "trainings", "future-open"), { startAt: PAST })
    );
  });
});

describe("closures", () => {
  test("an ordinary club cannot close a track", async () => {
    await seed();
    await assertFails(
      setDoc(doc(club, "closures", "Bachledka__C1__2099-02-02__ALL__L1"), {
        resortId: "Bachledka",
        reason: "nope",
      })
    );
  });

  test("admin can close and reopen", async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(adminUser, "closures", "Bachledka__C1__2099-02-02__0900__L1"), {
        resortId: "Bachledka",
        courseId: "C1",
        date: "2099-02-02",
        lineNumber: 1,
        scope: "session",
        session: { startTime: "09:00", endTime: "11:00" },
        reason: "údržba",
      })
    );
    await assertSucceeds(
      deleteDoc(doc(adminUser, "closures", "Bachledka__C1__2099-01-11__ALL__L1"))
    );
  });
});

describe("orphaned participation records", () => {
  test("they are not readable by clubs or visitors", async () => {
    await seed();
    await assertFails(getDocs(collection(anon, "trainingsOrphanedParticipants")));
    await assertFails(
      getDoc(doc(club, "trainingsOrphanedParticipants", "legacy-1"))
    );
  });

  test("an admin may read them", async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(adminUser, "trainingsOrphanedParticipants", "legacy-1"))
    );
  });

  test("nobody may write them", async () => {
    await seed();
    await assertFails(
      setDoc(doc(adminUser, "trainingsOrphanedParticipants", "legacy-2"), {
        legacyReservationId: "legacy-2",
      })
    );
  });
});
