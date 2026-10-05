/**
 * Confirms the emulator reproduces production's orphaned participation records.
 *
 * Deleting a reservation leaves its `addedUsers` subcollection behind, so those
 * clubs lose their training and the records become unreachable. The migration
 * has to handle them, which means the local snapshot must contain them — this
 * check proves it does.
 *
 * Read-only. Run with:  npm run db:verify
 */
import admin from "firebase-admin";

const PROJECT_ID = "certaintyapp";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const all = await db.collectionGroup("addedUsers").get();

const byParent = new Map();
for (const doc of all.docs) {
  const parent = doc.ref.parent.parent;
  if (!byParent.has(parent.path)) {
    byParent.set(parent.path, { ref: parent, children: [] });
  }
  byParent.get(parent.path).children.push(doc.id);
}

const refs = [...byParent.values()].map((p) => p.ref);
const snaps = [];
for (let i = 0; i < refs.length; i += 300) {
  snaps.push(...(await db.getAll(...refs.slice(i, i + 300))));
}

let orphanParents = 0;
let orphanRecords = 0;
const examples = [];

for (const snap of snaps) {
  if (snap.exists) continue;
  orphanParents += 1;
  const entry = byParent.get(snap.ref.path);
  orphanRecords += entry.children.length;
  if (examples.length < 3) {
    examples.push(`${snap.ref.id} → ${entry.children.join(", ")}`);
  }
}

const liveReservations = (await db.collection("reservations").get()).size;

console.log("Emulator contents");
console.log(`  live reservations       : ${liveReservations}`);
console.log(`  participation records   : ${all.size}`);
console.log(`  of those orphaned       : ${orphanRecords}`);
console.log(`  deleted parent bookings : ${orphanParents}`);

if (examples.length) {
  console.log("\n  examples (deleted booking → stranded clubs):");
  examples.forEach((e) => console.log(`    ${e}`));
}

const EXPECTED_ORPHAN_RECORDS = 101;
const EXPECTED_ORPHAN_PARENTS = 66;

if (
  orphanRecords !== EXPECTED_ORPHAN_RECORDS ||
  orphanParents !== EXPECTED_ORPHAN_PARENTS
) {
  console.error(
    `\n✖ Expected ${EXPECTED_ORPHAN_RECORDS} orphaned records under ` +
      `${EXPECTED_ORPHAN_PARENTS} deleted bookings.\n` +
      `  Either the snapshot predates the listDocuments() fix in ` +
      `pull-prod-data.mjs, or production has changed — re-run db:pull and ` +
      `update these numbers deliberately.`
  );
  process.exit(1);
}

console.log("\n✔ Orphaned records reproduced locally; migration can be tested.");
process.exit(0);
