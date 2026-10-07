/**
 * Proves the booking model cannot double-book a slot.
 *
 * Production holds three slots with two bookings each, created a minute or two
 * apart by different clubs. Because the calendar keys bookings by slot, one of
 * each pair has been invisible in the UI ever since — including a training six
 * clubs had joined.
 *
 * The cause: creation did an unconditional `setDoc` with a random id and no
 * check. The fix is structural rather than a guard — the document id is derived
 * from the slot, so Firestore itself refuses the second write. That matters
 * because the Web SDK's transactions can only read a DocumentReference, never a
 * query, so a transaction cannot ask "is this slot free?" any other way.
 *
 * Run with:  npm run test:concurrency   (needs the emulators running)
 */
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";

const PROJECT_ID = "certaintyapp";
const ITERATIONS = 50;
const CAPACITY = 50;

/**
 * Each club gets its own signed-in client, because the rules require the writer
 * to be among the participants — running this unauthenticated would only prove
 * the rules reject it. This way the test exercises the real path: authorised
 * clients racing each other.
 */
async function signedInClient(label) {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: "fake-api-key" },
    `${label}-${Date.now()}-${Math.random()}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  const email = `concurrency-${label}-${Date.now()}-${Math.floor(
    Math.random() * 10000
  )}@e2e.test`;
  const cred = await createUserWithEmailAndPassword(auth, email, "Heslo123");
  return { db, uid: cred.user.uid, label };
}

const alpha = await signedInClient("alpha");
const beta = await signedInClient("beta");

// Slot ids are unique per run. Only a participant may delete a booking, so
// cleanup fails whenever the other client won the race — leftovers would then
// make the next run look like a double-booking failure.
const RUN = `${Date.now()}`;
// Cleanup uses a client that is allowed to delete; alpha owns what it creates.
const db = alpha.db;

let failures = 0;
const fail = (msg) => {
  console.error(`  ✖ ${msg}`);
  failures += 1;
};

/** The same transaction shape as createTraining in src/services/trainings.ts. */
async function createTraining(client, slotId, racers) {
  const ref = doc(client.db, "trainings", slotId);
  await runTransaction(client.db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) throw new Error("slot-taken");

    tx.set(ref, {
      resortId: "ConcurrencyTest",
      courseId: "C1",
      date: "2099-01-10",
      session: { startTime: "09:00", endTime: "11:00" },
      lineNumber: 1,
      startAt: Timestamp.fromDate(new Date("2099-01-10T08:00:00Z")),
      participants: { [client.uid]: { sportClub: client.label, racers } },
      participantUids: [client.uid],
      racersTotal: racers,
      participantCount: 1,
    });
  });
}

/** The same transaction shape as joinTraining. */
async function joinTraining(client, slotId, racers) {
  const ref = doc(client.db, "trainings", slotId);
  await runTransaction(client.db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("gone");

    const data = snap.data();
    if (data.participants?.[client.uid]) throw new Error("already-joined");

    const participants = {
      ...data.participants,
      [client.uid]: { sportClub: client.label, racers },
    };
    const racersTotal = Object.values(participants).reduce(
      (s, p) => s + p.racers,
      0
    );
    // Recomputed from the value read inside the transaction, never from a
    // delta the caller captured earlier — that staleness is what let the old
    // counter drift.
    if (racersTotal > CAPACITY) throw new Error("full");

    tx.update(ref, {
      [`participants.${client.uid}`]: participants[client.uid],
      participantUids: Object.keys(participants),
      racersTotal,
      participantCount: Object.keys(participants).length,
    });
  });
}

console.log(`▸ Two clubs booking the same slot, ${ITERATIONS}×`);

let bothSucceeded = 0;
for (let i = 0; i < ITERATIONS; i += 1) {
  const slotId = `ConcurrencyTest__C1__2099-01-10__0900__${RUN}_L${i}`;

  const results = await Promise.allSettled([
    createTraining(alpha, slotId, 10),
    createTraining(beta, slotId, 13),
  ]);

  const won = results.filter((r) => r.status === "fulfilled").length;
  if (won !== 1) {
    bothSucceeded += 1;
    fail(`iteration ${i}: ${won} bookings succeeded, expected exactly 1`);
  }

  const snap = await getDoc(doc(db, "trainings", slotId));
  if (!snap.exists()) fail(`iteration ${i}: no booking survived`);

  await Promise.allSettled([
    deleteDoc(doc(alpha.db, "trainings", slotId)),
    deleteDoc(doc(beta.db, "trainings", slotId)),
  ]);
}
console.log(
  `  ${bothSucceeded === 0 ? "✔" : "✖"} exactly one booking won every time` +
    (bothSucceeded ? ` (${bothSucceeded} failures)` : "")
);

console.log("\n▸ Parallel joins cannot exceed the track capacity");

const slotId = `ConcurrencyTest__C1__2099-01-10__0900__${RUN}_JOIN`;
await createTraining(alpha, slotId, 10);

// Eight clubs of eight racers each want in; only five fit beside the owner.
const joiners = await Promise.all(
  Array.from({ length: 8 }, (_, i) => signedInClient(`joiner${i}`))
);
const outcomes = await Promise.allSettled(
  joiners.map((client) => joinTraining(client, slotId, 8))
);
const accepted = outcomes.filter((o) => o.status === "fulfilled").length;
const rejected = outcomes.length - accepted;

const after = (await getDoc(doc(db, "trainings", slotId))).data();
console.log(`  accepted ${accepted}, rejected ${rejected}`);
console.log(`  racersTotal = ${after.racersTotal} (capacity ${CAPACITY})`);

if (after.racersTotal > CAPACITY) {
  fail(`capacity exceeded: ${after.racersTotal} > ${CAPACITY}`);
} else {
  console.log("  ✔ capacity never exceeded");
}

const sumFromParticipants = Object.values(after.participants).reduce(
  (s, p) => s + p.racers,
  0
);
if (sumFromParticipants !== after.racersTotal) {
  fail(
    `counter drifted: racersTotal ${after.racersTotal} vs participants ${sumFromParticipants}`
  );
} else {
  console.log("  ✔ racersTotal matches the participants it summarises");
}

await deleteDoc(doc(alpha.db, "trainings", slotId)).catch(() => {});

console.log("");
if (failures) {
  console.error(`✖ ${failures} failure(s).`);
  process.exit(1);
}
console.log("✔ Double booking and capacity overrun are both prevented.");
process.exit(0);
