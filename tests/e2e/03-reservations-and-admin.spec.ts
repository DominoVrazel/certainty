import { test, expect, type Page } from "@playwright/test";
import { ADMIN_EMAIL, DEV_PASSWORD, openAccountMenu } from "./helpers";

/**
 * Booking flows, driven through the calendar.
 *
 * The suite books into the first free slot it finds and cleans up after itself,
 * so it can run repeatedly against the same seeded emulator.
 */

const CLUB_EMAIL = ADMIN_EMAIL;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/resort/Bachledka");
  await openAccountMenu(page);
  await page.getByRole("button", { name: "Prihlásiť" }).first().click();
  await page.getByPlaceholder("Váš email").first().fill(email);
  await page.getByPlaceholder("Vaše heslo").first().fill(password);
  await page
    .getByRole("button", { name: "Prihlásiť", exact: true })
    .last()
    .click();
  // LoginModal reloads the page on success, which destroys any evaluate()
  // context mid-flight — assert on the DOM instead, which survives the reload.
  await expect(page.getByText(/Ahoj/)).toBeVisible({ timeout: 30_000 });
}

/** Books the first bookable slot and returns once the tile shows as reserved. */
async function bookFirstFreeSlot(page: Page, racers = 3) {
  const bookButton = page.getByRole("button", { name: "REZERVOVAŤ" }).first();
  await expect(bookButton).toBeVisible();
  await bookButton.click();

  const racersField = page.locator('input[type="number"]').first();
  await expect(racersField).toBeVisible();
  await racersField.fill(String(racers));

  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: /^(REZERVOVAŤ|Rezervovať|Potvrdiť)$/ })
    .last()
    .click();
}

/** Removes every reservation this suite may have left behind. */
async function deleteAllOwnReservations(page: Page) {
  for (let i = 0; i < 10; i += 1) {
    const trash = page.locator("button.handler-delete, .handler-delete").first();
    if (!(await trash.count())) return;
    page.once("dialog", (d) => d.accept());
    await trash.click();
    await page.waitForTimeout(1500);
  }
}

test.describe("reservations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, CLUB_EMAIL, DEV_PASSWORD);
  });

  test("a signed-in club can book a free slot and it appears in the calendar", async ({
    page,
  }) => {
    // Signing in reloads the page, so the calendar must finish fetching before
    // any slot is countable.
    await expect(page.getByText(/REZERVÁCIE od/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "REZERVOVAŤ" }).first()
    ).toBeVisible({ timeout: 30_000 });

    const freeBefore = await page
      .getByRole("button", { name: "REZERVOVAŤ" })
      .count();
    expect(freeBefore).toBeGreaterThan(0);

    await bookFirstFreeSlot(page, 3);

    // A booked tile shows the remaining capacity instead of a book button.
    await expect(page.getByText(/VOĽNÝCH:/).first()).toBeVisible({
      timeout: 20_000,
    });

    const freeAfter = await page
      .getByRole("button", { name: "REZERVOVAŤ" })
      .count();
    expect(freeAfter).toBeLessThan(freeBefore);

    await deleteAllOwnReservations(page);
  });

  test("the booking club can cancel its own reservation", async ({ page }) => {
    await bookFirstFreeSlot(page, 2);
    await expect(page.getByText(/VOĽNÝCH:/).first()).toBeVisible({
      timeout: 20_000,
    });

    const freeBefore = await page
      .getByRole("button", { name: "REZERVOVAŤ" })
      .count();

    await deleteAllOwnReservations(page);

    await expect
      .poll(
        () => page.getByRole("button", { name: "REZERVOVAŤ" }).count(),
        { timeout: 20_000 }
      )
      .toBeGreaterThan(freeBefore);
  });

  test("the clubs dropdown opens per cell and shows the booking club", async ({
    page,
  }) => {
    // Dropdown state lives inside the session cell now. It used to sit in a
    // page-level record, so opening one re-rendered every cell in the week.
    await bookFirstFreeSlot(page, 4);
    await expect(page.getByText(/VOĽNÝCH:/).first()).toBeVisible({
      timeout: 20_000,
    });

    const toggles = page.getByRole("button", { name: /ZOBRAZIŤ KLUBY/ });
    await expect(toggles.first()).toBeVisible();

    // Closed to begin with.
    await expect(page.getByText(/POČET JAZDCOV:/)).toHaveCount(0);

    await toggles.first().click();
    await expect(page.getByText(/POČET JAZDCOV:/).first()).toBeVisible();
    await expect(page.getByText(/KLUB:/).first()).toBeVisible();

    // Only the cell that was clicked opens.
    await expect(page.getByText(/POČET JAZDCOV:/)).toHaveCount(1);

    await toggles.first().click();
    await expect(page.getByText(/POČET JAZDCOV:/)).toHaveCount(0);

    await deleteAllOwnReservations(page);
  });

  test("remaining capacity reflects the racers entered", async ({ page }) => {
    await bookFirstFreeSlot(page, 7);

    // individualLineCapacity is 50 for this resort's courses, so 7 racers must
    // leave 43. "VOĽNÝCH:" is its own <b>, so match the element holding both.
    await expect(
      page.getByText(/VOĽNÝCH:\s*43\s*\/\s*50/).first()
    ).toBeVisible({ timeout: 20_000 });

    await deleteAllOwnReservations(page);
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, DEV_PASSWORD);
  });

  test("the admin page loads and lists clubs", async ({ page }) => {
    await page.goto("/AdminPage");

    await expect(page.getByText(/VITAJ, ADMINISTR/i)).toBeVisible({
      timeout: 30_000,
    });

    // The statistics tab lists every club — a read only an admin is allowed,
    // so an empty list here means the token never reached Firestore.
    await page.getByText(/Štatistiky strediska/i).first().click();
    await expect(page.getByText("Žiadni užívatelia")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.locator(".users-list li").first()).toBeVisible({
      timeout: 30_000,
    });

    const denied: string[] = [];
    page.on("console", (m) => {
      if (/permission|insufficient/i.test(m.text())) denied.push(m.text());
    });
    await page.waitForTimeout(2000);
    expect(denied, "admin screens hit a permission error").toEqual([]);
  });

  test("an admin can close a track and reopen it", async ({ page }) => {
    const lockButton = page.locator("button.track-toggle-button").first();
    await expect(lockButton).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await lockButton.click();

    const reason = page.locator("textarea").first();
    await expect(reason).toBeVisible({ timeout: 10_000 });
    await reason.fill("E2E údržba");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: /Zavrieť|Potvrdiť|Uložiť/i })
      .last()
      .click();

    await expect(page.getByText(/Dôvod uzávierky/i).first()).toBeVisible({
      timeout: 20_000,
    });

    // Reopen, so the next run starts from the same state.
    page.once("dialog", (d) => d.accept());
    await page.locator("button.track-toggle-button").first().click();
    await expect(page.getByText(/Dôvod uzávierky/i)).toHaveCount(0, {
      timeout: 20_000,
    });
  });
});

test.describe("authorisation boundaries", () => {
  test("a logged-out visitor cannot read the clubs list", async ({ page }) => {
    await page.goto("/resort/Bachledka");
    await page.evaluate(() => localStorage.clear());

    const result = await page.evaluate(async () => {
      const res = await fetch(
        "http://127.0.0.1:8080/v1/projects/certaintyapp/databases/(default)/documents:runQuery",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredQuery: { from: [{ collectionId: "users" }], limit: 1 },
          }),
        }
      );
      return res.status;
    });

    expect(result).toBe(403);
  });

  test("reset tokens cannot be read from the browser", async ({ page }) => {
    await page.goto("/resort/Bachledka");

    const result = await page.evaluate(async () => {
      const res = await fetch(
        "http://127.0.0.1:8080/v1/projects/certaintyapp/databases/(default)/documents:runQuery",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "user_sessions" }],
              limit: 1,
            },
          }),
        }
      );
      return res.status;
    });

    expect(result).toBe(403);
  });
});
