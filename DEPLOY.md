# Deploying to production

## There is nothing to switch back

The local setup is selected by environment, not by editing files. Every local-only
behaviour is off by default and only turns on under the emulator, so a working tree
that runs locally is already in a deployable state.

| Local-only behaviour | What disables it in production |
| --- | --- |
| Emulator connections in `src/services/FirebaseService.ts` | Guarded by `VITE_USE_EMULATORS`, set only in `.env.emulator`, which Vite loads only for `--mode emulator`. `npm run build` uses the default mode, so the guard compiles to a constant `false`. |
| Emails delivered to the local inbox | `functions/src/index.ts` branches on `FUNCTIONS_EMULATOR`, which only the emulator sets. Deployed functions take the Gmail path. |
| `localhost:5173` links inside emails | Come from `functions/.env.local`, which the Firebase CLI loads **only** for the emulator. The dry run confirms this — it logs `Loaded environment variables from .env.` with no `.env.local`. |
| MailDev | A root devDependency. Functions deploy from `functions/package.json`; Hosting deploys `dist/` only. |
| `.firebase-seed/`, `.emulator-data/` | Gitignored, and outside `dist/`, so no deploy target includes them. |

You never need to edit a file, comment a line back in, or remember a flag before
deploying.

## Check before you deploy

```bash
npm run deploy:check
```

This runs `firebase deploy --dry-run`: it compiles the rules, builds the functions
and packages everything, but changes nothing in the project. Run it whenever you are
unsure — it is the cheapest way to find a blocker.

## Deploying

Hosting — this is the usual one. It rebuilds first, so you cannot ship a stale
bundle:

```bash
npm run deploy
```

Cloud Functions:

```bash
npm run deploy:functions
```

Security rules:

```bash
npm run deploy:rules
```

## Things worth knowing

**Plain `firebase deploy` now covers more than it used to.** `firebase.json` gained
`firestore` and `storage` sections so the emulator could load the real rules. A
bare `firebase deploy` therefore also pushes `firestore.rules` and `storage.rules`.
They currently match what is live, so nothing changes — but prefer the `--only`
scripts above so a deploy does exactly what you meant.

**The functions runtime was Node 18, which Google decommissioned on 2025-10-30.**
Any functions deploy failed outright until `functions/package.json` was moved to
Node 22. If you see a runtime error on deploy, check that field first.

**Gmail credentials are not in the repo.** Deployed functions read `GMAIL_USER` and
`GMAIL_TOKEN` from Google Secret Manager. `functions/.secret.local` is for the
emulator only and stays gitignored — though nothing local sends through Gmail any
more, so it is no longer needed for day-to-day work.

**`npm install` is required after a fresh clone** before `npm run dev`, because the
local mail inbox (MailDev) is a devDependency.

## Known blocker for a real launch

The deployed Firestore and Storage rules are `allow read, write: if true`. Deploying
does not make that worse, but the app should not be used for real until it is fixed.
See [CLAUDE.md](CLAUDE.md).
