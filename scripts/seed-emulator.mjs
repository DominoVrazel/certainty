/**
 * Loads ./.firebase-seed into the running Firebase emulators.
 *
 * Never touches production: it refuses to start unless the emulator host env
 * vars are set, which `firebase emulators:exec` does for us.
 *
 * Run with:  npm run db:seed
 */
import admin from "firebase-admin";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { decode } from "./firestore-codec.mjs";

const PROJECT_ID = "certaintyapp";
const STORAGE_BUCKET = "certaintyapp.firebasestorage.app";
const SEED_DIR = path.resolve("./.firebase-seed");

// The Firebase CLI exports FIREBASE_STORAGE_EMULATOR_HOST as "host:port", but
// the Admin SDK's storage client reads STORAGE_EMULATOR_HOST and wants a full
// URL. Without this bridge the upload would silently go to production.
if (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST &&
  !process.env.STORAGE_EMULATOR_HOST
) {
  process.env.STORAGE_EMULATOR_HOST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
}

// Local accounts get one shared password — production hashes cannot be
// replayed against the emulator, so there is nothing to preserve.
const DEV_PASSWORD = process.env.DEV_PASSWORD || "Heslo123";

for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (!process.env[v]) {
    console.error(
      `✖ ${v} is not set — refusing to run so production cannot be overwritten.\n` +
        `  Use "npm run db:seed", which starts the emulators for you.`
    );
    process.exit(1);
  }
}

admin.initializeApp({
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
});
const db = admin.firestore();
const auth = admin.auth();

async function readSeed(name) {
  try {
    return JSON.parse(await readFile(path.join(SEED_DIR, name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`✖ Missing ${name} in ${SEED_DIR}. Run "npm run db:pull" first.`);
      process.exit(1);
    }
    throw err;
  }
}

async function seedFirestore() {
  const data = await readSeed("firestore.json");
  const writer = db.bulkWriter();
  let count = 0;

  let orphanParents = 0;
  let orphanChildren = 0;

  const writeDocs = (docs, parentRef, parentMissing = false) => {
    for (const entry of docs) {
      const ref = parentRef.doc(entry.id);

      // A missing parent must stay missing: writing a placeholder would hide
      // the very defect this snapshot exists to reproduce. Its children are
      // still written, so the emulator ends up with the same orphans as
      // production and the migration can be tested against them.
      if (entry.missing) {
        orphanParents += 1;
      } else {
        writer.set(ref, decode(entry.data, db));
        count += 1;
        if (parentMissing) orphanChildren += 1;
      }

      for (const [subName, subDocs] of Object.entries(entry.collections ?? {})) {
        writeDocs(subDocs, ref.collection(subName), entry.missing);
      }
    }
  };

  console.log("\n▸ Firestore");
  for (const [colName, docs] of Object.entries(data)) {
    const before = count;
    writeDocs(docs, db.collection(colName));
    console.log(`  ${colName}: ${count - before} docs`);
  }

  await writer.close();
  console.log(`  → ${count} documents written`);
  if (orphanParents) {
    console.log(
      `  → ${orphanChildren} orphaned records kept under ${orphanParents} deleted parents`
    );
  }
}

async function seedAuthUsers() {
  const users = await readSeed("auth-users.json");
  console.log("\n▸ Auth users");

  let created = 0;
  let skipped = 0;

  for (const u of users) {
    if (!u.email) {
      skipped += 1; // Emulator sign-in is email/password only.
      continue;
    }
    try {
      await auth.createUser({
        uid: u.uid,
        email: u.email,
        emailVerified: u.emailVerified,
        displayName: u.displayName ?? undefined,
        disabled: u.disabled,
        password: DEV_PASSWORD,
      });
      created += 1;
    } catch (err) {
      if (err.code === "auth/uid-already-exists" || err.code === "auth/email-already-exists") {
        skipped += 1;
      } else {
        console.warn(`  ! ${u.email}: ${err.message}`);
        skipped += 1;
      }
    }
  }

  console.log(`  → ${created} accounts created, ${skipped} skipped`);
  console.log(`  → local password for every account: ${DEV_PASSWORD}`);
}

/**
 * Snapshots the live emulator state so `npm run dev` can boot straight into it
 * via --import.
 *
 * The emulator always writes the export to a scratch directory and then renames
 * it onto the target path. On Windows that rename fails with EPERM because the
 * Java emulator process still holds handles on the files it just wrote. The
 * data itself is complete by then, so we let the rename fail and hand the
 * scratch directory to finalize-export.mjs, which moves it once the emulators
 * have shut down and released their handles.
 */
async function exportState() {
  const hub = process.env.FIREBASE_EMULATOR_HUB;
  if (!hub) {
    console.warn("\n! FIREBASE_EMULATOR_HUB not set — skipping state export.");
    return;
  }

  const target = path.resolve("./.emulator-data");
  await rm(target, { recursive: true, force: true });

  const res = await fetch(`http://${hub}/_admin/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: target, initiatedBy: "seed-emulator.mjs" }),
  });

  if (res.ok) {
    console.log(`\n▸ State exported to ${target}`);
    return;
  }

  const body = await res.text();
  if (body.includes("EPERM")) {
    console.log("\n▸ State written (rename deferred — see finalize-export.mjs)");
    return;
  }
  throw new Error(`Export failed (${res.status}): ${body}`);
}

// Clear scratch directories from an earlier failed run so finalize-export.mjs
// cannot pick up a stale one.
for (const entry of await readdir(".")) {
  if (entry.startsWith("firebase-export-")) {
    await rm(entry, { recursive: true, force: true });
  }
}

/**
 * Uploads the resort logos. The landing page reads them straight from Storage
 * (App.tsx listAll on `resorts/{id}/logo/`), so without this the local app
 * renders every resort without its image.
 */
async function seedStorage() {
  console.log("\n▸ Storage");

  if (!process.env.STORAGE_EMULATOR_HOST) {
    console.warn("  ! storage emulator not running — skipping");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(path.join(SEED_DIR, "storage-manifest.json"), "utf8")
    );
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.warn('  ! no storage-manifest.json — rerun "npm run db:pull"');
    return;
  }

  const bucket = admin.storage().bucket();
  for (const entry of manifest) {
    const contents = await readFile(
      path.join(SEED_DIR, "storage", entry.localName)
    );
    await bucket.file(entry.path).save(contents, {
      contentType: entry.contentType,
      resumable: false,
    });
    console.log(`  ${entry.path}`);
  }
  console.log(`  → ${manifest.length} files uploaded`);
}

await seedFirestore();
await seedAuthUsers();
await seedStorage();
await exportState();

console.log("\n✔ Emulators seeded.");
process.exit(0);
