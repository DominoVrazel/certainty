/**
 * The two deadlines a resort sets: how late a club may book, and how late it
 * may change what it booked.
 *
 * Pure functions of settings and two instants, which is exactly why they are
 * worth testing here rather than only through the UI — the boundary is the
 * whole of it, and `firestore.rules` has to agree with it.
 *
 *   npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CUTOFFS,
  cutoffsFrom,
  clubMayChange,
  mayBook,
  describeCutoff,
} from "../src/services/policy.ts";

const HOUR = 60 * 60 * 1000;
const nowMs = Date.UTC(2026, 10, 27, 10, 0, 0);
const todayIso = "2026-11-27";
const at = (h) => ({ dateIso: todayIso, startAtMs: nowMs + h * HOUR });

describe("what a resort document says", () => {
  test("an empty one means what the app did before the setting existed", () => {
    assert.deepEqual(cutoffsFrom({}), DEFAULT_CUTOFFS);
    assert.deepEqual(cutoffsFrom(null), DEFAULT_CUTOFFS);
    assert.equal(DEFAULT_CUTOFFS.bookingCutoffMode, "day");
    assert.equal(DEFAULT_CUTOFFS.changeCutoffMinutes, 120);
  });

  test("nonsense is ignored rather than obeyed", () => {
    // A zero or a negative would quietly switch the limit off, and nobody
    // should be able to do that by accident.
    const c = cutoffsFrom({
      changeCutoffMinutes: 0,
      bookingCutoffMinutes: -5,
      changeCutoffMode: "sometimes",
    });
    assert.equal(c.changeCutoffMinutes, 120);
    assert.equal(c.bookingCutoffMinutes, 120);
    assert.equal(c.changeCutoffMode, "minutes");
  });

  test("a real value is kept", () => {
    const c = cutoffsFrom({ changeCutoffMinutes: 45, bookingCutoffMode: "minutes" });
    assert.equal(c.changeCutoffMinutes, 45);
    assert.equal(c.bookingCutoffMode, "minutes");
  });
});

describe("changing a booking", () => {
  const c = DEFAULT_CUTOFFS;
  const now = { todayIso, nowMs };

  test("open well before the start", () => {
    assert.equal(clubMayChange(c, at(5), now), true);
  });

  test("closed inside the two hours", () => {
    assert.equal(clubMayChange(c, at(1), now), false);
  });

  test("the boundary itself is closed, not open", () => {
    // Inclusive would let a club edit in the same second the resort stops
    // expecting changes.
    assert.equal(clubMayChange(c, at(2), now), false);
    assert.equal(
      clubMayChange(c, { dateIso: todayIso, startAtMs: nowMs + 2 * HOUR + 1000 }, now),
      true
    );
  });

  test("closed once it has started", () => {
    assert.equal(clubMayChange(c, at(-1), now), false);
  });

  test("a training with no start instant is closed", () => {
    // Rather than treating a missing time as "far away", which would open the
    // window on exactly the documents we know least about.
    assert.equal(clubMayChange(c, { dateIso: todayIso, startAtMs: null }, now), false);
  });

  test("the day mode closes the whole day", () => {
    const day = { ...c, changeCutoffMode: "day" };
    assert.equal(clubMayChange(day, at(10), now), false);
    assert.equal(
      clubMayChange(day, { dateIso: "2026-11-28", startAtMs: nowMs + 24 * HOUR }, now),
      true
    );
  });
});

describe("booking a free slot", () => {
  const now = { todayIso, nowMs };

  test("the default closes the day of the training", () => {
    assert.equal(mayBook(DEFAULT_CUTOFFS, at(5), now), false);
    assert.equal(
      mayBook(DEFAULT_CUTOFFS, { dateIso: "2026-11-28", startAtMs: nowMs + 24 * HOUR }, now),
      true
    );
  });

  test("a resort can open it to a couple of hours before", () => {
    const c = { ...DEFAULT_CUTOFFS, bookingCutoffMode: "minutes", bookingCutoffMinutes: 120 };
    assert.equal(mayBook(c, at(5), now), true);
    assert.equal(mayBook(c, at(1), now), false);
  });
});

describe("telling a club what the limit is", () => {
  test("whole hours read as hours", () => {
    assert.match(describeCutoff(DEFAULT_CUTOFFS, "change"), /2 hodiny pred/);
  });

  test("anything else reads as minutes", () => {
    const c = { ...DEFAULT_CUTOFFS, changeCutoffMinutes: 90 };
    assert.match(describeCutoff(c, "change"), /90 minút pred/);
  });

  test("the day mode says so plainly", () => {
    assert.equal(describeCutoff(DEFAULT_CUTOFFS, "booking"), "v deň tréningu");
  });
});
