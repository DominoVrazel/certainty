/**
 * Pulls a snapshot of the PRODUCTION Firebase project into ./.firebase-seed.
 *
 * Read-only against production. Nothing is written to the cloud.
 * Authenticates with Application Default Credentials:
 *     gcloud auth application-default login
 *
 * Run with:  npm run db:pull
 */
import admin from "firebase-admin";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { encode } from "./firestore-codec.mjs";

const PROJECT_ID = "certaintyapp";
const OUT_DIR = path.resolve("./.firebase-seed");

// Refuse to run if the emulator env vars are set — otherwise we would "pull"
// from the emulator and silently overwrite the seed with empty data.
for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (process.env[v]) {
    console.error(`✖ ${v} is set. Unset it — this script must read production.`);
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

/**
 * Discovering subcollections costs one round trip per document, so a few
 * thousand documents pulled one at a time takes minutes. Run them in a bounded
 * pool instead — bounded so we do not open a socket per document.
 */
const CONCURRENCY = 50;

async function mapPooled(items, fn) {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
  );
  return results;
}

/** Recursively reads a collection and every subcollection beneath it. */
async function dumpCollection(ref, depth = 1) {
  const snap = await ref.get();

  const docs = await mapPooled(snap.docs, async (doc) => {
    const entry = { id: doc.id, data: encode(doc.data()) };

    const subs = await doc.ref.listCollections();
    if (subs.length) {
      entry.collections = {};
      for (const sub of subs) {
        entry.collections[sub.id] = await dumpCollection(sub, depth + 1);
      }
    }
    return entry;
  });

  console.log(`${"  ".repeat(depth)}${ref.id}: ${docs.length} docs`);
  return docs;
}

async function dumpFirestore() {
  console.log("\n▸ Firestore");
  const collections = await db.listCollections();
  const out = {};
  for (const col of collections) {
    out[col.id] = await dumpCollection(col);
  }
  return out;
}

async function dumpAuthUsers() {
  console.log("\n▸ Auth users");
  const users = [];
  let pageToken;

  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      users.push({
        uid: u.uid,
        email: u.email ?? null,
        emailVerified: u.emailVerified,
        displayName: u.displayName ?? null,
        phoneNumber: u.phoneNumber ?? null,
        photoURL: u.photoURL ?? null,
        disabled: u.disabled,
        // Password hashes are deliberately NOT copied: the emulator cannot
        // verify production scrypt hashes. The seed script assigns a shared
        // local-only password instead.
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`  users: ${users.length} accounts`);
  return users;
}

const firestore = await dumpFirestore();
const authUsers = await dumpAuthUsers();

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  path.join(OUT_DIR, "firestore.json"),
  JSON.stringify(firestore, null, 2)
);
await writeFile(
  path.join(OUT_DIR, "auth-users.json"),
  JSON.stringify(authUsers, null, 2)
);

console.log(`\n✔ Snapshot written to ${OUT_DIR}`);
console.log("  Next: npm run db:seed");
process.exit(0);
