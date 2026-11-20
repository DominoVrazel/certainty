/**
 * The maintenance ruleset used during the migration window.
 *
 * Run with:  node --test tests/rules-maintenance.test.mjs   (emulator running)
 *
 * This is the half of read-only mode that actually holds. The frontend flag
 * only hides buttons, and a tab opened before the window is still running the
 * old bundle — so if these tests pass and the deploy happens, a stale tab
 * cannot write either.
 */
import { test, before, after, describe } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const PROJECT_ID = "certaintyapp-maintenance-test";
const CLUB = "club-alpha-uid";
const ADMIN = "admin-uid";

let env, anon, club, adminUser;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules.maintenance", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  anon = env.unauthenticatedContext().firestore();
  club = env.authenticatedContext(CLUB, { email: "alpha@club.test" }).firestore();
  adminUser = env
    .authenticatedContext(ADMIN, { email: "admin@resort.test" })
    .firestore();
});

after(async () => {
  await env?.cleanup();
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", CLUB), { email: "alpha@club.test", isAdmin: false });
    await setDoc(doc(db, "users", ADMIN), { email: "admin@resort.test", isAdmin: true });
    await setDoc(doc(db, "resorts", "Bachledka"), { name: "Bachledka" });
    await setDoc(doc(db, "trainings", "t1"), { resortId: "Bachledka", date: "2099-01-10" });
    await setDoc(doc(db, "closures", "c1"), { resortId: "Bachledka" });
    await setDoc(doc(db, "reservations", "r1"), { user: { email: "alpha@club.test" } });
  });
}

describe("the calendar still renders", () => {
  test("anyone can read the resort catalogue", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(anon, "resorts", "Bachledka")));
  });

  test("anyone can read trainings and closures", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(anon, "trainings", "t1")));
    await assertSucceeds(getDoc(doc(anon, "closures", "c1")));
  });

  test("the old collections stay readable too", async () => {
    // The old bundle is still being served to tabs opened before the window.
    await seed();
    await assertSucceeds(getDoc(doc(anon, "reservations", "r1")));
  });

  test("a signed-in club can still read its own profile", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(club, "users", CLUB)));
  });

  test("but not somebody else's", async () => {
    await seed();
    await assertFails(getDoc(doc(club, "users", ADMIN)));
  });
});

describe("nothing can be written", () => {
  test("a club cannot book", async () => {
    await seed();
    await assertFails(
      setDoc(doc(club, "trainings", "t2"), { resortId: "Bachledka" })
    );
  });

  test("a club cannot change a training it is on", async () => {
    await seed();
    await assertFails(updateDoc(doc(club, "trainings", "t1"), { note: "x" }));
  });

  test("a club cannot cancel", async () => {
    await seed();
    await assertFails(deleteDoc(doc(club, "trainings", "t1")));
  });

  test("not even an admin can write", async () => {
    // The point of the window: the admin is the one running the migration,
    // and a write through the app would land in the collection being copied.
    await seed();
    await assertFails(updateDoc(doc(adminUser, "trainings", "t1"), { note: "x" }));
    await assertFails(deleteDoc(doc(adminUser, "closures", "c1")));
    await assertFails(
      updateDoc(doc(adminUser, "resorts", "Bachledka"), { name: "x" })
    );
  });

  test("the old collections are frozen as well", async () => {
    // A tab running the old bundle writes here, not to `trainings`.
    await seed();
    await assertFails(updateDoc(doc(club, "reservations", "r1"), { status: "x" }));
    await assertFails(deleteDoc(doc(club, "reservations", "r1")));
  });

  test("a club cannot edit its own profile either", async () => {
    await seed();
    await assertFails(updateDoc(doc(club, "users", CLUB), { tel_number: "1" }));
  });

  test("the token collections stay sealed", async () => {
    await seed();
    await assertFails(getDoc(doc(anon, "user_sessions", "s1")));
    await assertFails(
      setDoc(doc(anon, "verify_user_sessions", "s1"), { uuid: "x" })
    );
  });
});
