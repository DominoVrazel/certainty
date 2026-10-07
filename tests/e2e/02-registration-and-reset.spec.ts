import { test, expect } from "@playwright/test";
import {
  DEV_PASSWORD,
  authAccountExists,
  canSignIn,
  createVerifiedAccount,
  findUserByEmail,
  clearInbox,
  latestEmailLink,
  openAccountMenu,
  uniqueEmail,
} from "./helpers";

/**
 * Covers the three flows that moved behind Cloud Functions when the rules were
 * tightened. They are the ones most likely to break silently: nothing in the UI
 * says whether the token was written, only whether an e-mail eventually lands.
 */

const NEW_PASSWORD = "NoveHeslo123";

// The local inbox persists across runs, so a test could otherwise pick up a
// stale link from an earlier run whose token has already been consumed.
test.beforeEach(async ({ page }) => {
  await clearInbox(page);
});

test.describe("registration and e-mail verification", () => {
  test("a new club can register, and is verified only by clicking the link", async ({
    page,
  }) => {
    const email = uniqueEmail("klub");

    await page.goto("/resort/Bachledka");
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Registrovať" }).first().click();

    await page.getByPlaceholder("Vaše krstné meno").fill("Test");
    await page.getByPlaceholder("Vaše priezvisko").fill("Klub");
    await page.getByPlaceholder("Zadajte email").fill(email);
    await page.getByPlaceholder("napríklad: +421905010001").fill("+421900111222");
    await page.getByPlaceholder("Váš športový klub").fill("E2E Klub");
    await page.getByPlaceholder("ZSL číslo (NEPOVINNÝ ÚDAJ)").fill("123");
    await page.getByPlaceholder("napríklad: Jablko123").fill(DEV_PASSWORD);
    await page.getByPlaceholder("Potvrďte heslo").fill(DEV_PASSWORD);

    const consent = page.locator('input[type="checkbox"]').first();
    if (await consent.count()) await consent.check();

    // Registration ends by calling startEmailVerification. Navigating to the
    // inbox before that request completes aborts it, and the mail is never
    // sent — so wait for the response rather than for the mail to show up.
    const verificationSent = page.waitForResponse(
      (r) => r.url().includes("startEmailVerification"),
      { timeout: 30_000 }
    );

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Registrovať/i }).last().click();
    await verificationSent;

    // The Auth account and the profile document are both created client-side,
    // immediately after sign-up, while the user is authenticated as itself.
    await expect
      .poll(() => authAccountExists(email), { timeout: 20_000 })
      .toBe(true);

    // The profile is written straight after sign-up; poll rather than reading
    // once, or the assertion races the in-flight write (and failing fast tears
    // the browser down before it lands).
    await expect
      .poll(async () => (await findUserByEmail(email)) !== null, {
        timeout: 20_000,
      })
      .toBe(true);

    const userDoc = await findUserByEmail(email);
    expect(userDoc!.fields.isVerified.booleanValue).toBe(false);
    expect(userDoc!.fields.isAdmin.booleanValue).toBe(false);

    // The verification token is written by startEmailVerification, server-side.
    const link = await latestEmailLink(
      page,
      /Overenie emailu/i,
      /verify-user/,
      email
    );
    expect(link).toContain("localhost:5174");

    await page.goto(link);
    // The verification call is the first hit on that Cloud Function in a run,
    // and a cold function in the emulator can take a while to answer.
    await expect(page.getByText(/uspesne overeny|uz overeny/i)).toBeVisible({
      timeout: 45_000,
    });

    await expect
      .poll(
        async () => {
          const after = await findUserByEmail(email);
          return after?.fields?.isVerified?.booleanValue ?? false;
        },
        { timeout: 20_000 }
      )
      .toBe(true);
  });

  test("an unverified account cannot sign in", async ({ page }) => {
    const email = uniqueEmail("neovereny");

    await page.goto("/resort/Bachledka");
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Registrovať" }).first().click();

    await page.getByPlaceholder("Vaše krstné meno").fill("Neovereny");
    await page.getByPlaceholder("Vaše priezvisko").fill("Klub");
    await page.getByPlaceholder("Zadajte email").fill(email);
    await page.getByPlaceholder("napríklad: +421905010001").fill("+421900111333");
    await page.getByPlaceholder("Váš športový klub").fill("E2E Klub 2");
    await page.getByPlaceholder("ZSL číslo (NEPOVINNÝ ÚDAJ)").fill("456");
    await page.getByPlaceholder("napríklad: Jablko123").fill(DEV_PASSWORD);
    await page.getByPlaceholder("Potvrďte heslo").fill(DEV_PASSWORD);

    const consent = page.locator('input[type="checkbox"]').first();
    if (await consent.count()) await consent.check();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Registrovať/i }).last().click();

    await expect
      .poll(() => authAccountExists(email), { timeout: 20_000 })
      .toBe(true);
    await expect
      .poll(async () => (await findUserByEmail(email)) !== null, {
        timeout: 20_000,
      })
      .toBe(true);

    // Registration signs the browser in, so clear it before trying the UI.
    await page.goto("/resort/Bachledka");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await openAccountMenu(page);
    await page.getByRole("button", { name: "Prihlásiť" }).first().click();
    await page.getByPlaceholder("Váš email").first().fill(email);
    await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
    await page
      .getByRole("button", { name: "Prihlásiť", exact: true })
      .last()
      .click();

    await expect(page.getByText(/nie je overený/i)).toBeVisible({
      timeout: 20_000,
    });
    const stored = await page.evaluate(() => localStorage.getItem("userEmail"));
    expect(stored).toBeNull();
  });
});

test.describe("password reset", () => {
  test("a club can reset its password and sign in with the new one", async ({
    page,
  }) => {
    // A throwaway account, so a failure here cannot leave a shared fixture
    // with a changed password and break every later sign-in.
    const email = uniqueEmail("reset");
    await createVerifiedAccount(email, DEV_PASSWORD);

    await page.goto("/resort/Bachledka");
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Prihlásiť" }).first().click();
    await page.getByRole("button", { name: "obnoviť heslo" }).click();

    await page.getByPlaceholder("Váš email").last().fill(email);
    await page.getByRole("button", { name: "Odoslať" }).click();

    await expect(page.getByText(/bol odoslaný/i)).toBeVisible({
      timeout: 20_000,
    });

    const link = await latestEmailLink(
      page,
      /Obnovenie hesla/i,
      /reset-password/,
      email
    );
    expect(link).toContain("localhost:5174");

    await page.goto(link);
    await page.getByPlaceholder("napríklad: Jablko123").fill(NEW_PASSWORD);
    await page.getByPlaceholder("Potvrďte heslo").fill(NEW_PASSWORD);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Obnoviť" }).click();

    await expect
      .poll(() => canSignIn(email, NEW_PASSWORD), { timeout: 20_000 })
      .toBe(true);
    expect(await canSignIn(email, DEV_PASSWORD)).toBe(false);
  });

  test("asking to reset an unknown address reveals nothing and sends nothing", async ({
    page,
  }) => {
    const unknown = uniqueEmail("neznamy");

    await page.goto("/resort/Bachledka");
    await openAccountMenu(page);
    await page.getByRole("button", { name: "Prihlásiť" }).first().click();
    await page.getByRole("button", { name: "obnoviť heslo" }).click();

    await page.getByPlaceholder("Váš email").last().fill(unknown);
    await page.getByRole("button", { name: "Odoslať" }).click();

    // Same confirmation as for a real address — that is the point.
    await expect(page.getByText(/bol odoslaný/i)).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("http://localhost:1080");
    const addressed = page.locator("button", { hasText: unknown });
    await expect(addressed).toHaveCount(0);
  });
});
