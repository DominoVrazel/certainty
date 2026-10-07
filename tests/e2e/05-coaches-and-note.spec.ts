import { test, expect } from "@playwright/test";
import {
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  openAccountMenu,
  uniqueEmail,
} from "./helpers";

/**
 * Coach counts, editing a booking, and the shared note.
 *
 * The note is where coaches agree who sets the course and who brings what, so
 * every club on the training may write it — not just the one that booked.
 */

test.beforeEach(async () => {
  await clearFutureTrainings();
});

test("a club books with coaches, then edits its numbers and the note", async ({
  page,
}) => {
  const email = uniqueEmail("coach");
  await createVerifiedAccount(email, DEV_PASSWORD);

  page.on("dialog", (d) => d.accept());

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

  // Book with 5 racers and 2 coaches.
  await page.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
  await page.locator("#racers").fill("5");
  await page.locator("#coaches").fill("2");
  await page.locator(".RegButton").last().click();

  await expect(page.getByText(/VOĽNÝCH:\s*45\s*\/\s*50/).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/TRÉNERI:\s*2/).first()).toBeVisible();

  // Edit: more racers, more coaches, and a note.
  await page.locator(".handler-edit").first().click();
  await page.locator('input[name="ownRacers"]').fill("8");
  await page.locator('input[name="ownCoaches"]').fill("3");
  await page
    .locator('textarea[name="note"]')
    .fill("Trat stavia Jano, Peter prinesie brany");
  await page.getByRole("button", { name: "Uložiť" }).click();

  // Capacity is derived, so it follows the edit without a stored counter.
  await expect(page.getByText(/VOĽNÝCH:\s*42\s*\/\s*50/).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/TRÉNERI:\s*3/).first()).toBeVisible();
  await expect(
    page.getByText(/Trat stavia Jano, Peter prinesie brany/).first()
  ).toBeVisible();

  // The per-club breakdown carries coaches too.
  await page.getByRole("button", { name: /ZOBRAZIŤ KLUBY/ }).first().click();
  await expect(page.getByText(/TRÉNEROV:\s*3/).first()).toBeVisible();

  await page.locator(".handler-delete").first().click();
  await expect(
    page.getByRole("button", { name: "REZERVOVAŤ" }).first()
  ).toBeVisible({ timeout: 20_000 });
});
