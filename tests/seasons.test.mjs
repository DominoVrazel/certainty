/**
 * The season-selection rules, run against the exact data that broke in
 * production.
 *
 * These are pure functions over date strings, so they need no emulator — which
 * is the point of having pulled them out of the page. The old logic lived
 * inside a component and compared a season's *name* to a string built from
 * today's date, so there was nothing to test and nothing to notice.
 *
 *   node --test tests/seasons.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The source is TypeScript and these are two small pure functions, so rather
// than add a build step for the test runner, strip the annotations.
const source = readFileSync("src/services/seasons.ts", "utf8")
  .replace(/^import[^;]+;$/gm, "")
  .replace(/export function (\w+)\(([\s\S]*?)\):[^{]+\{/g, "function $1($2) {")
  .replace(/export const/g, "const")
  .replace(/: Season\[\]/g, "")
  .replace(/: string/g, "")
  .replace(/: \{ startDate[^}]+\}/g, "")
  .replace(/\(seasons: Season\[\]\)/g, "(seasons)")
  .replace(/\(s\) =>/g, "(s) =>")
  .replace(/timeZone = "Europe\/Bratislava"/, 'timeZone = "Europe/Bratislava"');

const { currentSeasons, rangesOverlap } = await import(
  `data:text/javascript,${encodeURIComponent(
    source + "\nexport { currentSeasons, rangesOverlap };"
  )}`
);

const season = (name, startDate, endDate) => ({
  id: name,
  season: name,
  startDate,
  endDate,
  weeks: [],
});

describe("currentSeasons", () => {
  // Malá Franková, 5. 11. 2026. The old filter asked whether the name
  // contained "2026/2027"; it did not, so the slope's calendar was blank.
  const malaFrankova = [
    season("sezóna 2025/2026", "2025-06-09", "2026-06-10"),
    season("sezona 2024/2025", "2025-01-10", "2025-06-13"),
  ];

  test("a season running today is shown whatever it is called", () => {
    const named = [season("zima u nas", "2026-10-01", "2027-04-30")];
    assert.deepEqual(
      currentSeasons(named, "2026-11-05").map((s) => s.season),
      ["zima u nas"]
    );
  });

  // Krajňáka's "dg 2026/2027" ran 2026-07-21 to 2027-01-21 and matched all
  // year round, including months it did not cover.
  test("a season is not shown outside the dates it covers", () => {
    const dg = [season("dg 2026/2027", "2026-07-21", "2027-01-21")];
    assert.deepEqual(currentSeasons(dg, "2026-11-05").length, 1);
    assert.deepEqual(currentSeasons(dg, "2027-03-01").length, 0);
  });

  test("the boundary days count as inside the season", () => {
    const one = [season("s", "2026-11-05", "2026-11-05")];
    // A one-day season, on its one day.
    assert.equal(currentSeasons(one, "2026-11-05").length, 1);
    // The day after it has ended there is nothing left to show.
    assert.equal(currentSeasons(one, "2026-11-06").length, 0);
  });

  test("a season that has not started yet is still offered, alone", () => {
    // Deliberate: the day before it opens, that calendar is the only one worth
    // showing. What must not happen is a finished season coming back.
    const mixed = [
      season("skoncila", "2025-06-09", "2026-06-10"),
      season("zacina zajtra", "2026-11-06", "2027-04-30"),
    ];
    assert.deepEqual(
      currentSeasons(mixed, "2026-11-05").map((s) => s.season),
      ["zacina zajtra"]
    );
  });

  test("with nothing running, the season starting soonest is shown", () => {
    const ahead = [
      ...malaFrankova,
      season("zima 2027", "2027-12-01", "2028-04-30"),
      season("sezóna 2026/2027", "2026-12-01", "2027-04-30"),
    ];
    assert.deepEqual(
      currentSeasons(ahead, "2026-11-05").map((s) => s.season),
      ["sezóna 2026/2027"]
    );
  });

  test("only finished seasons means nothing to show, not the newest one", () => {
    // Which is the honest answer for Malá Franková on that date, and why the
    // page now says so instead of rendering an empty calendar.
    assert.deepEqual(currentSeasons(malaFrankova, "2026-11-05"), []);
  });

  test("a season with no dates is ignored rather than throwing", () => {
    const broken = [{ id: "x", season: "x", weeks: [] }];
    assert.deepEqual(currentSeasons(broken, "2026-11-05"), []);
  });

  test("two seasons running at once are both returned, earliest first", () => {
    const both = [
      season("druha", "2026-11-01", "2027-01-01"),
      season("prva", "2026-10-01", "2026-12-01"),
    ];
    assert.deepEqual(
      currentSeasons(both, "2026-11-05").map((s) => s.season),
      ["prva", "druha"]
    );
  });
});

describe("rangesOverlap", () => {
  const a = { startDate: "2026-12-01", endDate: "2027-04-30" };

  test("a range sharing a single day overlaps", () => {
    assert.equal(
      rangesOverlap(a, { startDate: "2027-04-30", endDate: "2027-06-30" }),
      true
    );
    assert.equal(
      rangesOverlap(a, { startDate: "2026-10-01", endDate: "2026-12-01" }),
      true
    );
  });

  test("a range ending the day before does not overlap", () => {
    assert.equal(
      rangesOverlap(a, { startDate: "2026-10-01", endDate: "2026-11-30" }),
      false
    );
    assert.equal(
      rangesOverlap(a, { startDate: "2027-05-01", endDate: "2027-09-30" }),
      false
    );
  });

  test("a range wholly inside another overlaps, and so does the reverse", () => {
    const inner = { startDate: "2027-01-01", endDate: "2027-02-01" };
    assert.equal(rangesOverlap(a, inner), true);
    assert.equal(rangesOverlap(inner, a), true);
  });
});
