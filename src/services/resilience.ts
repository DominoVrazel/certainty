/**
 * Reads that give up, say so, and can be tried again.
 *
 * The app had no answer to a read that never finished. Firestore's web client
 * multiplexes every query onto one connection and retries internally for as
 * long as it takes, with no deadline — so a stalled connection does not
 * produce an error, it produces nothing at all. The screen that was waiting
 * for a list simply showed an empty one, for ever, with no message and no way
 * to retry short of reloading the page.
 *
 * That was reachable in testing often enough to be worth fixing on its own,
 * and it is exactly what a club on a patchy signal in a valley would meet.
 *
 * These helpers are deliberately small: a deadline, a couple of retries, and
 * an error the caller can show. Nothing here hides a failure — the point is
 * to surface one instead of waiting silently.
 */

export class TimeoutError extends Error {
  // Written out rather than declared as a constructor parameter property:
  // that is TypeScript which emits code, and Node's type stripping — which
  // is how the unit tests load this file — refuses it.
  readonly ms: number;

  constructor(ms: number) {
    super(`Odpoveď neprišla do ${Math.round(ms / 1000)} s.`);
    this.name = "TimeoutError";
    this.ms = ms;
  }
}

/** Rejects if the promise has not settled in time. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface RetryOptions {
  /** How long one attempt may take. */
  timeoutMs?: number;
  /** How many attempts in total, the first one included. */
  attempts?: number;
  /** Waited before the second attempt, doubled before each one after. */
  backoffMs?: number;
}

/**
 * Runs a read with a deadline, and tries again if it misses it.
 *
 * `read` is a function rather than a promise because a retry has to start a
 * fresh query: a promise that is already hanging will go on hanging.
 *
 * The last failure is thrown, so the caller can tell a timeout from a refusal
 * and say something useful about it.
 */
export async function readWithRetry<T>(
  read: () => Promise<T>,
  { timeoutMs = 8000, attempts = 3, backoffMs = 400 }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(read(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * What to tell somebody about a failed read or write.
 *
 * A Firestore error carries a `code`, and the three that actually happen mean
 * very different things to the person looking at the screen: their session has
 * gone, the connection has, or something else entirely. "Nepodarilo sa" covers
 * all three and helps with none.
 */
export function explainFirebaseError(error: unknown): string {
  if (error instanceof TimeoutError) {
    return "Server neodpovedal včas. Skontrolujte pripojenie a skúste to znova.";
  }

  const code = (error as { code?: string } | null)?.code ?? "";

  if (code.includes("permission-denied")) {
    return "Nemáte oprávnenie na túto zmenu. Skúste sa odhlásiť a znova prihlásiť.";
  }
  if (code.includes("unauthenticated")) {
    return "Vaše prihlásenie vypršalo. Prihláste sa prosím znova.";
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return "Nepodarilo sa spojiť so serverom. Skontrolujte pripojenie a skúste to znova.";
  }

  const message = (error as { message?: string } | null)?.message;
  return message ? `Nepodarilo sa: ${message}` : "Nepodarilo sa. Skúste to znova.";
}
