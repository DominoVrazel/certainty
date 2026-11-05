import { test, expect } from "@playwright/test";

/**
 * Which slope shows a calendar, and what a slope without one says.
 *
 * The page used to pick seasons by matching the season's *name* against a
 * string built from today's date. On the seeded production data that means
 * Malá Franková rendered nothing at all — no calendar and no explanation,
 * indistinguishable from a broken page — while Krajňáka worked purely because
 * somebody had typed "2026/2027" into its season name.
 */


/**
 * Picks a slope by part of its name.
 *
 * `selectOption({ label })` takes an exact string only, and these names are
 * long and carry a typo in the data ("Tréningové cetrum"), so matching on a
 * fragment keeps the test from depending on either.
 */
async function selectSlope(page: any, fragment: string) {
  const picker = page.locator("select.custom-dropdown");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  const value = await picker
    .locator("option", { hasText: fragment })
    .first()
    .getAttribute("value");
  if (!value) throw new Error(`no slope matching "${fragment}" in the dropdown`);
  await picker.selectOption(value);
  return picker;
}

test("a slope with a running season shows its calendar", async ({ page }) => {
  await page.goto("/resort/Bachledka");

  // Krajňáka's season covers today by its dates, so it renders.
  await selectSlope(page, "Krajňáka");
  await expect(page.locator(".res-container").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("no-season")).toHaveCount(0);
});

test("a slope whose seasons have all finished says so", async ({ page }) => {
  await page.goto("/resort/Bachledka");

  // Malá Franková's newest season ended 2026-06-10. The honest answer is that
  // there is no current calendar — not an empty page.
  await selectSlope(page, "Malá Franková");

  const message = page.getByTestId("no-season");
  await expect(message).toBeVisible({ timeout: 30_000 });
  await expect(message).toContainText(/nie je vytvorený/i);
  await expect(page.locator(".res-container")).toHaveCount(0);
});
