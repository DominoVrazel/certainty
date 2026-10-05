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
const STORAGE_BUCKET = "certaintyapp.firebasestorage.app";
const OUT_DIR = path.resolve("./.firebase-seed");

// Refuse to run if the emulator env vars are set — otherwise we would "pull"
// from the emulator and silently overwrite the seed with empty data.
for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (process.env[v]) {
    console.error(`✖ ${v} is set. Unset it — this script must read production.`);
    process.exit(1);
  }
}

const credential = admin.credential.applicationDefault();

admin.initializeApp({
  credential,
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
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

/**
 * Recursively reads a collection and every subcollection beneath it.
 *
 * Deleting a document does NOT delete its subcollections — the parent becomes a
 * "missing" document that still owns children. Production currently holds 101
 * such orphaned `addedUsers` records under 66 deleted reservations: clubs whose
 * training vanished when the booking club cancelled.
 *
 * `ref.get()` returns only documents that exist, so it cannot see them.
 * `ref.listDocuments()` does return references to missing parents, which is why
 * the id list and the document data are gathered separately here.
 */
async function dumpCollection(ref, depth = 1) {
  const [snap, refs] = await Promise.all([ref.get(), ref.listDocuments()]);

  // One query supplies every existing document's data; listDocuments supplies
  // the complete id list, including parents that no longer exist.
  const dataById = new Map(snap.docs.map((d) => [d.id, d.data()]));

  const docs = await mapPooled(refs, async (docRef) => {
    const data = dataById.get(docRef.id);
    const entry = data
      ? { id: docRef.id, data: encode(data) }
      : { id: docRef.id, missing: true, data: null };

    const subs = await docRef.listCollections();
    if (subs.length) {
      entry.collections = {};
      for (const sub of subs) {
        entry.collections[sub.id] = await dumpCollection(sub, depth + 1);
      }
    }
    return entry;
  });

  const orphaned = docs.filter((d) => d.missing).length;
  const suffix = orphaned ? ` (+${orphaned} deleted, children kept)` : "";
  console.log(
    `${"  ".repeat(depth)}${ref.id}: ${docs.length - orphaned} docs${suffix}`
  );
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

/**
 * A real Auth backup, as opposed to the emulator seed above.
 *
 * Firebase Auth has no managed backup — Firestore's scheduled backups and PITR
 * do not cover it. If the accounts were lost, this file is the only way back,
 * and `users/{uid}` documents are keyed by Auth uid, so losing Auth also breaks
 * every Firestore reference to a person.
 *
 * Password hashes alone are useless: restoring them requires the project's hash
 * parameters (algorithm, signer key, salt separator, rounds, memory cost), which
 * live in the Auth config rather than the export. Both are captured here.
 *
 * The signer key is a SECRET. This file stays in the gitignored snapshot
 * directory and must never be committed or shared.
 */
async function dumpAuthBackup() {
  console.log("\n▸ Auth backup (with password hashes)");

  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      users.push({
        localId: u.uid,
        email: u.email ?? undefined,
        emailVerified: u.emailVerified,
        displayName: u.displayName ?? undefined,
        phoneNumber: u.phoneNumber ?? undefined,
        photoURL: u.photoURL ?? undefined,
        disabled: u.disabled,
        passwordHash: u.passwordHash ?? undefined,
        salt: u.passwordSalt ?? undefined,
        createdAt: u.metadata.creationTime,
        lastSignedInAt: u.metadata.lastSignInTime ?? undefined,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // Reuse the Application Default Credentials the app is already initialised
  // with, rather than shelling out to gcloud (which is a .cmd on Windows and
  // not directly spawnable).
  const { access_token: token } = await credential.getAccessToken();

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": PROJECT_ID,
      },
    }
  );
  if (!res.ok) {
    throw new Error(
      `Could not read Auth hash config (${res.status}). The password hashes ` +
        `would be unrestorable without it, so the backup is incomplete.`
    );
  }
  const hashConfig = (await res.json())?.signIn?.hashConfig;
  if (!hashConfig?.signerKey) {
    throw new Error("Auth hash config came back without a signer key.");
  }

  const withHashes = users.filter((u) => u.passwordHash).length;
  console.log(`  accounts: ${users.length} (${withHashes} with a password hash)`);
  console.log(`  hash algorithm: ${hashConfig.algorithm}`);

  return { hashConfig, users };
}


/**
 * Storage holds the resort logos the landing page renders. Without them the
 * local app shows resorts with no image, so the snapshot has to carry the
 * files as well as the database.
 */
async function dumpStorage() {
  console.log("\n▸ Storage");
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles();
  const dir = path.join(OUT_DIR, "storage");
  await mkdir(dir, { recursive: true });

  const manifest = [];
  for (const file of files) {
    const localName = encodeURIComponent(file.name);
    const [contents] = await file.download();
    await writeFile(path.join(dir, localName), contents);
    manifest.push({
      path: file.name,
      localName,
      contentType: file.metadata.contentType ?? "application/octet-stream",
      size: Number(file.metadata.size ?? contents.length),
    });
    console.log(`  ${file.name}`);
  }

  console.log(`  storage: ${manifest.length} files`);
  return manifest;
}

const firestore = await dumpFirestore();
const authUsers = await dumpAuthUsers();
const authBackup = await dumpAuthBackup();
const storage = await dumpStorage();

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  path.join(OUT_DIR, "firestore.json"),
  JSON.stringify(firestore, null, 2)
);
await writeFile(
  path.join(OUT_DIR, "auth-users.json"),
  JSON.stringify(authUsers, null, 2)
);
await writeFile(
  path.join(OUT_DIR, "auth-backup.json"),
  JSON.stringify(authBackup, null, 2)
);
await writeFile(
  path.join(OUT_DIR, "storage-manifest.json"),
  JSON.stringify(storage, null, 2)
);

console.log(`\n✔ Snapshot written to ${OUT_DIR}`);
console.log("  Next: npm run db:seed");
process.exit(0);
