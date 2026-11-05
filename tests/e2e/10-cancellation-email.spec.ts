import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  emptyInbox,
  inboxMessages,
  openAccountMenu,
  subjectsFor,
  uniqueEmail,
} from "./helpers";

/**
 * Who hears about a cancellation.
 *
 * The recipient used to come from localStorage, which is whoever is clicking —
 * and only an admin can cancel somebody else's booking, so the admin told
 * themselves and the club that lost the training heard nothing. Nothing in the
 * UI shows this; the only way to catch it is to read the inbox.
 */

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

test("an admin cancelling a booking tells the club, not themselves", async ({
  browser,
}) => {
  const clubEmail = uniqueEmail("zrusenie-klub");
  await createVerifiedAccount(clubEmail, DEV_PASSWORD);

  const clubCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const club = await clubCtx.newPage();
  const admin = await adminCtx.newPage();
  club.on("dialog", (d) => d.accept());
  admin.on("dialog", (d) => d.accept());

  try {
    await signIn(club, clubEmail);
    await club.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
    await club.locator("#racers").fill("4");
    await club.locator(".RegButton").last().click();
    await expect(club.locator(".res-container.potvrdená").first()).toBeVisible({
      timeout: 20_000,
    });

    // After the booking, so the booking's own mails cannot be mistaken for the
    // cancellation.
    await emptyInbox();

    await signIn(admin, ADMIN_EMAIL);
    await expect(admin.locator(".handler-delete").first()).toBeVisible({
      timeout: 30_000,
    });
    await admin.locator(".handler-delete").first().click();

    // Gone for the club too — this is a cancellation, not the admin leaving.
    await expect(club.locator(".res-container.potvrdená")).toHaveCount(0, {
      timeout: 20_000,
    });

    const cancellation = /Zrušený tréning/;

    await expect
      .poll(() => subjectsFor(clubEmail), {
        timeout: 45_000,
        message: "the club was never told its training was cancelled",
      })
      .toEqual(expect.arrayContaining([expect.stringMatching(cancellation)]));

    // The admin did the cancelling; mail about it addressed to the admin is
    // the defect, not a nice-to-have.
    const adminSubjects = await subjectsFor(ADMIN_EMAIL);
    expect(adminSubjects.filter((s) => cancellation.test(s))).toEqual([]);

    // And it has to say which training. The old wording named none of them, so
    // a club with several bookings could not tell which one it had lost. The
    // subject is built in the page and the body in the template, from separate
    // data — if the template stops being given the slot, the body loses it
    // while the subject still looks right.
    const sent = (await inboxMessages()).find(
      (m) =>
        cancellation.test(m.subject ?? "") &&
        (m.to ?? []).some((t) => t.address === clubEmail)
    );
    const slot = (sent?.subject ?? "").replace(/^Zrušený tréning\s*/, "");
    const [date, startTime] = slot.split(" ");
    const body = (sent?.html ?? sent?.text ?? "").replace(/<[^>]+>/g, " ");

    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).toContain(date);
    expect(body).toContain(startTime);
  } finally {
    await clubCtx.close();
    await adminCtx.close();
  }
});
