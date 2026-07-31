# certainty

Ski training reservation app (bachelor's thesis). React + Vite frontend, Firebase
backend (Firestore, Auth, Cloud Functions, Storage), project id `certaintyapp`.

## Local development

Everything runs against the Firebase Emulator Suite — see [README-LOCAL.md](README-LOCAL.md).
For shipping, see [DEPLOY.md](DEPLOY.md); nothing needs switching back before a deploy.

```bash
npm run dev
```

Key points:
- `src/services/FirebaseService.ts` is the **only** place that connects to Firebase.
  Import `db`, `auth`, `storage`, `functions` from it. Never call `getFirestore()`,
  `getAuth()` or `getFunctions()` directly in a component — that bypasses the
  emulator and silently hits production.
- `npm run dev:cloud` runs against production. Use deliberately, not by habit.
- `.firebase-seed/` holds a snapshot of real production user data. Gitignored, and
  must stay that way.

## Known issues — need fixing

### 1. Firestore and Storage rules are wide open

Both deployed rulesets are:

```
allow read, write: if true;
```

`firestore.rules` and `storage.rules` mirror production so local behaviour matches.
The web API key ships in the client bundle (public by design), so with these rules
anyone who loads the site can read and write the whole database — including the
`users` collection (~107 real names, emails, phone numbers) and the
`user_sessions` / `verify_user_sessions` collections holding password-reset UUIDs.

Fix: least-privilege rules. `users` doc IDs equal the Auth UID, and admin screens
gate on the `isAdmin` boolean, so both are available to rules.

## Fixed

### Functions runtime was decommissioned

`functions/package.json` declared Node 18, which Google decommissioned on
2025-10-30 — every functions deploy failed with a runtime error. Now Node 22.
Found with `npm run deploy:check`, which is worth running before any deploy.

### `params.value()` in function config

`onRequest`'s options object is evaluated at deploy time, before Params resolve, so
`cors: [..., appDomain.value()]` warned and risked baking in an empty origin. `cors`
is typed as plain strings and cannot take a Param either, so it now reads
`process.env.APP_DOMAIN`, which the CLI has already loaded from `.env` (or
`.env.local` under the emulator). Deployed allow-list resolves to
`["http://localhost:5173", "http://127.0.0.1:5173", "https://certaintyapp.web.app"]`.

Note that `emailApp` also sets `Access-Control-Allow-Origin: *` inside the handler,
which overrides the `cors` option for actual requests. Worth deciding whether that
wildcard is intended — it is the reason any origin is accepted today.

### Emails and local URLs

`functions/src/index.ts` now selects its nodemailer transport off
`FUNCTIONS_EMULATOR`: production still sends through Gmail, the emulator delivers to
a local MailDev inbox. `functions/.env.local` overrides the URL params so local
emails link to `localhost:5173`. See [README-LOCAL.md](README-LOCAL.md).
