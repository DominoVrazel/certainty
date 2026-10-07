/**
 * Firestore security-rules matrix.
 *
 * Run with:  npm run test:rules
 *
 * These exist so the rules can be tightened without breaking the app. Several
 * real flows read and write while LOGGED OUT, which a naive "require auth" rule
 * would kill silently:
 *
 *   - loginUser() queries `users` by email BEFORE signInWithEmailAndPassword
 *     (src/services/FirebaseService.ts), so login itself needs that read.
 *   - VerifyUser.tsx reads `users` + `verify_user_sessions` and WRITES to
 *     `users`, all unauthenticated, when someone clicks a verification link.
 *   - LoginModal.tsx writes `user_sessions` unauthenticated to start a reset.
 *
 * Each of those is marked FLOW below. A test that flips from pass to fail tells
 * you exactly which user journey a rules change just broke.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
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
  addDoc,
  query,
  where,
} from "firebase/firestore";

const PROJECT_ID = "certaintyapp-rules-test";

const CLUB_UID = "club-alpha-uid";
const OTHER_UID = "club-beta-uid";
const ADMIN_UID = "admin-uid";
const PENDING_UID = "club-pending-uid";

let env;
let anon, club, other, adminUser, pending;

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
  club = env.authenticatedContext(CLUB_UID, { email: "alpha@club.test" }).firestore();
  other = env.authenticatedContext(OTHER_UID, { email: "beta@club.test" }).firestore();
  adminUser = env.authenticatedContext(ADMIN_UID, { email: "admin@resort.test" }).firestore();
  pending = env.authenticatedContext(PENDING_UID, { email: "pending@club.test" }).firestore();
});

after(async () => {
  await env?.cleanup();
});

/** Seeds fixtures with rules disabled, so setup never depends on the rules. */
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "users", CLUB_UID), {
      email: "alpha@club.test",
      firstName: "Alpha",
      secondName: "Club",
      sportClub: "Alpha",
      isAdmin: false,
      isVerified: true,
    });
    await setDoc(doc(db, "users", OTHER_UID), {
      email: "beta@club.test",
      firstName: "Beta",
      secondName: "Club",
      sportClub: "Beta",
      isAdmin: false,
      isVerified: true,
    });
    await setDoc(doc(db, "users", ADMIN_UID), {
      email: "admin@resort.test",
      firstName: "Admin",
      secondName: "Resort",
      sportClub: "Resort",
      isAdmin: true,
      isVerified: true,
    });

    await setDoc(doc(db, "users", PENDING_UID), {
      email: "pending@club.test",
      firstName: "Pending",
      secondName: "Club",
      sportClub: "Pending",
      isAdmin: false,
      isVerified: false,
    });

    await setDoc(doc(db, "resorts", "Bachledka"), {
      name: "Bachledka",
      email: "resort@test.sk",
    });
    await setDoc(doc(db, "resorts", "Bachledka", "courses", "C1"), {
      name: "Course 1",
      capacity: 2,
      individualLineCapacity: 50,
      timeSessions: [{ startTime: "09:00", endTime: "11:00" }],
    });
    await setDoc(
      doc(db, "resorts", "Bachledka", "courses", "C1", "seasons", "S1"),
      { season: "2026/2027", weeks: [] }
    );

    await setDoc(doc(db, "reservations", "res-owned-by-club"), {
      date: "2099-01-10",
      session: { startTime: "09:00", endTime: "11:00" },
      lineNumber: 1,
      discipline: "Slalom",
      category: "Žiaci",
      status: "vytvorená",
      availableRacers: 40,
      user: { email: "alpha@club.test", sportClub: "Alpha", ownRacers: 10 },
      reservationDetails: { resort: "Bachledka", course: "C1" },
    });

    await setDoc(doc(db, "closedTracks", "C1_1_2099-01-11"), {
      course: "C1",
      lineNumber: 1,
      date: "2099-01-11",
      reason: "údržba",
    });

    await setDoc(doc(db, "user_sessions", "sess-1"), {
      uuid: "reset-uuid-1",
      email: "alpha@club.test",
    });
    await setDoc(doc(db, "verify_user_sessions", "vsess-1"), {
      uuid: "verify-uuid-1",
      email: "alpha@club.test",
    });
  });
}

describe("public catalogue", () => {
  test("FLOW anonymous visitor can list resorts (landing page)", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(anon, "resorts")));
  });

  test("FLOW anonymous visitor can read courses and seasons (calendar)", async () => {
    await seed();
    await assertSucceeds(
      getDocs(collection(anon, "resorts", "Bachledka", "courses"))
    );
    await assertSucceeds(
      getDocs(
        collection(anon, "resorts", "Bachledka", "courses", "C1", "seasons")
      )
    );
  });

  test("anonymous visitor cannot create a resort", async () => {
    await seed();
    await assertFails(setDoc(doc(anon, "resorts", "Fake"), { name: "Fake" }));
  });

  test("ordinary club cannot create or delete a resort", async () => {
    await seed();
    await assertFails(setDoc(doc(club, "resorts", "Fake"), { name: "Fake" }));
    await assertFails(deleteDoc(doc(club, "resorts", "Bachledka")));
  });

  // Automatic confirmation lives on the resort document, so the rule that
  // guards the catalogue is also the rule that guards the setting. Worth its
  // own test: a club that could flip it would be confirming its own bookings
  // at every resort.
  test("ordinary club cannot switch automatic confirmation", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "resorts", "Bachledka"), {
        autoConfirmReservations: false,
      })
    );
  });

  test("admin can switch automatic confirmation", async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(adminUser, "resorts", "Bachledka"), {
        autoConfirmReservations: false,
      })
    );
  });

  test("admin can manage resorts, courses and seasons", async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(adminUser, "resorts", "New"), { name: "New" })
    );
    await assertSucceeds(
      setDoc(doc(adminUser, "resorts", "Bachledka", "courses", "C2"), {
        name: "Course 2",
      })
    );
  });
});

describe("users collection", () => {
  test("login cannot look up accounts by email while logged out", async () => {
    // loginUser() now signs in first and reads its own document by uid, so
    // this query must be refused. Allowing it would let anyone check which
    // e-mail addresses are registered.
    await seed();
    await assertFails(
      getDocs(
        query(
          collection(anon, "users"),
          where("email", "==", "alpha@club.test")
        )
      )
    );
  });

  test("FLOW after signing in, a club can read its own profile by uid", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(club, "users", CLUB_UID)));
  });

  test("a club can read its own profile", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(club, "users", CLUB_UID)));
  });

  test("a club can edit its own profile", async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(club, "users", CLUB_UID), { tel_number: "+421900000000" })
    );
  });

  test("a club cannot edit another club's profile", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "users", OTHER_UID), { sportClub: "Hijacked" })
    );
  });

  test("a club cannot make itself an admin", async () => {
    await seed();
    await assertFails(
      updateDoc(doc(club, "users", CLUB_UID), { isAdmin: true })
    );
  });

  test("an anonymous visitor cannot dump the whole users collection", async () => {
    await seed();
    await assertFails(getDocs(collection(anon, "users")));
  });

  test("admin can list all users (admin screen)", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(adminUser, "users")));
  });
});

describe("reservations", () => {
  test("FLOW anyone can read the calendar", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(anon, "reservations")));
  });

  test("a logged-in club can create a reservation", async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(club, "reservations", "res-new"), {
        date: "2099-02-01",
        session: { startTime: "09:00", endTime: "11:00" },
        lineNumber: 2,
        discipline: "Slalom",
        category: "Žiaci",
        status: "vytvorená",
        availableRacers: 45,
        user: { email: "alpha@club.test", sportClub: "Alpha", ownRacers: 5 },
        reservationDetails: { resort: "Bachledka", course: "C1" },
      })
    );
  });

  test("an anonymous visitor cannot create a reservation", async () => {
    await seed();
    await assertFails(
      setDoc(doc(anon, "reservations", "res-anon"), { date: "2099-02-01" })
    );
  });

  test("a club cannot delete another club's reservation", async () => {
    await seed();
    await assertFails(deleteDoc(doc(other, "reservations", "res-owned-by-club")));
  });

  test("the owning club can delete its own reservation", async () => {
    await seed();
    await assertSucceeds(
      deleteDoc(doc(club, "reservations", "res-owned-by-club"))
    );
  });

  test("admin can delete any reservation", async () => {
    await seed();
    await assertSucceeds(
      deleteDoc(doc(adminUser, "reservations", "res-owned-by-club"))
    );
  });

  test("FLOW a club can join an existing training", async () => {
    await seed();
    await assertSucceeds(
      setDoc(
        doc(other, "reservations", "res-owned-by-club", "addedUsers", "beta@club.test"),
        { email: "beta@club.test", sportClub: "Beta", ownRacers: 4 }
      )
    );
  });

  test("a club can remove only its own joined entry", async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          "reservations",
          "res-owned-by-club",
          "addedUsers",
          "beta@club.test"
        ),
        { email: "beta@club.test", sportClub: "Beta", ownRacers: 4 }
      );
    });
    await assertSucceeds(
      deleteDoc(
        doc(other, "reservations", "res-owned-by-club", "addedUsers", "beta@club.test")
      )
    );
  });
});

describe("closed tracks", () => {
  test("FLOW anyone can read closures (calendar renders them)", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(anon, "closedTracks")));
  });

  test("an ordinary club cannot close a track", async () => {
    await seed();
    await assertFails(
      setDoc(doc(club, "closedTracks", "C1_2_2099-01-12"), {
        course: "C1",
        lineNumber: 2,
        date: "2099-01-12",
        reason: "nope",
      })
    );
  });

  test("admin can close and reopen a track", async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(adminUser, "closedTracks", "C1_2_2099-01-12"), {
        course: "C1",
        lineNumber: 2,
        date: "2099-01-12",
        reason: "údržba",
      })
    );
    await assertSucceeds(
      deleteDoc(doc(adminUser, "closedTracks", "C1_1_2099-01-11"))
    );
  });
});

describe("password reset and verification sessions", () => {
  // Both collections are now owned entirely by Cloud Functions, which use the
  // Admin SDK and bypass these rules. No client may touch them at all:
  //   - startPasswordReset / startEmailVerification create the tokens
  //   - resetPassword / verifyUserAccount consume them
  // Anyone able to read a token could take over the matching account.

  test("a client cannot create a reset token", async () => {
    await seed();
    await assertFails(
      addDoc(collection(anon, "user_sessions"), {
        uuid: "reset-uuid-2",
        email: "alpha@club.test",
      })
    );
  });

  test("reset tokens are not readable — they would allow account takeover", async () => {
    await seed();
    await assertFails(getDocs(collection(anon, "user_sessions")));
    await assertFails(getDoc(doc(club, "user_sessions", "sess-1")));
    await assertFails(getDoc(doc(adminUser, "user_sessions", "sess-1")));
  });

  test("verification tokens are not readable, in bulk or by uuid", async () => {
    await seed();
    await assertFails(getDocs(collection(anon, "verify_user_sessions")));
    await assertFails(
      getDocs(
        query(
          collection(anon, "verify_user_sessions"),
          where("uuid", "==", "verify-uuid-1")
        )
      )
    );
  });

  test("an unverified club cannot verify itself", async () => {
    // Only verifyUserAccount (Admin SDK) may flip this flag — otherwise
    // registration e-mail verification could be skipped entirely.
    await seed();
    await assertFails(
      updateDoc(doc(pending, "users", PENDING_UID), { isVerified: true })
    );
  });
});
