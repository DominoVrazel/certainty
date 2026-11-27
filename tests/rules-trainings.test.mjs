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
// Inside and outside the two-hour window the clubs have before the start.
const IN_THREE_HOURS = new Date(Date.now() + 3 * 60 * 60 * 1000);
const IN_ONE_HOUR = new Date(Date.now() + 60 * 60 * 1000);

// A session that started an hour ago and runs for another hour.
const RUNNING_START = new Date(Date.now() - 60 * 60 * 1000);
const RUNNING_END = new Date(Date.now() + 60 * 60 * 1000);

/** Today at the given hour, UTC — the day the rules compare against. */
function todayAt(hour) {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}
// 09:00–11:00 today. Long over by the evening, but still today.
const EARLIER_TODAY_START = todayAt(9);
const EARLIER_TODAY_END = todayAt(11);
// 09:00–11:00 yesterday, which is the first day that must stay frozen.
const YESTERDAY_START = new Date(todayAt(9).getTime() - 24 * 60 * 60 * 1000);
const YESTERDAY_END = new Date(todayAt(11).getTime() - 24 * 60 * 60 * 1000);

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

    // The rules read the booking and change deadlines off the resort, so it
    // has to exist. No fields: the defaults are what matters here, and they
    // are what every resort document actually looks like today.
    await setDoc(doc(db, "resorts", "Bachledka"), { name: "Bachledka" });

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

    // Accepted by the resort by hand, and therefore locked to the clubs.
    await setDoc(doc(db, "trainings", "future-confirmed"), {
      ...trainingDoc({
        startAt: FUTURE,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      }),
      status: "confirmed",
      confirmedCount: 1,
      confirmedBy: "resort",
    });

    // Confirmed because the resort confirms everything automatically. Same
    // status, no decision behind it, so it must NOT be locked.
    await setDoc(doc(db, "trainings", "future-autoconfirmed"), {
      ...trainingDoc({
        startAt: FUTURE,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      }),
      status: "confirmed",
      confirmedCount: 1,
      confirmedBy: "auto",
    });

    // Written before `confirmedBy` existed. Reads as "not by hand".
    await setDoc(doc(db, "trainings", "future-legacy-confirmed"), {
      ...trainingDoc({
        startAt: FUTURE,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      }),
      status: "confirmed",
      confirmedCount: 1,
    });

    // Three hours off: still the club's to change.
    await setDoc(
      doc(db, "trainings", "soon-open"),
      trainingDoc({
        startAt: IN_THREE_HOURS,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      })
    );

    // One hour off: inside the two-hour cut-off.
    await setDoc(
      doc(db, "trainings", "soon-closed"),
      trainingDoc({
        startAt: IN_ONE_HOUR,
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

    // In progress right now: started an hour ago, ends in an hour.
    await setDoc(doc(db, "trainings", "running"), {
      ...trainingDoc({
        startAt: RUNNING_START,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      }),
      endAt: RUNNING_END,
    });

    // Earlier today: over, but still the day the resort is standing in.
    await setDoc(doc(db, "trainings", "earlier-today"), {
      ...trainingDoc({
        startAt: EARLIER_TODAY_START,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      }),
      endAt: EARLIER_TODAY_END,
    });

    // Yesterday morning: the first day that has to stay frozen.
    await setDoc(doc(db, "trainings", "yesterday"), {
      ...trainingDoc({
        startAt: YESTERDAY_START,
        participantUids: [CLUB],
        participants: { [CLUB]: participant("Alpha") },
      }),
      endAt: YESTERDAY_END,
    });

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

  // A resort closes for weather on the day itself. Requiring the training to
  // start in the future locked out the one person who needs to call it off.
  test("admin can cancel a training that is under way", async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(adminUser, "trainings", "running")));
  });

  test("a club still cannot drop out once the training has started", async () => {
    // That is a no-show, and check-in is what records it — deleting would
    // take the training away from everybody else on it.
    await seed();
    await assertFails(deleteDoc(doc(club, "trainings", "running")));
  });

  test("admin can cancel a training that finished earlier today", async () => {
    // "It did not happen" is usually noticed in the evening, not at 09:00.
    await seed();
    await assertSucceeds(deleteDoc(doc(adminUser, "trainings", "earlier-today")));
  });

  test("the day before is where it stops, even for an admin", async () => {
    await seed();
    await assertFails(deleteDoc(doc(adminUser, "trainings", "yesterday")));
  });

  test("a club cannot cancel a training that finished earlier today", async () => {
    await seed();
    await assertFails(deleteDoc(doc(club, "trainings", "earlier-today")));
  });
});

describe("the two hours before a training", () => {
  // The screen used to close editing for the whole calendar day while these
  // rules allowed a write until the training began — the visible rule and the
  // enforced one disagreed by up to a working day. One rule now, measured
  // from the start of the session.
  test("a club can still change its booking three hours out", async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(club, "trainings", "soon-open"), { note: "este sa da" })
    );
  });

  test("but not one hour out", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "trainings", "soon-closed"), { note: "uz nie" })
    );
  });

  test("and it cannot cancel inside the two hours either", async () => {
    await seed();
    await assertFails(deleteDoc(doc(club, "trainings", "soon-closed")));
  });

  test("it can still cancel three hours out", async () => {
    await seed();
    await assertSucceeds(deleteDoc(doc(club, "trainings", "soon-open")));
  });

  test("the resort is not subject to the cut-off", async () => {
    // Weather turns an hour before the session; somebody has to be able to
    // act on it.
    await seed();
    await assertSucceeds(
      updateDoc(doc(adminUser, "trainings", "soon-closed"), { note: "zmena" })
    );
    await assertSucceeds(deleteDoc(doc(adminUser, "trainings", "soon-closed")));
  });
});

describe("the deadlines are the resort's to set", () => {
  /** Puts the two cut-offs on the resort, as the admin screen would. */
  async function withCutoffs(fields) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "resorts", "Bachledka"), {
        name: "Bachledka",
        ...fields,
      });
    });
  }

  test("a longer change window closes a booking that was still open", async () => {
    // Three hours out is fine by default. A resort that wants four hours'
    // notice says so, and the same booking is shut.
    await seed();
    await withCutoffs({ changeCutoffMode: "minutes", changeCutoffMinutes: 240 });
    await assertFails(
      updateDoc(doc(club, "trainings", "soon-open"), { note: "uz nie" })
    );
  });

  test("a shorter one opens a booking that was closed", async () => {
    await seed();
    await withCutoffs({ changeCutoffMode: "minutes", changeCutoffMinutes: 30 });
    await assertSucceeds(
      updateDoc(doc(club, "trainings", "soon-closed"), { note: "este ano" })
    );
  });

  test("the day mode closes the whole day of the training", async () => {
    await seed();
    await withCutoffs({ changeCutoffMode: "day" });
    await assertFails(
      updateDoc(doc(club, "trainings", "soon-open"), { note: "dnes uz nie" })
    );
  });

  test("the resort is still exempt whatever it sets", async () => {
    await seed();
    await withCutoffs({ changeCutoffMode: "minutes", changeCutoffMinutes: 600 });
    await assertSucceeds(
      updateDoc(doc(adminUser, "trainings", "soon-open"), { note: "stredisko" })
    );
  });

  test("booking closes on the day by default", async () => {
    // What the app did before any of this was configurable.
    await seed();
    await assertFails(
      setDoc(doc(club, "trainings", "today-new"), {
        ...trainingDoc({
          startAt: IN_THREE_HOURS,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        }),
      })
    );
  });

  test("and a resort can open it to a couple of hours before", async () => {
    await seed();
    await withCutoffs({ bookingCutoffMode: "minutes", bookingCutoffMinutes: 120 });
    await assertSucceeds(
      setDoc(doc(club, "trainings", "today-new"), {
        ...trainingDoc({
          startAt: IN_THREE_HOURS,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        }),
      })
    );
  });

  test("joining keeps the booking deadline, not none at all", async () => {
    // Joining somebody else's training is booking by another name. It used
    // to have no deadline whatsoever: a club could join a session that was
    // already under way.
    await seed();
    await withCutoffs({ bookingCutoffMode: "minutes", bookingCutoffMinutes: 120 });
    await assertSucceeds(
      updateDoc(doc(other, "trainings", "soon-open"), {
        participantUids: [CLUB, OTHER],
        participantCount: 2,
      })
    );
  });

  test("and it closes with it", async () => {
    await seed();
    await withCutoffs({ bookingCutoffMode: "minutes", bookingCutoffMinutes: 120 });
    await assertFails(
      updateDoc(doc(other, "trainings", "soon-closed"), {
        participantUids: [CLUB, OTHER],
        participantCount: 2,
      })
    );
  });

  test("nobody joins a training that has already started", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(other, "trainings", "running"), {
        participantUids: [CLUB, OTHER],
        participantCount: 2,
      })
    );
  });

  test("an admin may book on the day regardless", async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(adminUser, "trainings", "today-admin"), {
        ...trainingDoc({
          startAt: IN_THREE_HOURS,
          participantUids: [CLUB],
          participants: { [CLUB]: participant("Alpha") },
        }),
      })
    );
  });
});

describe("a confirmed booking belongs to the resort", () => {
  // Confirming says the resort has planned trails and lifts around this
  // session. Before the rework that was an admin action and it locked the
  // club out; the lock came back with it, because without it confirming
  // decided nothing at all.
  test("a club cannot edit a training the resort has confirmed", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "trainings", "future-confirmed"), { note: "zmena" })
    );
  });

  test("a club cannot cancel one either", async () => {
    await seed();
    await assertFails(deleteDoc(doc(club, "trainings", "future-confirmed")));
  });

  test("but the admin can still edit it", async () => {
    // The point of the lock is that changes go through the resort, not that
    // the booking is frozen for everybody.
    await seed();
    await assertSucceeds(
      updateDoc(doc(adminUser, "trainings", "future-confirmed"), {
        note: "presun na trať 2",
      })
    );
  });

  test("and the admin can still cancel it", async () => {
    await seed();
    await assertSucceeds(
      deleteDoc(doc(adminUser, "trainings", "future-confirmed"))
    );
  });

  test("the admin can take the confirmation back", async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(adminUser, "trainings", "future-confirmed"), {
        status: "created",
        confirmedCount: 0,
      })
    );
  });

  test("automatic confirmation does not lock anything", async () => {
    // The default setting. A booking is confirmed in the instant it is
    // written, so locking on status alone took a club's own booking away
    // from it before it could correct a typo.
    await seed();
    await assertSucceeds(
      updateDoc(doc(club, "trainings", "future-autoconfirmed"), { note: "ok" })
    );
  });

  test("and the club can still cancel an automatically confirmed one", async () => {
    await seed();
    await assertSucceeds(
      deleteDoc(doc(club, "trainings", "future-autoconfirmed"))
    );
  });

  test("a booking from before the distinction stays editable", async () => {
    // Missing `confirmedBy` must read as "not by hand", not blow up the rule.
    await seed();
    await assertSucceeds(
      updateDoc(doc(club, "trainings", "future-legacy-confirmed"), {
        note: "ok",
      })
    );
  });

  test("a club can still change an unconfirmed booking", async () => {
    // The lock must not leak onto everything else.
    await seed();
    await assertSucceeds(
      updateDoc(doc(club, "trainings", "future-open"), { note: "ok" })
    );
  });

  test("another club can still join a confirmed training", async () => {
    // Joining leaves it unconfirmed again, which is what puts it back in
    // front of the admin — so it must not be blocked by the lock.
    await seed();
    await assertSucceeds(
      updateDoc(doc(other, "trainings", "future-confirmed"), {
        participantUids: [CLUB, OTHER],
        status: "created",
        confirmedCount: 1,
      })
    );
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

describe("checking in", () => {
  test("a club can mark itself present once the session has started", async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(club, "trainings", "running"), {
        [`participants.${CLUB}.attended`]: true,
        [`participants.${CLUB}.checkedInAt`]: new Date(),
      })
    );
  });

  test("checking in cannot be used to rewrite the racer count", async () => {
    // History feeds the monthly report, so the carve-out must not become a
    // way to edit a session that has already started.
    await seed();
    await assertFails(
      updateDoc(doc(club, "trainings", "running"), {
        [`participants.${CLUB}.attended`]: true,
        racersTotal: 999,
      })
    );
  });

  test("a club not on the training cannot check in", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(other, "trainings", "running"), {
        [`participants.${OTHER}.attended`]: true,
      })
    );
  });

  test("a finished training still cannot be touched", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "trainings", "past"), {
        [`participants.${CLUB}.attended`]: true,
      })
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
