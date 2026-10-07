import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  openAccountMenu,
  uniqueEmail,
} from "./helpers";

test.beforeEach(async () => {
  await clearFutureTrainings();
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

test("an admin moves a booking and every club on it comes along", async ({
  browser,
}) => {
  const club = uniqueEmail("moved");
  await createVerifiedAccount(club, DEV_PASSWORD);

  const clubCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const c = await clubCtx.newPage();
  const a = await adminCtx.newPage();
  c.on("dialog", (d) => d.accept());
  a.on("dialog", (d) => d.accept());

  try {
    // A club books a slot with a distinctive racer count.
    await signIn(c, club);
    await c.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await c.locator("#racers").fill("9");
    await c.locator(".RegButton").last().click();
    await expect(c.getByText(/VOĽNÝCH:\s*41\s*\/\s*50/).first()).toBeVisible({
      timeout: 20_000,
    });

    // The admin moves it to a different track.
    await signIn(a, ADMIN_EMAIL);
    await expect(a.getByText(/VOĽNÝCH:\s*41\s*\/\s*50/).first()).toBeVisible({
      timeout: 20_000,
    });
    await a.getByRole("button", { name: /PRESUNÚŤ/ }).first().click();

    await expect(a.locator("#move-track")).toBeVisible({ timeout: 10_000 });
    await a.locator("#move-track").selectOption("2");
    await a.locator(".reservation-modal .RegButton").click();

    // Still exactly one booking, still the same club and racers — moving used
    // to mean delete and rebook, which lost everyone who had joined.
    await expect(a.getByText(/VOĽNÝCH:\s*41\s*\/\s*50/).first()).toBeVisible({
      timeout: 20_000,
    });
    expect(await a.getByText(/VOĽNÝCH:/).count()).toBe(1);

    // The club sees it at the new slot too.
    await c.reload();
    await expect(c.getByText(/VOĽNÝCH:\s*41\s*\/\s*50/).first()).toBeVisible({
      timeout: 20_000,
    });

    await a.locator(".handler-delete").first().click();
  } finally {
    await clubCtx.close();
    await adminCtx.close();
  }
});
