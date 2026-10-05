/**
 * Checks the migrated `trainings` / `closures` against the legacy collections
 * they came from. Read-only.
 *
 *   npm run db:verify:migration
 *
 * Verifies parity rather than re-deriving the same numbers the migration
 * printed: it reads both shapes and compares them, so a transform bug shows up
 * as a mismatch instead of being echoed back.
 */
import admin from "firebase-admin";
import { createHash } from "node:crypto";

const PROJECT_ID = "certaintyapp";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "✔" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

console.log("▸ Reading both shapes");

const [reservations, participation, closedTracks, trainings, closures, orphans] =
  await Promise.all([
    db.collection("reservations").get(),
    db.collectionGroup("addedUsers").get(),
    db.collection("closedTracks").get(),
    db.collection("trainings").get(),
    db.collection("closures").get(),
    db.collection("trainingsOrphanedParticipants").get(),
  ]);

const liveIds = new Set(reservations.docs.map((d) => d.id));
const joinedByParent = new Map();
for (const doc of participation.docs) {
  const id = doc.ref.parent.parent.id;
  if (!joinedByParent.has(id)) joinedByParent.set(id, []);
  joinedByParent.get(id).push(doc);
}
const orphanRecordCount = [...joinedByParent.entries()]
  .filter(([id]) => !liveIds.has(id))
  .reduce((s, [, v]) => s + v.length, 0);

console.log(
  `  legacy: ${reservations.size} reservations, ${participation.size} participations, ${closedTracks.size} closures`
);
console.log(
  `  new   : ${trainings.size} trainings, ${closures.size} closures, ${orphans.size} orphan docs\n`
);

console.log("▸ Counts");
check(
  trainings.size === reservations.size,
  "every reservation became a training",
  `${trainings.size} vs ${reservations.size}`
);
check(
  closures.size === closedTracks.size,
  "every closed track became a closure",
  `${closures.size} vs ${closedTracks.size}`
);

const orphanParentIds = [...joinedByParent.keys()].filter((id) => !liveIds.has(id));
check(
  orphans.size === orphanParentIds.length,
  "orphaned bookings preserved",
  `${orphans.size} vs ${orphanParentIds.length}`
);

const orphanRecordsStored = orphans.docs.reduce(
  (s, d) => s + (d.data().participants?.length ?? 0),
  0
);
check(
  orphanRecordsStored === orphanRecordCount,
  "orphaned participation records preserved",
  `${orphanRecordsStored} vs ${orphanRecordCount}`
);

console.log("\n▸ Participants");
const participantsInTrainings = trainings.docs.reduce(
  (s, d) => s + Object.keys(d.data().participants ?? {}).length,
  0
);

// Expected is the number of DISTINCT clubs per booking, not the number of
// source records: one club created a training and then also joined it, and the
// new model holds one entry per club.
let expectedParticipants = 0;
for (const res of reservations.docs) {
  const emails = new Set();
  const owner = String(res.data().user?.email ?? "").trim().toLowerCase();
  if (owner) emails.add(owner);
  else emails.add(`__noemail_${res.id}`);
  for (const j of joinedByParent.get(res.id) ?? []) {
    emails.add(String(j.data().email ?? "").trim().toLowerCase());
  }
  expectedParticipants += emails.size;
}

check(
  participantsInTrainings === expectedParticipants,
  "every distinct club carried over",
  `${participantsInTrainings} vs ${expectedParticipants}`
);

console.log("\n▸ Per-training integrity");
const byLegacyId = new Map(trainings.docs.map((d) => [d.data().legacyId, d]));

let fieldMismatches = 0;
let racersMismatches = 0;
let mirrorMismatches = 0;
let missingStartAt = 0;

for (const res of reservations.docs) {
  const t = byLegacyId.get(res.id);
  if (!t) {
    fieldMismatches += 1;
    continue;
  }
  const r = res.data();
  const d = t.data();

  if (
    d.date !== r.date ||
    d.session?.startTime !== r.session?.startTime ||
    d.lineNumber !== Number(r.lineNumber) ||
    d.courseId !== r.reservationDetails?.course
  ) {
    fieldMismatches += 1;
  }

  const sourceRacers =
    Number(r.user?.ownRacers ?? 0) +
    (joinedByParent.get(res.id) ?? []).reduce(
      (s, j) => s + Number(j.data().ownRacers ?? 0),
      0
    );
  if (d.racersTotal !== sourceRacers) racersMismatches += 1;

  const keys = Object.keys(d.participants ?? {});
  if (
    keys.length !== (d.participantUids ?? []).length ||
    keys.some((k) => !(d.participantUids ?? []).includes(k)) ||
    d.participantCount !== keys.length
  ) {
    mirrorMismatches += 1;
  }

  if (!d.startAt) missingStartAt += 1;
}

check(fieldMismatches === 0, "slot fields match the source", `${fieldMismatches} off`);
check(
  racersMismatches === 0,
  "racersTotal recomputed from participants",
  `${racersMismatches} off`
);
check(
  mirrorMismatches === 0,
  "participantUids mirrors the participants map",
  `${mirrorMismatches} off`
);
check(missingStartAt === 0, "every training has a startAt instant", `${missingStartAt} missing`);

console.log("\n▸ Recovered duplicates");
const dupes = trainings.docs.filter((d) => d.data().dataQuality === "duplicate-slot");
check(dupes.length === 3, "the 3 hidden double bookings survived", `${dupes.length} found`);
for (const d of dupes) {
  const t = d.data();
  console.log(`      ${t.date} ${t.session.startTime} line ${t.lineNumber} — ${t.clubs.join(", ")}`);
}

console.log("\n▸ Timestamps");
const sample = trainings.docs.find((d) => d.data().date && d.data().session?.startTime);
if (sample) {
  const t = sample.data();
  const local = t.startAt
    .toDate()
    .toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" });
  const expected = `${t.date} ${t.session.startTime}`;
  const ok = local.includes(t.session.startTime.replace(/^0/, ""));
  check(ok, "startAt round-trips to the local session time", `${expected} → ${local}`);
}

console.log("\n▸ Idempotency");
// A second run must produce byte-identical documents. Hash what is stored now;
// rerun the migration and compare to prove reruns converge rather than drift.
const hash = createHash("sha256");
for (const d of trainings.docs.sort((a, b) => a.id.localeCompare(b.id))) {
  hash.update(d.id);
  hash.update(JSON.stringify(d.data()));
}
console.log(`  trainings fingerprint: ${hash.digest("hex").slice(0, 32)}`);
console.log("  (rerun the migration, then this script, and compare)");

console.log("");
if (failures.length) {
  console.error(`✖ ${failures.length} check(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("✔ Migration verified.");
process.exit(0);
