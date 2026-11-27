/**
 * Reads that give up rather than hang.
 *
 * Firestore's client retries internally for as long as it takes and never
 * produces an error for a stalled connection, so a screen waiting on a list
 * waited for ever. These are the two numbers that stop that: a deadline, and
 * how many times it is worth starting over.
 *
 *   npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TimeoutError,
  withTimeout,
  readWithRetry,
  explainFirebaseError,
} from "../src/services/resilience.ts";

const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("a deadline", () => {
  test("passes a value straight through", async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
  });

  test("gives up on something that never settles", async () => {
    await assert.rejects(() => withTimeout(never(), 30), TimeoutError);
  });

  test("passes the original failure through, not a timeout", async () => {
    const boom = new Error("refused");
    await assert.rejects(() => withTimeout(Promise.reject(boom), 1000), /refused/);
  });
});

describe("trying again", () => {
  test("a read that works first time is run once", async () => {
    let calls = 0;
    const value = await readWithRetry(async () => {
      calls += 1;
      return "ok";
    });
    assert.equal(calls, 1);
    assert.equal(value, "ok");
  });

  test("a read that stalls once succeeds on the retry", async () => {
    // The point of the whole thing: the first attempt hangs, the second
    // returns, and the caller never sees the stall.
    let calls = 0;
    const value = await readWithRetry(
      () => {
        calls += 1;
        return calls === 1 ? never() : Promise.resolve("ok");
      },
      { timeoutMs: 30, backoffMs: 1 }
    );
    assert.equal(calls, 2);
    assert.equal(value, "ok");
  });

  test("it starts a fresh read each time rather than awaiting the same one", async () => {
    // A promise that is already hanging will go on hanging, so a retry has
    // to call the function again. This fails if `read` is ever hoisted.
    const started = [];
    await assert.rejects(
      () =>
        readWithRetry(
          () => {
            started.push(Date.now());
            return never();
          },
          { timeoutMs: 20, attempts: 3, backoffMs: 1 }
        ),
      TimeoutError
    );
    assert.equal(started.length, 3);
  });

  test("the last failure is what reaches the caller", async () => {
    await assert.rejects(
      () =>
        readWithRetry(() => Promise.reject(new Error("permission-denied")), {
          attempts: 2,
          backoffMs: 1,
        }),
      /permission-denied/
    );
  });

  test("it waits longer between each attempt", async () => {
    const at = [];
    await assert.rejects(
      () =>
        readWithRetry(
          () => {
            at.push(Date.now());
            return Promise.reject(new Error("no"));
          },
          { attempts: 3, backoffMs: 40 }
        ),
      /no/
    );
    assert.equal(at.length, 3);
    assert.ok(at[2] - at[1] > at[1] - at[0], "second wait should be longer");
  });
});

describe("saying what went wrong", () => {
  test("a timeout reads as a connection problem", () => {
    assert.match(explainFirebaseError(new TimeoutError(8000)), /neodpovedal/i);
  });

  test("a refusal points at the session, not the network", () => {
    // These three mean very different things to the person reading them,
    // and "nepodarilo sa" helped with none of them.
    assert.match(
      explainFirebaseError({ code: "permission-denied" }),
      /oprávnenie/i
    );
    assert.match(explainFirebaseError({ code: "unauthenticated" }), /vypršalo/i);
    assert.match(explainFirebaseError({ code: "unavailable" }), /spojiť/i);
  });

  test("anything else still says something", () => {
    assert.match(explainFirebaseError(new Error("čosi")), /čosi/);
    assert.match(explainFirebaseError(null), /Skúste to znova/);
  });
});
