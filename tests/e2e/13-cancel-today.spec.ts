import { test, expect, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  openAccountMenu,
  seedFinishedTrainingToday,
  setResortAutoConfirm,
  trainingExists,
  uniqueEmail,
} from "./helpers";

/**
 * Cancelling today's training.
 *
 * The calendar refuses to book today, and the same check used to hide the
 * cancel button — so the one person who needs to call a training off on the
 * day, the resort, was locked out along with everybody else. Weather does not
 * give notice.
 *
 * These trainings are seeded already finished, because that is the awkward
 * case: "it did not happen" gets noticed in the evening, not at nine.
 */

test.beforeEach(async () => {
  await clearFutureTrainings();
  await setResortAutoConfirm("Bachledka", true);
});

async function signIn(page: Page, email: string) {
  await page.goto("/resort/Bachledka");
  await openAccountMenu(page);
  await page.getByRole("button", { name: "Prihlásiť" }).first().click();
  await page.getByPlaceholder("Váš email").first().fill(email);
  await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
  await page
    .getByRole("button", { name: "Prihlásiť", exact: true })
    .last()
    .click();
  await expect(page.getByText(/Ahoj/)).toBeVisible({ timeout: 30_000 });
}

/** The cell holding today's seeded training. */
function todaysBooking(page: Page) {
  return page.locator(".res-container").filter({ hasText: "VOĽNÝCH: 45 / 50" });
}

test("an admin cancels today's training, and it is really gone", async ({
  page,
}) => {
  const email = uniqueEmail("today-club");
  const uid = await createVerifiedAccount(email, DEV_PASSWORD);
  const seeded = await seedFinishedTrainingToday(uid, "E2E Fixture Club");

  page.on("dialog", (d) => d.accept());
  await signIn(page, ADMIN_EMAIL);

  const cell = todaysBooking(page);
  await expect(cell).toBeVisible({ timeout: 20_000 });

  // Cancelling is open; editing a training that has already run is not.
  await expect(cell.locator(".handler-delete")).toBeVisible();
  await expect(cell.locator(".handler-edit")).toHaveCount(0);

  await cell.locator(".handler-delete").click();

  // The listener repaints on its own, but the document is what settles it:
  // the old page claimed success while writing to nothing.
  await expect(cell).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => trainingExists(seeded.id), { timeout: 20_000 }).toBe(
    false
  );
});

test("the club on it cannot cancel today's training itself", async ({
  page,
}) => {
  const email = uniqueEmail("today-club");
  const uid = await createVerifiedAccount(email, DEV_PASSWORD);
  const seeded = await seedFinishedTrainingToday(uid, "E2E Fixture Club");

  page.on("dialog", (d) => d.accept());
  await signIn(page, email);

  const cell = todaysBooking(page);
  await expect(cell).toBeVisible({ timeout: 20_000 });

  // Dropping out after the fact is a no-show, which check-in records — it is
  // not the club's to erase, and it would take the training from anyone else
  // who had joined.
  await expect(cell.locator(".handler-delete")).toHaveCount(0);
  await expect(cell.locator(".handler-edit")).toHaveCount(0);

  expect(await trainingExists(seeded.id)).toBe(true);
});
