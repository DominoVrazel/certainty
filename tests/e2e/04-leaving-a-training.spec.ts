import { test, expect, type Page } from "@playwright/test";
import {
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  openAccountMenu,
  uniqueEmail,
} from "./helpers";

/**
 * The defect the whole rework exists to fix.
 *
 * Joined clubs used to live in a subcollection of the booking, so when the
 * organising club cancelled, theirs vanished with it — 101 stranded records in
 * production, under 66 deleted bookings. Participants now live inside the
 * booking document, so one club leaving is a field delete and everyone else
 * keeps their training.
 */

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

test.beforeEach(async () => {
  await clearFutureTrainings();
});

test("a club leaving does not cancel the training for the others", async ({
  browser,
}) => {
  const organiser = uniqueEmail("organiser");
  const joiner = uniqueEmail("joiner");
  await createVerifiedAccount(organiser, DEV_PASSWORD);
  await createVerifiedAccount(joiner, DEV_PASSWORD);

  const organiserCtx = await browser.newContext();
  const joinerCtx = await browser.newContext();
  const a = await organiserCtx.newPage();
  const b = await joinerCtx.newPage();

  // Leaving asks for confirmation, and booking alerts afterwards. A one-shot
  // handler gets consumed by whichever fires first, and an unhandled confirm is
  // auto-dismissed — which reads as "the club declined to leave".
  a.on("dialog", (d) => d.accept());
  b.on("dialog", (d) => d.accept());

  try {
    // The organising club books a slot.
    await signIn(a, organiser);
    await a.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await a.locator('input[type="number"]').first().fill("4");
    await a
      .getByRole("button", { name: /^(REZERVOVAŤ|Rezervovať|Potvrdiť)$/ })
      .last()
      .click();
    await expect(a.getByText(/VOĽNÝCH:/).first()).toBeVisible({
      timeout: 20_000,
    });

    // A second club joins it.
    await signIn(b, joiner);
    const joinButton = b.getByRole("button", { name: "PRIDAŤ SA NA TRÉNING" });
    await expect(joinButton.first()).toBeVisible({ timeout: 20_000 });
    await joinButton.first().click();
    await b.locator('input[type="number"]').first().fill("6");
    await b
      .locator(".RegButton")
      .last()
      .click();

    // 50 capacity − 4 − 6 = 40 free, which is both clubs counted.
    await expect(b.getByText(/VOĽNÝCH:\s*40\s*\/\s*50/).first()).toBeVisible({
      timeout: 20_000,
    });

    // The organising club leaves.
    await a.reload();
    await expect(a.getByText(/VOĽNÝCH:/).first()).toBeVisible({
      timeout: 20_000,
    });
    await a.locator(".handler-delete").first().click();

    // The training survives, now holding only the club that joined.
    await b.reload();
    await expect(b.getByText(/VOĽNÝCH:\s*44\s*\/\s*50/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      b.getByRole("button", { name: "PRIDAŤ SA NA TRÉNING" })
    ).toHaveCount(0);

    // Clean up: the remaining club removes itself, which deletes the training.
    await b.locator(".handler-delete").first().click();
    await expect(b.getByRole("button", { name: "REZERVOVAŤ" }).first())
      .toBeVisible({ timeout: 20_000 });
  } finally {
    await organiserCtx.close();
    await joinerCtx.close();
  }
});
