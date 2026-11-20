import { test, expect, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  DEV_PASSWORD,
  clearFutureTrainings,
  createVerifiedAccount,
  emptyInbox,
  latestEmailLink,
  openAccountMenu,
  setResortAutoConfirm,
  setTrainingLegacyId,
  uniqueEmail,
} from "./helpers";

/**
 * The link in the resort's booking mail.
 *
 * It used to claim it had confirmed the booking while writing to a collection
 * the booking no longer lives in — so it reported success having done nothing.
 * It now shows the booking, and these tests follow the link out of the real
 * message rather than constructing the URL, because the id in that mail is the
 * thing that has to match what the page looks up.
 */

/**
 * The first mail of a run has to wait for the Functions emulator's cold start,
 * which on its own outlasts the default per-test timeout. Run as part of the
 * full suite this never applies — but these tests have to pass on their own
 * too, and they did not.
 */
const COLD_START_WAIT = 120_000;
test.describe.configure({ timeout: COLD_START_WAIT + 60_000 });

const RESORT_INBOX = "skola@bachledka.sk";
const MAIL_SUBJECT = /Nová rezervácia tréningu/;
const RESERVATION_LINK = /\/reservations\//;

test.beforeEach(async () => {
  await clearFutureTrainings();
  await setResortAutoConfirm("Bachledka", true);
  await emptyInbox();
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

/** Books a slot as a fresh club and returns the link the resort was mailed. */
async function bookAndReadResortLink(page: Page): Promise<string> {
  const email = uniqueEmail("detail");
  await createVerifiedAccount(email, DEV_PASSWORD);
  page.on("dialog", (d) => d.accept());

  await signIn(page, email);
  await page.getByRole("button", { name: "REZERVOVAŤ" }).first().click();
  await page.locator("#racers").fill("4");
  await page.locator(".RegButton").last().click();
  await expect(page.getByText(/POTVRDENÉ:\s*1\s*\/\s*1/).first()).toBeVisible({
    timeout: 20_000,
  });

  return latestEmailLink(
    page,
    MAIL_SUBJECT,
    RESERVATION_LINK,
    RESORT_INBOX,
    COLD_START_WAIT
  );
}

test("the resort's mail links to the booking, and an admin sees its detail", async ({
  browser,
}) => {
  const clubCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const club = await clubCtx.newPage();
  const admin = await adminCtx.newPage();

  try {
    const link = await bookAndReadResortLink(club);

    admin.on("dialog", (d) => d.accept());
    await signIn(admin, ADMIN_EMAIL);
    await admin.goto(link);

    const detail = admin.getByTestId("reservation-detail");
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await expect(detail.getByText("Detail rezervácie")).toBeVisible();

    // The booking it actually opened: the counts come from this training.
    await expect(detail.getByText(/Závodníci:\s*4/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(admin.getByTestId("reservation-status")).toContainText(
      "potvrdená"
    );
    await expect(
      admin.getByTestId("reservation-participants").locator("li")
    ).toHaveCount(1);

    // Showing, not acting. The page that used to be here confirmed on load.
    await expect(
      admin.getByRole("button", { name: /POTVRD/i })
    ).toHaveCount(0);
  } finally {
    await clubCtx.close();
    await adminCtx.close();
  }
});

test("a club following the same link is told it is for administrators", async ({
  browser,
}) => {
  const clubCtx = await browser.newContext();
  const club = await clubCtx.newPage();

  try {
    const link = await bookAndReadResortLink(club);
    await club.goto(link);

    await expect(
      club.getByText(/môže zobraziť iba administrátor/i)
    ).toBeVisible({ timeout: 20_000 });
    // And the personal data on the booking is not fetched at all.
    await expect(club.getByTestId("reservation-participants")).toHaveCount(0);
  } finally {
    await clubCtx.close();
  }
});

test("a link sent before the migration still finds the training", async ({
  browser,
}) => {
  const clubCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const club = await clubCtx.newPage();
  const admin = await adminCtx.newPage();

  try {
    const link = await bookAndReadResortLink(club);
    const trainingId = decodeURIComponent(
      link.split("/reservations/")[1] ?? ""
    );
    expect(trainingId).not.toBe("");

    // Pretend this booking came through the migration: give it the id its
    // old `reservations` document had, which is what old mails link to.
    const legacyId = `legacy-${Date.now()}`;
    await setTrainingLegacyId(trainingId, legacyId);

    admin.on("dialog", (d) => d.accept());
    await signIn(admin, ADMIN_EMAIL);
    await admin.goto(`/reservations/${legacyId}`);

    await expect(
      admin.getByTestId("reservation-detail").getByText("Detail rezervácie")
    ).toBeVisible({ timeout: 20_000 });
    await expect(admin.getByTestId("reservation-participants").locator("li")).toHaveCount(
      1
    );
  } finally {
    await clubCtx.close();
    await adminCtx.close();
  }
});

test("a link to a booking that is gone says so instead of pretending", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/reservations/nic-takeho-neexistuje");

  await expect(page.getByTestId("reservation-missing")).toBeVisible({
    timeout: 20_000,
  });
});
