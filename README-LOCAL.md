# Local development

The app runs fully offline against the Firebase Emulator Suite — Firestore, Auth,
Cloud Functions, Storage and email. Production is never touched.

## One-time setup

Authenticate once so the pull script can read production:

```bash
gcloud auth application-default login
```

That is all. The emulators need JDK 21+, but `scripts/with-jdk.mjs` finds an
installed one and puts it on PATH for the emulator process, so you do not have to
touch any environment variables. It prints which JDK it picked on startup.

## Loading data

Copy production into your local emulators. Run these two once (and again whenever
you want fresher data):

```bash
npm run db:pull
```

```bash
npm run db:seed
```

- `db:pull` reads production **read-only** and writes a snapshot to
  `./.firebase-seed` — all Firestore collections plus the list of Auth accounts.
- `db:seed` loads that snapshot into the emulators and saves the result to
  `./.emulator-data`, which is what the app boots from.

Both directories are gitignored. **`.firebase-seed` contains real user data — never
commit it.**

## Running

```bash
npm run dev
```

| Port | What |
| --- | --- |
| 5174 | The app (Vite) |
| 4000 | Emulator UI — browse and edit local Firestore/Auth data |
| 1080 | Local inbox — every email the app sends while developing |
| 8080 / 9099 / 9199 / 5001 | Firestore / Auth / Storage / Functions emulators |

The browser console prints a green `Firebase emulators connected` line so you can
tell at a glance which backend you are on.

The Hosting emulator is deliberately left out. It would serve the prebuilt `dist/`
folder on port 5000, which is a trap: `npm run build` runs in the default Vite mode,
so that bundle has no `VITE_USE_EMULATORS` and talks to **production** while looking
identical to the local app. Deploys are unaffected — `npm run deploy` still uses the
`hosting` block in `firebase.json`.

## Email

Emails work locally and behave as they do in production — same nodemailer call, same
rendered templates, same recipients — except delivery goes to a local SMTP server
(MailDev) instead of Gmail. Read them at <http://localhost:1080>.

This matters because the local database is seeded from production, so it is full of
real addresses. Without it, testing a reservation would email an actual person.
`functions/src/index.ts` picks the transport off `FUNCTIONS_EMULATOR`, so the
deployed function is untouched and still sends through Gmail.

Links inside those emails point at `http://localhost:5174` rather than the live site,
because `functions/.env.local` overrides the URL params. The Firebase CLI loads
`.env.local` **only** under the emulator — it is never deployed.

## Logging in locally

Production password hashes cannot be replayed against the Auth emulator, so every
migrated account gets the same local password:

```
Heslo123
```

Use any migrated email with it, for example `viliam.juris@bachledka.sk` for an admin
account. Override the password with the `DEV_PASSWORD` env var before `db:seed`.

## Other scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Emulators + Vite + local inbox. The normal way to work. |
| `npm run dev:cloud` | Vite alone, against **production** Firebase. Use sparingly. |
| `npm run emu` | Emulators only, no Vite. |
| `npm run db:pull` | Refresh the production snapshot. |
| `npm run db:seed` | Reload the emulators from the snapshot. |
| `npm run deploy` | Deploy hosting only. |

Local edits are discarded when you stop `npm run dev`; rerun `npm run db:seed` to get
back to a known state.

## How the wiring works

`src/services/FirebaseService.ts` is the only place that connects to emulators. It
switches on `VITE_USE_EMULATORS`, which `.env.emulator` sets and `npm run dev`
selects via `vite --mode emulator`. Import `db`, `auth`, `storage` and `functions`
from that module — never call `getFunctions()` or `getFirestore()` directly in a
component, or it will bypass the emulator and hit production.

In a production build `import.meta.env` has no `VITE_USE_EMULATORS`, so the guard
compiles to a constant false and the emulator branch never runs. It is still present
in the bundle as dead code; that is harmless, just slightly wasted bytes.

## Why the JDK is handled in code

`firebase-tools` requires JDK 21+ and resolves `java` from PATH — it **ignores
`JAVA_HOME`**. On this machine JDK 11 sits in the *machine* PATH, which the user
PATH cannot override, so `setx` does not help without admin rights. Rather than
make that everyone's problem, `scripts/with-jdk.mjs` scans the usual install
locations, picks the newest JDK 21+, and prepends it to PATH for the child process
only.

## Security note

The Firestore and Storage rules deployed to production are wide open
(`allow read, write: if true`). `firestore.rules` and `storage.rules` mirror that so
local behaviour matches production. See [CLAUDE.md](CLAUDE.md) — this needs fixing
before the app is used for real.
