/**
 * Measures the read patterns the rework replaced, against the migrated data.
 *
 *   npm run bench          (emulator must be running)
 *
 * Both halves of each pair read the same snapshot of the same database, so the
 * comparison is of the queries, not of two different datasets.
 *
 * WHAT THE NUMBERS MEAN
 *
 * Round trips transfer honestly to production. Milliseconds do not: against the
 * emulator a round trip costs about a millisecond, against Firestore over the
 * internet it is tens to hundreds. The patterns being measured here are ones
 * whose cost is almost entirely round trips — one of them issues 700 of them in
 * sequence — so these timings **understate** the real difference by roughly the
 * ratio of the two latencies. Read the trip counts as the result and the
 * milliseconds as a floor.
 *
 * Documents read is the third column and the one that bills.
 */
import admin from "firebase-admin";

const PROJECT_ID = "certaintyapp";
const DEFAULT_EMULATOR = "127.0.0.1:8080";
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = DEFAULT_EMULATOR;
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

/** Counts round trips by wrapping the two calls that make them. */
function counted() {
  return { trips: 0, docs: 0 };
}

async function getCounted(c, ref) {
  c.trips += 1;
  const snap = await ref.get();
  c.docs += snap.size;
  return snap;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// The busiest week in the data, not the most recent one.
//
// Anchoring on the latest training picked an empty week in the future and made
// the calendar comparison look like a wash — both sides were reading nothing.
// The migrated snapshot is historical, so the week that exercises these queries
// has to be found rather than assumed.
const { weekDates, RESORT, COURSE } = await (async () => {
  const all = await db.collection("trainings").get();
  const byDate = new Map();
  for (const d of all.docs) {
    const t = d.data();
    const key = `${t.date}|${t.resortId}|${t.courseId}`;
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }

  let best = null;
  for (const d of all.docs) {
    const t = d.data();
    const start = new Date(`${t.date}T00:00:00Z`);
    const dates = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
    let count = 0;
    for (const day of dates) {
      count += byDate.get(`${day}|${t.resortId}|${t.courseId}`) ?? 0;
    }
    if (!best || count > best.count) {
      best = { count, dates, resortId: t.resortId, courseId: t.courseId };
    }
  }

  return {
    weekDates: best?.dates ?? [],
    RESORT: best?.resortId ?? "Bachledka",
    COURSE: best?.courseId ?? null,
    busiest: best?.count ?? 0,
  };
})();

// --------------------------------------------------------------- patterns ---

/** Old calendar: a date range over every resort, then addedUsers one by one. */
async function oldCalendarWeek() {
  const c = counted();
  const snap = await getCounted(
    c,
    db
      .collection("reservations")
      .where("date", ">=", weekDates[0])
      .where("date", "<=", weekDates[6])
  );
  for (const d of snap.docs) {
    await getCounted(c, d.ref.collection("addedUsers"));
  }
  const closed = await getCounted(c, db.collection("closedTracks"));
  void closed;
  return c;
}

/** New calendar: one query, scoped to the slope and the week on screen. */
async function newCalendarWeek() {
  const c = counted();
  let q = db
    .collection("trainings")
    .where("resortId", "==", RESORT)
    .where("date", ">=", weekDates[0])
    .where("date", "<=", weekDates[6]);
  if (COURSE) q = q.where("courseId", "==", COURSE);
  await getCounted(c, q);

  let cq = db
    .collection("closures")
    .where("resortId", "==", RESORT)
    .where("date", ">=", weekDates[0])
    .where("date", "<=", weekDates[6]);
  if (COURSE) cq = cq.where("courseId", "==", COURSE);
  await getCounted(c, cq);
  return c;
}

/** Old admin list: the whole collection, then a fetch per booking, in series. */
async function oldAdminList() {
  const c = counted();
  const snap = await getCounted(c, db.collection("reservations"));
  for (const d of snap.docs) {
    await getCounted(c, d.ref.collection("addedUsers"));
  }
  return c;
}

/** New admin list: one range query; the clubs are already in the document. */
async function newAdminList() {
  const c = counted();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  const to = new Date();
  to.setMonth(to.getMonth() + 6);
  await getCounted(
    c,
    db
      .collection("trainings")
      .where("date", ">=", iso(from))
      .where("date", "<=", iso(to))
  );
  return c;
}

// ------------------------------------------------------------------- run ---

async function time(label, fn) {
  let best = Infinity;
  let last = counted();
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    last = await fn();
    best = Math.min(best, performance.now() - t0);
  }
  return { label, ms: best, ...last };
}

function row(r) {
  return (
    `  ${r.label.padEnd(26)} ${String(Math.round(r.ms)).padStart(7)} ms` +
    `${String(r.trips).padStart(8)} trips` +
    `${String(r.docs).padStart(9)} docs`
  );
}

console.log(`▸ emulator : ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`▸ week     : ${weekDates[0]} … ${weekDates[6]}`);
console.log(`▸ slope    : ${RESORT} / ${COURSE ?? "(all)"}`);
console.log(`▸ runs     : ${RUNS}, best of\n`);

const results = [];
console.log("Calendar, one week on screen");
results.push(await time("old: reservations", oldCalendarWeek));
results.push(await time("new: trainings", newCalendarWeek));
console.log(row(results[0]));
console.log(row(results[1]));

console.log("\nAdmin list");
results.push(await time("old: reservations", oldAdminList));
results.push(await time("new: trainings", newAdminList));
console.log(row(results[2]));
console.log(row(results[3]));

const speedup = (a, b) => (b.ms > 0 ? (a.ms / b.ms).toFixed(1) : "∞");
console.log(
  `\n  calendar : ${speedup(results[0], results[1])}× faster locally, ` +
    `${results[0].trips} → ${results[1].trips} round trips`
);
console.log(
  `  admin    : ${speedup(results[2], results[3])}× faster locally, ` +
    `${results[2].trips} → ${results[3].trips} round trips`
);
console.log(
  "\n  Round trips are the number that carries to production; the emulator\n" +
    "  answers in about a millisecond, Firestore over the internet does not."
);

process.exit(0);
