import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, DEV_PASSWORD, openAccountMenu } from "./helpers";

test.describe("public pages", () => {
  test("landing page lists the resort and loads its logo from Storage", async ({
    page,
  }) => {
    await page.goto("/");

    const logo = page.locator('img[src*="9199"]').first();
    await expect(logo).toBeVisible();

    // A broken image still renders an <img>; naturalWidth proves it decoded.
    const width = await logo.evaluate(
      (img: HTMLImageElement) => img.naturalWidth
    );
    expect(width).toBeGreaterThan(0);
  });

  test("calendar is readable while logged out", async ({ page }) => {
    await page.goto("/resort/Bachledka");

    await expect(page.getByText("TRÉNINGOVÉ ZJAZDOVKY STREDISKA")).toBeVisible();
    await expect(page.getByText(/REZERVÁCIE od/)).toBeVisible();
    await expect(page.getByRole("button", { name: "REZERVOVAŤ" }).first())
      .toBeVisible();
  });

  test("the app is talking to the emulators, not production", async ({
    page,
  }) => {
    const messages: string[] = [];
    page.on("console", (m) => messages.push(m.text()));

    await page.goto("/resort/Bachledka");
    await expect(page.getByText(/REZERVÁCIE od/)).toBeVisible();

    expect(messages.join("\n")).toContain("Firebase emulators connected");
  });

  test("no requests leak to production Firebase", async ({ page }) => {
    const production: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (
        url.includes("firestore.googleapis.com") ||
        url.includes("identitytoolkit.googleapis.com") ||
        url.includes("firebasestorage.googleapis.com")
      ) {
        production.push(url);
      }
    });

    await page.goto("/resort/Bachledka");
    await expect(page.getByText(/REZERVÁCIE od/)).toBeVisible();

    expect(production).toEqual([]);
  });
});

test.describe("authentication", () => {
  test("an admin can sign in and sees the admin link", async ({ page }) => {
    await page.goto("/resort/Bachledka");

    await openAccountMenu(page);
    await page.getByRole("button", { name: "Prihlásiť" }).first().click();

    await page.getByPlaceholder("Váš email").first().fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
    await page
      .getByRole("button", { name: "Prihlásiť", exact: true })
      .last()
      .click();

    await expect(page.getByText("Admin")).toBeVisible({ timeout: 20_000 });

    const stored = await page.evaluate(() => ({
      email: localStorage.getItem("userEmail"),
      admin: localStorage.getItem("userAdmin"),
    }));
    expect(stored.email).toBe(ADMIN_EMAIL);
    expect(stored.admin).toBe("true");
  });

  test("a wrong password is rejected", async ({ page }) => {
    await page.goto("/resort/Bachledka");

    await openAccountMenu(page);
    await page.getByRole("button", { name: "Prihlásiť" }).first().click();

    await page.getByPlaceholder("Váš email").first().fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Vaše heslo").first().fill("ZleHeslo999");
    await page
      .getByRole("button", { name: "Prihlásiť", exact: true })
      .last()
      .click();

    const stored = await page.evaluate(() =>
      localStorage.getItem("userEmail")
    );
    expect(stored).toBeNull();
  });

  test("an unknown account cannot sign in and the app does not reveal it exists", async ({
    page,
  }) => {
    // Login now authenticates before reading any profile, so a bad address and
    // a bad password are indistinguishable from the outside.
    await page.goto("/resort/Bachledka");

    await openAccountMenu(page);
    await page.getByRole("button", { name: "Prihlásiť" }).first().click();

    await page
      .getByPlaceholder("Váš email")
      .first()
      .fill("nikto@neexistuje.test");
    await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
    await page
      .getByRole("button", { name: "Prihlásiť", exact: true })
      .last()
      .click();

    const stored = await page.evaluate(() =>
      localStorage.getItem("userEmail")
    );
    expect(stored).toBeNull();
  });
});
