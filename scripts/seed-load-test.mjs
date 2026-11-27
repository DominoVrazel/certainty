/**
 * Fills the calendar with a realistic season so the app can be timed under
 * load, instead of against the near-empty future the migrated snapshot leaves.
 *
 *   npm run db:load            2-3 trainings a day, per slope, for 90 days
 *   npm run db:load:clear      removes every one of them again
 *
 *   node scripts/seed-load-test.mjs --days=180 --per-day=4
 *
 * EMULATOR ONLY. This writes invented bookings against real clubs' names and
 * contact details; there is no version of "run it on production" that is a
 * good idea, so --target is not even offered.
 *
 * Every document it writes carries `loadTest: true`, which is how --clear
 * finds them again. Nothing else is touched: the migrated history, the real
 * resorts and the real user accounts are left exactly as they were.
 */
import admin from "firebase-admin";

const PROJECT_ID = "certaintyapp";
const DEFAULT_EMULATOR = "127.0.0.1:8080";
const TIME_ZONE = "Europe/Bratislava";
const RESORT = "Bachledka";

// The scratch slope the admin screens left behind: two one-hour evening blocks
// and a capacity of 2, which is not a calendar anybody loads.
const SKIP_COURSES = new Set(["sdf"]);

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const days = Number(value("days") ?? 90);
/**
 * Where the run starts, in days from today. Negative fills the part of the
 * season that has already been skied, which is what makes the calendar look
 * like the end of a season rather than the start of one.
 */
const startOffset = Number(value("start-offset") ?? 0);
const perDay = Number(value("per-day") ?? 3);
const minPerDay = Number(value("min-per-day") ?? 2);
const clear = flag("clear");
/**
 * By default a run replaces what the last one left. Without this the script
 * is additive, not idempotent: which slots it picks depends on the random
 * sequence, and that shifts as soon as the club list changes — so a second
 * run lands on different slots and piles its calendar on top of the old one.
 * `--add` keeps the previous data and layers more on it, deliberately.
 */
const addOnly = flag("add");
const seedValue = Number(value("seed") ?? 20260101);

if (process.env.FIRESTORE_EMULATOR_HOST === undefined) {
  process.env.FIRESTORE_EMULATOR_HOST = DEFAULT_EMULATOR;
}
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  console.error(
    `✖ FIRESTORE_EMULATOR_HOST is ${process.env.FIRESTORE_EMULATOR_HOST}, which is not a local emulator.\n` +
      "  This script invents bookings against real people's contact details and\n" +
      "  must never reach a real database."
  );
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

console.log(`▸ emulator : ${process.env.FIRESTORE_EMULATOR_HOST}`);

/**
 * Writes in committed batches rather than through BulkWriter.
 *
 * BulkWriter floods the emulator with hundreds of parallel writes, and an
 * emulator that is also serving the running app answers them slowly enough to
 * hit DEADLINE_EXCEEDED. Batches of 400, awaited one after another, finish in
 * about the same time without the stack having to be stopped first.
 */
async function commitInBatches(items, apply, label) {
  const SIZE = 400;
  let done = 0;
  for (let i = 0; i < items.length; i += SIZE) {
    const batch = db.batch();
    for (const item of items.slice(i, i + SIZE)) apply(batch, item);
    await batch.commit();
    done += Math.min(SIZE, items.length - i);
    console.log(`  ${label}: ${done}/${items.length}`);
  }
}

// ----------------------------------------------------------------- clear ---

if (clear) {
  const snap = await db.collection("trainings").where("loadTest", "==", true).get();
  if (snap.empty) {
    console.log("✔ Nothing to clear.");
    process.exit(0);
  }
  await commitInBatches(snap.docs, (batch, d) => batch.delete(d.ref), "deleting");

  const left = await db
    .collection("trainings")
    .where("loadTest", "==", true)
    .limit(1)
    .get();
  if (!left.empty) {
    console.error("✖ Some are still there. Re-run — this is safe to repeat.");
    process.exit(1);
  }
  const seasons = await db
    .collectionGroup("seasons")
    .where("loadTest", "==", true)
    .get();
  if (!seasons.empty) {
    await commitInBatches(seasons.docs, (batch, d) => batch.delete(d.ref), "seasons");
  }

  console.log(
    `✔ Removed ${snap.size} load-test trainings` +
      (seasons.size ? ` and ${seasons.size} load-test season(s).` : ".")
  );
  process.exit(0);
}

// ---------------------------------------------------------------- helpers ---

/** Deterministic PRNG, so two runs produce the same calendar to compare. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const random = makeRandom(seedValue);
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));

/** Mirrors `slotId` in src/services/trainings.ts. */
const idPart = (s) =>
  String(s ?? "").replace(/[/\s]+/g, "_").replace(/__+/g, "_");
const slotId = (resortId, courseId, date, startTime, lineNumber) =>
  [
    idPart(resortId),
    idPart(courseId),
    date,
    String(startTime).replace(":", ""),
    `L${lineNumber}`,
  ].join("__");

/** Offset of a time zone at an instant, in milliseconds. */
function zoneOffset(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value])
  );
  return (
    Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      p.hour === "24" ? 0 : +p.hour,
      +p.minute,
      +p.second
    ) - utcMs
  );
}

/** "2026-02-10" + "09:00" in Bratislava -> the matching UTC instant. */
function localToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - zoneOffset(guess - zoneOffset(guess, TIME_ZONE), TIME_ZONE));
}

const iso = (d) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(d);

/** The date `offset` days from today, as YYYY-MM-DD. */
const isoOffset = (offset) => iso(new Date(Date.now() + offset * 86400000));

/**
 * A season covering the seeded window, for a slope that has none.
 *
 * The calendar renders only the days a season lists, so a slope whose season
 * has ended shows nothing at all — seeding bookings onto it would produce
 * invisible data and a load test that measured half of what it claimed. Shape
 * copied from the seasons the admin screen writes: weeks of days carrying a
 * date and the day name, with the time blocks coming from the course.
 */
const DAY_NAMES = {
  sk: ["Nedeľa", "Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

function buildWeeks(startDate, endDate) {
  const weeks = [];
  const end = new Date(`${endDate}T12:00:00Z`);
  let cursor = new Date(`${startDate}T12:00:00Z`);
  // Wind back to the Monday on or before the start, as the admin form does.
  const dow = cursor.getUTCDay();
  cursor = new Date(cursor.getTime() - ((dow + 6) % 7) * 86400000);

  while (cursor <= end) {
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(cursor.getTime() + i * 86400000);
      if (day > end) break;
      days.push({
        date: day.toISOString().slice(0, 10),
        dayOfWeek: {
          sk: DAY_NAMES.sk[day.getUTCDay()],
          en: DAY_NAMES.en[day.getUTCDay()],
        },
      });
    }
    if (days.length) {
      weeks.push({
        startOfWeek: days[0].date,
        endOfWeek: days[days.length - 1].date,
        days,
      });
    }
    cursor = new Date(cursor.getTime() + 7 * 86400000);
  }
  return weeks;
}

// ------------------------------------------------------------------ read ---

const [coursesSnap, usersSnap] = await Promise.all([
  db.collection("resorts").doc(RESORT).collection("courses").get(),
  db.collection("users").where("isAdmin", "==", false).get(),
]);

const courses = coursesSnap.docs
  .filter((d) => !SKIP_COURSES.has(d.id))
  .map((d) => ({ id: d.id, ...d.data() }));

const clubs = usersSnap.docs
  .map((d) => ({ uid: d.id, ...d.data() }))
  .filter((u) => u.sportClub);

if (courses.length === 0) {
  console.error("✖ No slopes to seed. Load the snapshot first (npm run db:seed).");
  process.exit(1);
}
if (clubs.length === 0) {
  console.error("✖ No club accounts found.");
  process.exit(1);
}

console.log(`▸ slopes   : ${courses.map((c) => c.name).join(", ")}`);
console.log(`▸ clubs    : ${clubs.length}`);
console.log(`▸ plan     : ${minPerDay}-${perDay} per slope per day, ${days} days from day ${startOffset}\n`);

// Stale seeded seasons go before the windows are worked out, not after.
//
// A season this script left behind from an earlier window counts as
// overlapping, so the slope is clamped to it rather than given the window
// that was asked for — a 180-day run after a 90-day one produced 60 days on
// one slope, and clearing them at write time was already too late to help.
if (!addOnly) {
  const staleSeasons = await db
    .collectionGroup("seasons")
    .where("loadTest", "==", true)
    .get();
  if (!staleSeasons.empty) {
    await commitInBatches(
      staleSeasons.docs,
      (batch, d) => batch.delete(d.ref),
      "replacing seasons"
    );
  }
}

// --------------------------------------------------------------- seasons ---

const seedStart = isoOffset(startOffset);
const seedEnd = isoOffset(startOffset + days - 1);

/** Per slope, the stretch of the requested window its calendar can show. */
const windowFor = new Map();

for (const course of courses) {
  const seasons = await db
    .collection("resorts")
    .doc(RESORT)
    .collection("courses")
    .doc(course.id)
    .collection("seasons")
    .get();

  // A season that overlaps the window is clamped to, never added to. Two
  // seasons covering the same day both render, one under the other — the
  // clash the admin form refuses, and it would be dishonest to create by
  // the back door the thing the app forbids at the front.
  const overlapping = seasons.docs
    .map((d) => d.data())
    .filter((s) => s.startDate <= seedEnd && seedStart <= s.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  if (overlapping) {
    const from = overlapping.startDate > seedStart ? overlapping.startDate : seedStart;
    const to = overlapping.endDate < seedEnd ? overlapping.endDate : seedEnd;
    windowFor.set(course.id, { from, to });
    console.log(
      `  = ${course.name}: using its season, ${from} to ${to}` +
        (from !== seedStart || to !== seedEnd ? " (window clamped)" : "")
    );
    continue;
  }

  windowFor.set(course.id, { from: seedStart, to: seedEnd });

  const label = `sezóna ${seedStart.slice(0, 4)}/${Number(seedStart.slice(0, 4)) + 1}`;
  const id = `loadtest_${seedStart}_${seedEnd}`.replace(/[^a-zA-Z0-9_]/g, "_");

  await db
    .collection("resorts")
    .doc(RESORT)
    .collection("courses")
    .doc(course.id)
    .collection("seasons")
    .doc(id)
    .set({
      season: label,
      startDate: seedStart,
      endDate: seedEnd,
      weeks: buildWeeks(seedStart, seedEnd),
      loadTest: true,
    });

  console.log(`  + season for ${course.name}: ${seedStart} to ${seedEnd}`);
}

// ----------------------------------------------------------------- build ---

const DISCIPLINES = ["Slalom", "Obrovský slalom", "Super-G", "Zjazd"];
const CATEGORIES = ["Žiaci", "Juniori", "Dospelí", "Predžiaci"];

const docs = [];
const today = new Date();

for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
  const date = iso(
    new Date(today.getTime() + (startOffset + dayOffset) * 86400000)
  );

  for (const course of courses) {
    // Outside this slope's season the calendar renders nothing, so a booking
    // there would be invisible — data the load test counted but nobody loads.
    const win = windowFor.get(course.id);
    if (!win || date < win.from || date > win.to) continue;

    const sessions = course.timeSessions ?? [];
    const lines = Number(course.capacity ?? 1);
    if (sessions.length === 0 || lines < 1) continue;

    // Every (session, line) pair is one bookable slot. Choosing without
    // replacement keeps two trainings off the same slot, which is what the
    // deterministic document id enforces anyway — a collision here would
    // silently overwrite rather than add.
    const slots = [];
    for (const s of sessions) {
      for (let line = 1; line <= lines; line += 1) slots.push({ s, line });
    }

    const wanted = Math.min(between(minPerDay, perDay), slots.length);
    for (let i = 0; i < wanted; i += 1) {
      const idx = Math.floor(random() * slots.length);
      const { s, line } = slots.splice(idx, 1)[0];

      const participants = {};
      const uids = [];
      const clubNames = [];
      let racersTotal = 0;
      let coachesTotal = 0;
      let confirmedCount = 0;

      const howMany = between(1, 3);
      for (let p = 0; p < howMany; p += 1) {
        const club = pick(clubs);
        if (participants[club.uid]) continue;

        const racers = between(3, 12);
        const coaches = between(1, 3);
        const confirmed = random() < 0.7;
        if (confirmed) confirmedCount += 1;

        participants[club.uid] = {
          sportClub: club.sportClub ?? null,
          firstName: club.firstName ?? null,
          secondName: club.secondName ?? null,
          email: club.email ?? null,
          tel_number: club.tel_number ?? null,
          racers,
          coaches,
          tickets: between(0, racers),
          role: p === 0 ? "owner" : "joined",
          joinedAt: Timestamp.now(),
          confirmedAt: confirmed ? Timestamp.now() : null,
          checkedInAt: null,
          attended: null,
        };
        uids.push(club.uid);
        if (club.sportClub) clubNames.push(club.sportClub);
        racersTotal += racers;
        coachesTotal += coaches;
      }

      const count = uids.length;
      docs.push({
        id: slotId(RESORT, course.id, date, s.startTime, line),
        data: {
          resortId: RESORT,
          courseId: course.id,
          courseName: course.name ?? null,
          date,
          session: { startTime: s.startTime, endTime: s.endTime },
          lineNumber: line,
          startAt: Timestamp.fromDate(localToUtc(date, s.startTime)),
          endAt: Timestamp.fromDate(localToUtc(date, s.endTime)),
          discipline: pick(DISCIPLINES),
          category: pick(CATEGORIES),
          status: count > 0 && confirmedCount === count ? "confirmed" : "created",
          note: random() < 0.15 ? "Zraz pri vleku o 8:45." : "",
          participants,
          participantUids: uids,
          clubs: [...new Set(clubNames)],
          racersTotal,
          coachesTotal,
          participantCount: count,
          confirmedCount,
          createdBy: uids[0] ?? null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          /** How --clear finds these again. Real bookings never carry it. */
          loadTest: true,
        },
      });
    }
  }
}

// ----------------------------------------------------------------- write ---

if (!addOnly) {
  const previous = await db
    .collection("trainings")
    .where("loadTest", "==", true)
    .get();
  if (!previous.empty) {
    await commitInBatches(
      previous.docs,
      (batch, d) => batch.delete(d.ref),
      "replacing"
    );
  }
}

console.log(`▸ writing ${docs.length} trainings`);
await commitInBatches(
  docs,
  (batch, d) => batch.set(db.collection("trainings").doc(d.id), d.data),
  "writing"
);

const check = await db.collection("trainings").where("loadTest", "==", true).get();
const racers = check.docs.reduce((n, d) => n + (d.data().racersTotal ?? 0), 0);
const clubsOn = check.docs.reduce((n, d) => n + (d.data().participantCount ?? 0), 0);

console.log(`\n✔ ${check.size} trainings on the calendar`);
console.log(`  ${clubsOn} club participations, ${racers} racers in total`);
console.log(`  from ${docs[0]?.data.date} to ${docs[docs.length - 1]?.data.date}`);
console.log("\n  Remove them again with: npm run db:load:clear");
process.exit(0);
