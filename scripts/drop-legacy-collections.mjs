/**
 * Deletes the collections the migration replaced: `reservations` (with its
 * `addedUsers` subcollections) and `closedTracks`.
 *
 * This is the only irreversible step in the whole move, so it runs last and on
 * its own. Everything before it is additive — rolling back meant deleting three
 * new collections and serving the previous build. Once this has run, going back
 * needs the snapshot.
 *
 * It therefore refuses to run until it has checked that the data it is about to
 * delete has actually been migrated: every reservation must be accounted for in
 * `trainings` (by `legacyId`) or in `trainingsOrphanedParticipants`, and every
 * closed track must have a matching document in `closures`. A reservation
 * nobody migrated is a bug in the migration, and deleting it would destroy the
 * only evidence of that bug.
 *
 *   node scripts/drop-legacy-collections.mjs --target=emulator --dry-run
 *   node scripts/drop-legacy-collections.mjs --target=emulator
 *   node scripts/drop-legacy-collections.mjs --target=prod --confirm
 *
 * Take a fresh `npm run db:pull` first. That pull is the backup.
 */
import admin from "firebase-admin";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ID = "certaintyapp";
const DEFAULT_EMULATOR = "127.0.0.1:8080";
const LEGACY = ["reservations", "closedTracks"];

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const target = value("target") ?? "emulator";
const dryRun = flag("dry-run");
const confirmed = flag("confirm");
const force = flag("force");
const reportPath = value("report");

if (!["emulator", "prod"].includes(target)) {
  console.error('✖ --target must be "emulator" or "prod".');
  process.exit(1);
}

// Same guards as the migration: the emulator run refuses to touch production,
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
        "  Unset it, or you would be deleting from the emulator while believing\n" +
        "  you are deleting from production."
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

console.log(
  `▸ mode  : ${dryRun ? "dry run — nothing will be deleted" : "DELETING"}\n`
);

admin.initializeApp(
  target === "prod"
    ? {
        credential: admin.credential.applicationDefault(),
        projectId: PROJECT_ID,
      }
    : { projectId: PROJECT_ID }
);

const db = admin.firestore();

// ------------------------------------------------------------------ read ---

console.log("▸ Reading");

const [reservations, closedTracks, trainings, orphans, closures] =
  await Promise.all([
    db.collection("reservations").get(),
    db.collection("closedTracks").get(),
    db.collection("trainings").get(),
    db.collection("trainingsOrphanedParticipants").get(),
    db.collection("closures").get(),
  ]);

console.log(`  reservations : ${reservations.size}`);
console.log(`  closedTracks : ${closedTracks.size}`);
console.log(`  trainings    : ${trainings.size}`);
console.log(`  orphans      : ${orphans.size}`);
console.log(`  closures     : ${closures.size}\n`);

// ---------------------------------------------------------------- verify ---

console.log("▸ Checking everything was migrated");

const migratedIds = new Set();
for (const d of trainings.docs) {
  const legacyId = d.data().legacyId;
  if (legacyId) migratedIds.add(legacyId);
}
for (const d of orphans.docs) {
  migratedIds.add(d.data().legacyReservationId ?? d.id);
}

const unmigratedReservations = reservations.docs
  .filter((d) => !migratedIds.has(d.id))
  .map((d) => ({ id: d.id, date: d.data().date ?? null }));

// Closures carry the id of the `closedTracks` document they came from, so
// this is an exact match rather than a reconstruction. Rebuilding the slot
// instead would be guessing: the old documents name the slope `course` and
// carry no resort at all, while the new ones use `resortId` and `courseId`.
const migratedTrackIds = new Set(
  closures.docs.map((d) => d.data().legacyId).filter(Boolean)
);

const unmigratedTracks = closedTracks.docs
  .filter((d) => !migratedTrackIds.has(d.id))
  .map((d) => ({ id: d.id, date: d.data().date ?? null }));

const problems = [];
if (unmigratedReservations.length > 0) {
  problems.push(
    `${unmigratedReservations.length} reservation(s) are in neither ` +
      "`trainings` nor `trainingsOrphanedParticipants`"
  );
}
if (unmigratedTracks.length > 0) {
  problems.push(
    `${unmigratedTracks.length} closed track(s) have no matching document in ` +
      "`closures`"
  );
}

for (const list of [unmigratedReservations, unmigratedTracks]) {
  for (const item of list.slice(0, 10)) {
    console.log(`    unmatched: ${item.id}${item.date ? ` (${item.date})` : ""}`);
  }
  if (list.length > 10) console.log(`    … and ${list.length - 10} more`);
}

if (problems.length > 0) {
  console.log("");
  for (const p of problems) console.log(`  ✖ ${p}`);
  if (!force) {
    console.error(
      "\n✖ Refusing to delete. Those documents are the only copy of that data.\n" +
        "  Re-run the migration, or pass --force if you have checked each one by\n" +
        "  hand and decided it should go."
    );
    process.exit(1);
  }
  console.log("\n  --force given — deleting anyway.");
} else {
  console.log("  ✔ every reservation and closed track is accounted for\n");
}

// ---------------------------------------------------------------- report ---

let addedUsersTotal = 0;
const addedUsersRefs = [];
for (const d of reservations.docs) {
  const sub = await d.ref.collection("addedUsers").get();
  addedUsersTotal += sub.size;
  for (const s of sub.docs) addedUsersRefs.push(s.ref);
}

const stats = {
  reservations: reservations.size,
  addedUsers: addedUsersTotal,
  closedTracks: closedTracks.size,
  unmigratedReservations: unmigratedReservations.length,
  unmigratedTracks: unmigratedTracks.length,
};

console.log("▸ Would delete");
console.log(`  reservations/*            : ${reservations.size}`);
console.log(`  reservations/*/addedUsers : ${addedUsersTotal}`);
console.log(`  closedTracks/*            : ${closedTracks.size}`);
console.log(
  `  total documents           : ${
    reservations.size + addedUsersTotal + closedTracks.size
  }`
);

if (reportPath) {
  await mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await writeFile(
    path.resolve(reportPath),
    JSON.stringify(
      {
        stats,
        unmigratedReservations,
        unmigratedTracks,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`\n  report written to ${reportPath}`);
}

if (dryRun) {
  console.log("\n✔ Dry run complete — nothing was deleted.");
  process.exit(0);
}

// ---------------------------------------------------------------- delete ---

console.log("\n▸ Deleting");
const writer = db.bulkWriter();

// Subcollections first: deleting a parent leaves its subcollection behind as
// documents that no longer appear in any listing.
for (const ref of addedUsersRefs) writer.delete(ref);
for (const d of reservations.docs) writer.delete(d.ref);
for (const d of closedTracks.docs) writer.delete(d.ref);

await writer.close();

// Asking what is left is the only honest confirmation: BulkWriter retries
// internally, so "no exception was thrown" is a weaker claim than this.
const [leftReservations, leftTracks] = await Promise.all([
  db.collection("reservations").limit(1).get(),
  db.collection("closedTracks").limit(1).get(),
]);

console.log(
  `  deleted ${reservations.size} reservations, ${addedUsersTotal} addedUsers, ` +
    `${closedTracks.size} closedTracks`
);

if (!leftReservations.empty || !leftTracks.empty) {
  console.error(
    "\n✖ Something is still there. Re-run — the script is safe to repeat."
  );
  process.exit(1);
}

for (const name of LEGACY) console.log(`  ✔ ${name} is empty`);
console.log("\n✔ Legacy collections dropped.");
process.exit(0);
