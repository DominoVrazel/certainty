/**
 * Migrates `reservations` (+ its `addedUsers` subcollection) and `closedTracks`
 * into the new `trainings` and `closures` collections.
 *
 * Purely additive: it writes only the new collections and never deletes or
 * modifies anything that exists today. Rolling back means deleting the three
 * new collections.
 *
 * Idempotent: document ids are derived from the data, and every write is a full
 * `set` rather than a merge, so running it twice produces identical documents.
 *
 *   node scripts/migrate-trainings.mjs --target=emulator --dry-run
 *   node scripts/migrate-trainings.mjs --target=emulator
 *   node scripts/migrate-trainings.mjs --target=prod --confirm
 */
import admin from "firebase-admin";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ID = "certaintyapp";
const TIME_ZONE = "Europe/Bratislava";
const MIGRATION_VERSION = 1;
const DEFAULT_EMULATOR = "127.0.0.1:8080";

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const target = value("target") ?? "emulator";
const dryRun = flag("dry-run");
const confirmed = flag("confirm");
const reportPath = value("report");

if (!["emulator", "prod"].includes(target)) {
  console.error('✖ --target must be "emulator" or "prod".');
  process.exit(1);
}

// Guards mirror the other scripts: the emulator run refuses to touch production
// and the production run refuses to be silently redirected at the emulator.
if (target === "emulator") {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = DEFAULT_EMULATOR;
  }
  console.log(`▸ target: emulator (${process.env.FIRESTORE_EMULATOR_HOST})`);
} else {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      "✖ FIRESTORE_EMULATOR_HOST is set but --target=prod was requested.\n" +
        "  Unset it, or you would be migrating the emulator while believing\n" +
        "  you are migrating production."
    );
    process.exit(1);
  }
  if (!confirmed && !dryRun) {
    console.error(
      "✖ --target=prod needs --confirm (or --dry-run to see the plan first)."
    );
    process.exit(1);
  }
  console.log("▸ target: PRODUCTION");
}

const writes = dryRun ? "dry run — nothing will be written" : "writing";
console.log(`▸ mode  : ${writes}\n`);

admin.initializeApp(
  target === "prod"
    ? {
        credential: admin.credential.applicationDefault(),
        projectId: PROJECT_ID,
      }
    : { projectId: PROJECT_ID }
);

const db = admin.firestore();
const { Timestamp } = admin.firestore;

// ---------------------------------------------------------------- helpers ---

/** Offset of a time zone at a given instant, in milliseconds. */
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
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - utcMs;
}

/**
 * "2026-02-10" + "09:00" in Europe/Bratislava → the matching UTC instant.
 *
 * Stored as a real Timestamp because security rules cannot compute "today";
 * they can only compare `request.time` against a stored instant, which is what
 * keeps past trainings read-only.
 */
function localToUtc(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh, mm] = String(timeStr || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;

  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  // Two passes so a slot that falls on a DST change still lands correctly.
  let instant = naive - zoneOffset(naive, TIME_ZONE);
  instant = naive - zoneOffset(instant, TIME_ZONE);
  return new Date(instant);
}

const normaliseEmail = (e) => String(e ?? "").trim().toLowerCase();

/** Stable stand-in uid for a participant whose e-mail matches no account. */
function legacyKey(email, fallback) {
  if (!email) return `legacy_noemail_${fallback}`;
  return `legacy_${createHash("sha1").update(email).digest("hex").slice(0, 20)}`;
}

const sanitiseIdPart = (s) =>
  String(s ?? "")
    .replace(/[/\s]+/g, "_")
    .replace(/__+/g, "_");

function slotIdFor({ resortId, courseId, date, startTime, lineNumber }) {
  return [
    sanitiseIdPart(resortId),
    sanitiseIdPart(courseId),
    date,
    String(startTime ?? "").replace(":", ""),
    `L${lineNumber}`,
  ].join("__");
}

// ------------------------------------------------------------------ load ---

console.log("▸ Reading source data");

const usersSnap = await db.collection("users").get();
const emailToUid = new Map();
const userByUid = new Map();
const duplicateEmails = [];

for (const doc of usersSnap.docs) {
  const data = doc.data();
  const email = normaliseEmail(data.email);
  userByUid.set(doc.id, data);
  if (!email) continue;
  if (emailToUid.has(email)) duplicateEmails.push(email);
  else emailToUid.set(email, doc.id);
}

if (duplicateEmails.length) {
  console.error(
    `✖ ${duplicateEmails.length} e-mail address(es) map to more than one ` +
      `account, so participants cannot be resolved unambiguously:\n  ` +
      duplicateEmails.slice(0, 5).join("\n  ")
  );
  process.exit(1);
}
console.log(`  users        : ${usersSnap.size}`);

const reservationsSnap = await db.collection("reservations").get();
console.log(`  reservations : ${reservationsSnap.size}`);

// A collection-group read is the only way to see participation records whose
// parent reservation was deleted; a per-document read cannot reach them.
const participationSnap = await db.collectionGroup("addedUsers").get();
const joinedByParent = new Map();
for (const doc of participationSnap.docs) {
  const parentId = doc.ref.parent.parent.id;
  if (!joinedByParent.has(parentId)) joinedByParent.set(parentId, []);
  joinedByParent.get(parentId).push(doc);
}
console.log(`  participants : ${participationSnap.size}`);

const closedTracksSnap = await db.collection("closedTracks").get();
console.log(`  closedTracks : ${closedTracksSnap.size}`);

const liveIds = new Set(reservationsSnap.docs.map((d) => d.id));
const orphanParents = [...joinedByParent.keys()].filter((id) => !liveIds.has(id));
const orphanRecordCount = orphanParents.reduce(
  (sum, id) => sum + joinedByParent.get(id).length,
  0
);
console.log(
  `  orphaned     : ${orphanRecordCount} records under ${orphanParents.length} deleted bookings`
);

// --------------------------------------------------------------- transform ---

const stats = {
  trainings: 0,
  duplicateSlots: 0,
  unresolvedParticipants: 0,
  telephonesBackfilled: 0,
  racersRepaired: 0,
  mergedDuplicateParticipants: 0,
  closures: 0,
  orphanDocs: 0,
  orphanRecords: orphanRecordCount,
};
const notes = [];

function buildParticipant(source, role, joinedAt, tickets) {
  const email = normaliseEmail(source.email);
  const uid = emailToUid.get(email);
  const key = uid ?? legacyKey(email, role);
  if (!uid) stats.unresolvedParticipants += 1;

  let tel = source.tel_number ?? null;
  if (!tel && uid && userByUid.get(uid)?.tel_number) {
    tel = userByUid.get(uid).tel_number;
    stats.telephonesBackfilled += 1;
  }

  return [
    key,
    {
      sportClub: source.sportClub ?? null,
      firstName: source.firstName ?? null,
      secondName: source.secondName ?? null,
      email: source.email ?? null,
      tel_number: tel,
      racers: Number(source.ownRacers ?? 0),
      // The old model had no notion of coaches; feature work fills these in.
      coaches: 0,
      tickets,
      role,
      joinedAt,
      confirmedAt: null,
      checkedInAt: null,
      attended: null,
      unresolved: uid ? null : true,
    },
  ];
}

const bySlot = new Map();

for (const doc of reservationsSnap.docs) {
  const r = doc.data();
  const details = r.reservationDetails ?? {};
  const createdAt =
    r.createdAt instanceof Timestamp
      ? r.createdAt
      : Timestamp.fromDate(new Date(r.createdAt ?? Date.now()));

  const key = slotIdFor({
    resortId: details.resort,
    courseId: details.course,
    date: r.date,
    startTime: r.session?.startTime,
    lineNumber: r.lineNumber,
  });

  if (!bySlot.has(key)) bySlot.set(key, []);
  bySlot.get(key).push({ doc, r, details, createdAt });
}

const trainings = [];

for (const [baseId, entries] of bySlot) {
  // Two clubs could book the same slot because creation never checked whether
  // one existed. The calendar keys reservations by slot, so one of each pair
  // has been invisible in the UI. Keep both: the earliest keeps the canonical
  // id, the others are suffixed and flagged.
  entries.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

  entries.forEach(({ doc, r, details, createdAt }, index) => {
    const slotId = index === 0 ? baseId : `${baseId}__dup${index + 1}`;
    if (index > 0) stats.duplicateSlots += 1;

    const confirmed = r.status === "potvrdená";
    const participants = {};

    const [ownerKey, owner] = buildParticipant(
      r.user ?? {},
      "owner",
      createdAt,
      Number(r.tickets ?? 0)
    );
    owner.confirmedAt = confirmed ? createdAt : null;
    participants[ownerKey] = owner;

    for (const joinedDoc of joinedByParent.get(doc.id) ?? []) {
      // The join flow consumed a promo code but never recorded how many, so
      // ticket counts for joined clubs are unrecoverable; 0 is the honest value.
      const [k, p] = buildParticipant(
        joinedDoc.data(),
        "joined",
        createdAt,
        0
      );
      if (participants[k]) {
        // One club appears twice on the same booking: it created the training
        // and then also joined it. The old `availableRacers` counted both, so
        // dropping either set would understate how full the slot really was.
        // Merge into the single participant the new model allows.
        participants[k].racers += p.racers;
        participants[k].tickets += p.tickets;
        participants[k].mergedDuplicateEntry = true;
        stats.mergedDuplicateParticipants += 1;
        continue;
      }
      p.confirmedAt = confirmed ? createdAt : null;
      participants[k] = p;
    }

    const list = Object.values(participants);
    const racersTotal = list.reduce((s, p) => s + p.racers, 0);

    // availableRacers is deliberately not carried over: it bakes in whatever
    // capacity applied at write time, and one record had already drifted.
    if (
      typeof r.availableRacers === "number" &&
      r.availableRacers !== null &&
      racersTotal !== null
    ) {
      const impliedCapacity = r.availableRacers + racersTotal;
      if (impliedCapacity !== 50) stats.racersRepaired += 1;
    }

    const startAt = localToUtc(r.date, r.session?.startTime);
    const endAt = localToUtc(r.date, r.session?.endTime);

    const dataQuality =
      index > 0
        ? "duplicate-slot"
        : list.some((p) => p.unresolved)
        ? "unresolved-participant"
        : null;

    trainings.push({
      id: slotId,
      data: {
        resortId: details.resort ?? null,
        courseId: details.course ?? null,
        courseName: details.courseName ?? null,
        date: r.date ?? null,
        session: {
          startTime: r.session?.startTime ?? null,
          endTime: r.session?.endTime ?? null,
        },
        lineNumber: Number(r.lineNumber ?? 0),
        startAt: startAt ? Timestamp.fromDate(startAt) : null,
        endAt: endAt ? Timestamp.fromDate(endAt) : null,

        discipline: r.discipline ?? null,
        category: r.category ?? null,
        status: confirmed ? "confirmed" : "created",
        note: "",
        noteUpdatedBy: null,
        noteUpdatedAt: null,

        participants,
        // Firestore cannot query "map contains key", so the keys are mirrored
        // into arrays; these are what "which trainings is club X in" uses.
        participantUids: Object.keys(participants),
        clubs: [...new Set(list.map((p) => p.sportClub).filter(Boolean))],
        racersTotal,
        coachesTotal: 0,
        participantCount: list.length,
        confirmedCount: list.filter((p) => p.confirmedAt).length,

        createdBy: ownerKey,
        createdOnBehalfOf: null,
        createdAt,
        updatedAt: createdAt,

        legacyId: doc.id,
        migrationVersion: MIGRATION_VERSION,
        dataQuality,
      },
    });
    stats.trainings += 1;
  });
}

const orphanDocs = orphanParents.map((parentId) => ({
  id: parentId,
  data: {
    legacyReservationId: parentId,
    participants: joinedByParent.get(parentId).map((d) => {
      const data = d.data();
      return {
        email: data.email ?? null,
        firstName: data.firstName ?? null,
        secondName: data.secondName ?? null,
        sportClub: data.sportClub ?? null,
        tel_number: data.tel_number ?? null,
        racers: Number(data.ownRacers ?? 0),
      };
    }),
    migrationVersion: MIGRATION_VERSION,
    note:
      "The booking these clubs joined was deleted before the migration. Its " +
      "date, time, course and track are unrecoverable, so the participation " +
      "cannot be rebuilt as a training — it is preserved here as evidence.",
  },
}));
stats.orphanDocs = orphanDocs.length;

const closures = closedTracksSnap.docs.map((doc) => {
  const c = doc.data();
  const resortId = "Bachledka"; // closedTracks has no resort; only one exists
  const id = [
    sanitiseIdPart(resortId),
    sanitiseIdPart(c.course),
    c.date,
    "ALL",
    `L${c.lineNumber}`,
  ].join("__");

  const startAt = localToUtc(c.date, "00:00");
  stats.closures += 1;

  return {
    id,
    data: {
      resortId,
      courseId: c.course ?? null,
      date: c.date ?? null,
      lineNumber: Number(c.lineNumber ?? 0),
      // Whole-day closures are all the old model could express; per-session
      // closures are the additive half of the feature this prepares for.
      scope: "day",
      session: null,
      startAt: startAt ? Timestamp.fromDate(startAt) : null,
      reason: c.reason ?? null,
      closedAt: c.closedAt ?? null,
      closedBy: null,
      legacyId: doc.id,
      migrationVersion: MIGRATION_VERSION,
    },
  };
});

// ----------------------------------------------------------------- report ---

console.log("\n▸ Planned output");
console.log(`  trainings                      : ${stats.trainings}`);
console.log(`    of those duplicate slots     : ${stats.duplicateSlots}`);
console.log(`  closures                       : ${stats.closures}`);
console.log(`  orphaned-participant documents : ${stats.orphanDocs} (${stats.orphanRecords} records)`);
console.log(`  participants without an account: ${stats.unresolvedParticipants}`);
console.log(`  phone numbers backfilled       : ${stats.telephonesBackfilled}`);
console.log(`  clubs listed twice, merged     : ${stats.mergedDuplicateParticipants}`);

if (stats.duplicateSlots) {
  const dupes = trainings.filter((t) => t.data.dataQuality === "duplicate-slot");
  console.log("\n  recovered bookings that the calendar has been hiding:");
  for (const t of dupes) {
    console.log(
      `    ${t.data.date} ${t.data.session.startTime} line ${t.data.lineNumber} ` +
        `— ${t.data.clubs.join(", ")} (${t.data.participantCount} club(s))`
    );
  }
}

if (reportPath) {
  await mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await writeFile(
    path.resolve(reportPath),
    JSON.stringify({ stats, notes, generatedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`\n  report written to ${reportPath}`);
}

if (dryRun) {
  console.log("\n✔ Dry run complete — nothing was written.");
  process.exit(0);
}

// ------------------------------------------------------------------ write ---

console.log("\n▸ Writing");
const writer = db.bulkWriter();

for (const t of trainings) writer.set(db.collection("trainings").doc(t.id), t.data);
for (const c of closures) writer.set(db.collection("closures").doc(c.id), c.data);
for (const o of orphanDocs) {
  writer.set(db.collection("trainingsOrphanedParticipants").doc(o.id), o.data);
}

await writer.close();

console.log(
  `  wrote ${trainings.length} trainings, ${closures.length} closures, ` +
    `${orphanDocs.length} orphan records`
);
console.log("\n✔ Migration complete. Nothing existing was modified or deleted.");
process.exit(0);
