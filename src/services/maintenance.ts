/**
 * Read-only mode, for the migration window.
 *
 * Moving production onto the `trainings` model means copying a snapshot and
 * then pointing the app at it. Anything written in between would land in the
 * old collections after the copy had already been taken, and would simply be
 * lost — a booking a club made and can still see on screen, gone by the time
 * the new app comes up.
 *
 * What actually stops those writes is the rules: `firestore.rules.maintenance`
 * denies every client write, so a browser tab left open since before the window
 * cannot write either. This flag is the other half — it explains why, and keeps
 * the app from offering controls that are now certain to fail.
 *
 * Build it with `npm run build:readonly`, which loads `.env.readonly`.
 */
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === "true";

export class ReadOnlyError extends Error {
  constructor() {
    super(
      "Prebieha údržba systému. Rezervácie sú dočasne pozastavené, skúste to prosím o chvíľu."
    );
    this.name = "ReadOnlyError";
  }
}

/**
 * Refuses a write while the app is in read-only mode.
 *
 * Called in the service layer rather than at each button, so a path somebody
 * forgets to hide still fails here with a sentence a club can read, instead of
 * reaching Firestore and coming back as "Missing or insufficient permissions".
 */
export function assertWritable(): void {
  if (READ_ONLY) throw new ReadOnlyError();
}
