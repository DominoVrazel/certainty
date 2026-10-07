import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  getResortAutoConfirm,
  openAccountMenu,
  setResortAutoConfirm,
  uniqueEmail,
} from "./helpers";

/**
 * Automatic confirmation, which the resort administrator controls and which is
 * on by default.
 *
 * The setting is read inside the booking transaction, so these tests change it
 * through the database and then book — no reload needed, which is the point:
 * a tab left open since before the change still books under the setting that
 * is actually in force.
 */

test.beforeEach(async () => {
  await clearFutureTrainings();
  await setResortAutoConfirm("Bachledka", true);
});

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

test("with automatic confirmation on, a new booking is confirmed straight away", async ({
  page,
}) => {
  const email = uniqueEmail("auto");
  await createVerifiedAccount(email, DEV_PASSWORD);
  page.on("dialog", (d) => d.accept());

  await signIn(page, email);

  await page.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
  await page.locator("#racers").fill("3");
  await page.locator(".RegButton").last().click();

  await expect(page.getByText(/POTVRDENÉ:\s*1\s*\/\s*1/).first()).toBeVisible({
    timeout: 20_000,
  });
  // Nothing left to click: that is the chore the setting removes.
  await expect(
    page.getByRole("button", { name: /POTVRDIŤ ÚČASŤ/ })
  ).toHaveCount(0);

  await page.locator(".handler-delete").first().click();
});

test("a club joining an automatic resort is confirmed too", async ({
  browser,
}) => {
  const ownerEmail = uniqueEmail("auto-owner");
  const joinerEmail = uniqueEmail("auto-joiner");
  await createVerifiedAccount(ownerEmail, DEV_PASSWORD);
  await createVerifiedAccount(joinerEmail, DEV_PASSWORD);

  const ownerCtx = await browser.newContext();
  const joinerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const joiner = await joinerCtx.newPage();
  owner.on("dialog", (d) => d.accept());
  joiner.on("dialog", (d) => d.accept());

  try {
    await signIn(owner, ownerEmail);
    await owner.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await owner.locator("#racers").fill("2");
    await owner.locator(".RegButton").last().click();
    await expect(owner.getByText(/POTVRDENÉ:\s*1\s*\/\s*1/).first()).toBeVisible(
      { timeout: 20_000 }
    );

    await signIn(joiner, joinerEmail);
    await joiner
      .getByRole("button", { name: /PRIDAŤ SA NA TRÉNING/ })
      .first()
      .click();
    await joiner.locator("#racers").fill("2");
    await joiner.locator(".RegButton").last().click();

    // Both clubs confirmed, so the training as a whole is confirmed — the
    // count and the status are derived from the same participants.
    await expect(joiner.getByText(/POTVRDENÉ:\s*2\s*\/\s*2/).first()).toBeVisible(
      { timeout: 20_000 }
    );
    await expect(
      joiner.getByRole("button", { name: /POTVRDIŤ ÚČASŤ/ })
    ).toHaveCount(0);
    await expect(joiner.locator(".res-container.potvrdená").first()).toBeVisible();
  } finally {
    await ownerCtx.close();
    await joinerCtx.close();
  }
});

test("the admin switches automatic confirmation off, and it sticks", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, ADMIN_EMAIL);

  await page.goto("/AdminPage");
  await page.getByText(/Tvorba strediska/i).first().click();

  // Several dropdowns on this screen list resorts; this is the one the
  // settings below it follow.
  const picker = page.locator("#settings-resort");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await picker.selectOption("Bachledka");

  const toggle = page.locator("#auto-confirm");
  await expect(toggle).toBeChecked({ timeout: 20_000 });
  await toggle.uncheck();

  // The checkbox flips optimistically, so wait for the stored value rather
  // than for the UI — reloading on top of the in-flight write aborts it.
  await expect
    .poll(() => getResortAutoConfirm("Bachledka"), { timeout: 20_000 })
    .toBe(false);

  // And it survives a reload, which is what proves the screen reads the
  // setting back rather than only remembering it.
  await page.reload();
  await page.getByText(/Tvorba strediska/i).first().click();
  await picker.selectOption("Bachledka");
  await expect(page.locator("#auto-confirm")).not.toBeChecked({
    timeout: 20_000,
  });

  // And a booking made now waits for the club to confirm it.
  const email = uniqueEmail("manual");
  await createVerifiedAccount(email, DEV_PASSWORD);
  const clubCtx = await page.context().browser()!.newContext();
  const club = await clubCtx.newPage();
  club.on("dialog", (d) => d.accept());
  try {
    await signIn(club, email);
    await club.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await club.locator("#racers").fill("3");
    await club.locator(".RegButton").last().click();

    await expect(club.getByText(/POTVRDENÉ:\s*0\s*\/\s*1/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      club.getByRole("button", { name: /POTVRDIŤ ÚČASŤ/ }).first()
    ).toBeVisible();
    await club.locator(".handler-delete").first().click();
  } finally {
    await clubCtx.close();
  }
});
