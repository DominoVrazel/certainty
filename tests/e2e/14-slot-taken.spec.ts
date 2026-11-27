import { test, expect, type Page } from "@playwright/test";
import {
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  openAccountMenu,
  setResortAutoConfirm,
  uniqueEmail,
} from "./helpers";

/**
 * Losing the race for a slot, and getting the calendar back afterwards.
 *
 * Two clubs going for the same block is the case the whole rework exists for,
 * and the second one is meant to be told plainly that somebody was quicker.
 * It was — and then the page it needed, to see what was still free, vanished
 * behind a spinner that never stopped.
 *
 * The spinner replaces the entire calendar, and it was switched off on the
 * success path only, so every refusal stranded the page until a reload. The
 * refusal itself worked; what followed did not.
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

test("the club that loses a slot keeps its calendar", async ({ browser }) => {
  const firstEmail = uniqueEmail("race-first");
  const secondEmail = uniqueEmail("race-second");
  await createVerifiedAccount(firstEmail, DEV_PASSWORD);
  await createVerifiedAccount(secondEmail, DEV_PASSWORD);

  const firstCtx = await browser.newContext();
  const secondCtx = await browser.newContext();
  const first = await firstCtx.newPage();
  const second = await secondCtx.newPage();

  const refusals: string[] = [];
  first.on("dialog", (d) => d.accept());
  second.on("dialog", (d) => {
    refusals.push(d.message());
    d.accept();
  });

  try {
    await signIn(first, firstEmail);
    await signIn(second, secondEmail);

    // The second club opens the booking form while the slot is still free.
    // That open form is what makes the race real: the cell behind it goes on
    // updating, but the form does not, so the refusal can only come from the
    // transaction.
    await second.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await expect(second.locator("#racers")).toBeVisible({ timeout: 20_000 });

    // Meanwhile the first club takes it.
    await first.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await first.locator("#racers").fill("3");
    await first.locator(".RegButton").last().click();
    await expect(first.getByText(/POTVRDENÉ:\s*1\s*\/\s*1/).first()).toBeVisible(
      { timeout: 20_000 }
    );

    await second.locator("#racers").fill("4");
    await second.locator(".RegButton").last().click();

    // Told, rather than left guessing.
    await expect
      .poll(() => refusals.join(" | "), { timeout: 25_000 })
      .toMatch(/medzitým zarezervoval iný klub/i);

    // And the calendar comes back. This is the part that was broken: the
    // spinner covers the whole week, so a club that lost one slot could not
    // see which others were still free without reloading.
    await expect(second.locator(".loading-animation-container")).toHaveCount(
      0,
      { timeout: 20_000 }
    );
    await expect(second.locator(".res-container").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(() => second.locator(".res-container").count(), { timeout: 20_000 })
      .toBeGreaterThan(5);

    await first.locator(".handler-delete").first().click();
  } finally {
    await firstCtx.close();
    await secondCtx.close();
  }
});
