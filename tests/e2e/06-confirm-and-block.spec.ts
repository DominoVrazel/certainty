import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  openAccountMenu,
  setResortAutoConfirm,
  uniqueEmail,
} from "./helpers";

test.beforeEach(async () => {
  await clearFutureTrainings();
});

// Self-confirmation is what a resort gets when it turns automatic confirmation
// off, and the default is on. Restored even when a test fails, because the
// whole suite shares one emulator and the setting would otherwise leak into
// another file.
test.afterEach(async () => {
  await setResortAutoConfirm("Bachledka", true);
});

async function signIn(page: any, email: string) {
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

test("a club confirms its own attendance, without the resort doing it", async ({
  page,
}) => {
  const email = uniqueEmail("confirm");
  await createVerifiedAccount(email, DEV_PASSWORD);
  await setResortAutoConfirm("Bachledka", false);
  page.on("dialog", (d) => d.accept());

  await signIn(page, email);

  await page.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
  await page.locator("#racers").fill("3");
  await page.locator(".RegButton").last().click();

  await expect(page.getByText(/POTVRDENÉ:\s*0\s*\/\s*1/).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: /POTVRDIŤ ÚČASŤ/ }).first().click();

  await expect(page.getByText(/POTVRDENÉ:\s*1\s*\/\s*1/).first()).toBeVisible({
    timeout: 20_000,
  });
  // Once every club has confirmed, the booking itself counts as confirmed.
  await expect(
    page.getByRole("button", { name: /POTVRDIŤ ÚČASŤ/ })
  ).toHaveCount(0);

  await page.locator(".handler-delete").first().click();
});

test("an admin can close a single time block instead of the whole track", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, ADMIN_EMAIL);

  await expect(
    page.getByRole("button", { name: "REZERVOVAŤ" }).first()
  ).toBeVisible({ timeout: 30_000 });
  const blocksBefore = await page
    .getByRole("button", { name: "REZERVOVAŤ" })
    .count();
  expect(blocksBefore).toBeGreaterThan(2);

  // Skip today's tracks: today is never bookable, so closing a block there
  // would not change the count this test measures.
  const tracksPerDay = 2;
  await page.locator("button.track-toggle-button").nth(tracksPerDay).click();

  // Pick one block rather than the whole day.
  const scope = page.locator("#scope");
  await expect(scope).toBeVisible({ timeout: 10_000 });
  const firstBlock = await scope.locator("option").nth(1).getAttribute("value");
  await scope.selectOption(firstBlock!);
  await page.locator("textarea").first().fill("Blok je uzavretý na úpravu");
  await page.getByRole("button", { name: "Potvrdiť" }).click();

  await expect(
    page.getByText(/Blok je uzavretý na úpravu/).first()
  ).toBeVisible({ timeout: 20_000 });

  // The rest of the track stays bookable — the old model could only close
  // the whole day.
  const blocksAfter = await page
    .getByRole("button", { name: "REZERVOVAŤ" })
    .count();
  expect(blocksAfter).toBe(blocksBefore - 1);

  // Reopen through the block's own control: the track header's lock only
  // knows about whole-day closures.
  await page.locator(".closed-reason button.track-toggle-button").first().click();
  await expect(page.getByText(/Blok je uzavretý na úpravu/)).toHaveCount(0, {
    timeout: 20_000,
  });
});
