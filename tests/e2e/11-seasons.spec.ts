import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  deleteSeason,
  openAccountMenu,
  seasonIds,
} from "./helpers";

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

/**
 * A slope is a "zjazdovka"; the lines on it are "trate".
 *
 * The admin screens called both of them a "trať", which is why a sentence like
 * "Rezervovaná trať X v trati 2" was impossible to read. A half-done rename
 * would be worse than none, so the labels are asserted rather than eyeballed.
 */
test("the admin screens call a slope a zjazdovka", async ({ page }) => {
  page.on("dialog", (d) => d.accept());

  await page.goto("/resort/Bachledka");
  await openAccountMenu(page);
  await page.getByRole("button", { name: "Prihlásiť" }).first().click();
  await page.getByPlaceholder("Váš email").first().fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
  await page
    .getByRole("button", { name: "Prihlásiť", exact: true })
    .last()
    .click();
  await expect(page.getByText(/Ahoj/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/AdminPage");
  await page.getByText(/Tvorba strediska/i).first().click();

  await expect(
    page.getByText("Názov tréningovej zjazdovky:", { exact: false })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Kapacita zjazdovky:")).toBeVisible();

  // The season block reveals its slope picker only once a resort is chosen.
  const seasonBlock = page.locator(".add-season-form");
  await seasonBlock.locator("select").first().selectOption("Bachledka");
  await expect(
    seasonBlock.getByText("Vybrať tréningovú zjazdovku:", { exact: false })
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: "Pridať zjazdovku" })
  ).toBeVisible();

  // The per-line wording stays: these really are lines on a slope.
  await expect(page.getByText("Maximum pretekárov na jednej trati.")).toHaveCount(
    1
  );
});

/**
 * Adding a season: see what is there, and be refused when it clashes.
 *
 * Overlap is not cosmetic. The page picks what to show by date, so two seasons
 * covering the same day would both render, one under the other.
 */
test("the season form lists what exists and refuses an overlap", async ({
  page,
}) => {
  const KRAJNAKA = "Tr_ningov__centrum_O_a_V_Kraj_aka";
  const created = "e2e_nova_sezona";
  await deleteSeason("Bachledka", KRAJNAKA, created);

  page.on("dialog", (d) => d.accept());
  await page.goto("/resort/Bachledka");
  await openAccountMenu(page);
  await page.getByRole("button", { name: "Prihlásiť" }).first().click();
  await page.getByPlaceholder("Váš email").first().fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
  await page
    .getByRole("button", { name: "Prihlásiť", exact: true })
    .last()
    .click();
  await expect(page.getByText(/Ahoj/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/AdminPage");
  await page.getByText(/Tvorba strediska/i).first().click();

  const form = page.locator(".add-season-form");
  const selects = form.locator("select");
  await expect(selects.first()).toBeVisible({ timeout: 30_000 });
  await selects.first().selectOption("Bachledka");
  await expect(selects.nth(1)).toBeVisible({ timeout: 20_000 });
  await selects.nth(1).selectOption(KRAJNAKA);

  // What is already there, with the dates — which is the point: a clash should
  // be apparent before anything is typed.
  const list = page.getByTestId("existing-seasons");
  await expect(list).toContainText("dg 2026/2027", { timeout: 20_000 });
  await expect(list).toContainText("2026-07-21");
  await expect(list).toContainText("2027-01-21");

  const name = form.getByPlaceholder("Zadajte názov");
  const dates = form.locator('input[type="date"]');
  const save = form.getByRole("button", { name: /Pridať kalendár/ });

  // Overlaps dg 2026/2027, which runs to 2027-01-21.
  await name.fill("e2e nova sezona");
  await dates.nth(0).fill("2026-12-01");
  await dates.nth(1).fill("2027-02-28");
  await save.click();

  const error = page.getByTestId("season-error");
  await expect(error).toBeVisible({ timeout: 20_000 });
  await expect(error).toContainText(/Prekrýva sa/i);
  await expect(error).toContainText("dg 2026/2027");
  expect(await seasonIds("Bachledka", KRAJNAKA)).not.toContain(created);

  // The end before the start is refused on its own terms.
  await dates.nth(0).fill("2027-03-01");
  await dates.nth(1).fill("2027-02-01");
  await save.click();
  await expect(error).toContainText(/pred jej začiatkom/i, { timeout: 20_000 });
  expect(await seasonIds("Bachledka", KRAJNAKA)).not.toContain(created);

  // Clear of the existing season, so it saves and shows up in the list.
  await dates.nth(0).fill("2027-02-01");
  await dates.nth(1).fill("2027-04-30");
  await save.click();

  await expect
    .poll(() => seasonIds("Bachledka", KRAJNAKA), { timeout: 20_000 })
    .toContain(created);
  await expect(list).toContainText("e2e nova sezona");

  // And the same name is now refused as well, whatever the dates.
  await name.fill("e2e nova sezona");
  await dates.nth(0).fill("2027-06-01");
  await dates.nth(1).fill("2027-07-01");
  await save.click();
  await expect(error).toContainText(/u\u017e na tejto zjazdovke existuje/i, {
    timeout: 20_000,
  });

  await deleteSeason("Bachledka", KRAJNAKA, created);
});
