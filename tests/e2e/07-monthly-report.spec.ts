import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, DEV_PASSWORD, openAccountMenu } from "./helpers";

/**
 * The monthly report reads the same `trainings` collection as the calendar,
 * so it covers migrated history as well as new bookings. That is why the
 * migration rewrote the old reservations into this shape instead of leaving
 * them where they were.
 */
test("the admin report counts clubs and racers for a month of history", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());

  await page.goto("/resort/Bachledka");
  await openAccountMenu(page);
  await page.getByRole("button", { name: "Prihlásiť" }).first().click();
  await page.getByPlaceholder("Váš email").first().fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Vaše heslo").first().fill(DEV_PASSWORD);
  await page
    .getByRole("button", { name: "Prihlásiť", exact: true })
    .last()
    .click();
  await expect(page.getByText(/Ahoj/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/AdminPage");
  await page.getByText(/Štatistiky strediska/i).first().click();

  await expect(page.getByRole("heading", { name: "Mesačný report" }))
    .toBeVisible({ timeout: 30_000 });

  // February 2026 is the busiest month in the migrated data.
  await page.getByLabel("Mesiac").selectOption("1");
  await page.getByLabel("Rok").selectOption("2026");

  const summary = page.getByTestId("report-summary");
  await expect(summary).toBeVisible({ timeout: 30_000 });

  // Changing the month re-queries, so poll rather than reading once —
  // "Tréningov: 0" is a legitimate intermediate state.
  await expect
    .poll(
      async () =>
        Number(
          (await summary.innerText()).match(/Tréningov:\s*(\d+)/)?.[1] ?? "0"
        ),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(100);

  const sessions = Number(
    (await summary.innerText()).match(/Tréningov:\s*(\d+)/)?.[1] ?? "0"
  );

  // Every training has at least one club, and clubs bring racers.
  const racers = Number(
    (await summary.innerText()).match(/Pretekárov:\s*(\d+)/)?.[1] ?? "0"
  );
  expect(racers).toBeGreaterThan(sessions);

  // The per-club breakdown is what the resort actually wants to read.
  const rows = page.locator(".report-table tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(5);

  // A month with no trainings reports nothing rather than failing.
  await page.getByLabel("Rok").selectOption("2022");
  await expect(
    page.getByText(/neprebehol žiadny tréning/)
  ).toBeVisible({ timeout: 20_000 });
});
