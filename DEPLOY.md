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

## The migration window

Moving production onto the `trainings` model means copying a snapshot and then
pointing the app at it. Anything written in between lands in the old collections
*after* the copy was taken, and is simply lost — a booking a club made and can
still see on its screen, gone by the time the new app comes up. So the window is
closed to writes at both ends.

```bash
npm run db:pull              # 5 — this pull is the backup
npm run deploy:maintenance   # 6a — rules: every client write refused
npm run deploy:readonly      # 6b — banner, no booking controls
```

**The rules are the enforcement, not the banner.** A tab opened before the
window is still running the old bundle, and that bundle will happily write;
only the server can refuse it. `firestore.rules.maintenance` leaves the calendar
readable and denies every write, including an admin's. Cloud Functions are
unaffected — they use the Admin SDK, which bypasses rules, so verification and
password resets keep working. Covered by `tests/rules-maintenance.test.mjs`.

`npm run build:readonly` loads `.env.readonly`, which sets `VITE_READ_ONLY`.
That hides the booking, joining, editing, cancelling and confirming controls and
puts a banner across the top, so a club sees why rather than assuming the site
is broken. Writes also fail in the service layer, which catches any path that
was missed.

Then migrate, check, and bring the real thing up:

```bash
node scripts/migrate-trainings.mjs --target=prod --confirm
npm run deploy                # 9 — new frontend
npm run deploy:rules          # 9 — and the tightened rules, together
```

Rolling back any of this is `firebase hosting:rollback` plus deleting the three
new collections. Nothing above modifies an existing document.

## Dropping the old collections

Last, and days later — step 11. This is the only irreversible part of the move.

```bash
npm run db:pull                                                  # the backup
node scripts/drop-legacy-collections.mjs --target=prod --dry-run
node scripts/drop-legacy-collections.mjs --target=prod --confirm
```

It refuses to delete anything until every reservation is accounted for in
`trainings` (by `legacyId`) or in `trainingsOrphanedParticipants`, and every
`closedTracks` document has a matching `closures` document. A reservation nobody
migrated is a bug in the migration, and deleting it would destroy the evidence.
`--force` overrides the refusal and should not be needed.

On the emulator the dry run currently reports 705 reservations, 604 `addedUsers`
and 418 closed tracks — 1727 documents — with nothing unmatched.

## Known blocker for a real launch

The deployed Firestore and Storage rules are `allow read, write: if true`. Deploying
does not make that worse, but the app should not be used for real until it is fixed.
See [CLAUDE.md](CLAUDE.md).
