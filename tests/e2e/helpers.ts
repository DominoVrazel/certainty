import { expect, type Page } from "@playwright/test";

export const MAILDEV_URL = "http://localhost:1080";
export const AUTH_EMULATOR = "http://127.0.0.1:9099";
export const FIRESTORE_EMULATOR = "http://127.0.0.1:8080";
export const PROJECT_ID = "certaintyapp";

/** Password every seeded account gets locally — see scripts/seed-emulator.mjs. */
export const DEV_PASSWORD = "Heslo123";

export const ADMIN_EMAIL = "viliam.juris@bachledka.sk";

/** A fresh address per run, so repeated runs never collide on an account. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@e2e.test`;
}

/** Opens the header account menu and signs in. */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByRole("link", { name: /Bachledka/i }).first().click().catch(() => {});

  await openAccountMenu(page);
  await page.getByRole("button", { name: "Prihlásiť" }).first().click();

  await page.getByPlaceholder("Váš email").first().fill(email);
  await page.getByPlaceholder("Vaše heslo").first().fill(password);
  await page.getByRole("button", { name: "Prihlásiť", exact: true }).last().click();
}

/**
 * The account control is a Bootstrap dropdown toggle rendering only an icon,
 * so it has no accessible name to target — its id is the stable handle.
 */
export async function openAccountMenu(page: Page) {
  await page.locator("#dropdown-basic").click();
}

export async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
}

/** True once the app has stored a session for this address. */
export async function isLoggedIn(page: Page, email: string) {
  return page.evaluate(
    (e) => localStorage.getItem("userEmail") === e,
    email
  );
}

/**
 * Reads the newest message whose subject matches, straight out of the MailDev
 * web UI. MailDev 3 has no documented JSON API, and the UI is a page Playwright
 * can drive like any other — which also proves the inbox a developer actually
 * looks at really received the mail.
 */
export async function latestEmailLink(
  page: Page,
  subject: RegExp,
  linkPattern: RegExp,
  recipient: string
): Promise<string> {
  await page.goto(MAILDEV_URL);

  // Sending happens in a Cloud Function after the UI has already moved on, so
  // the message lands some time after the action that triggered it. MailDev's
  // list does not live-update reliably, so the wait has to keep reloading —
  // a plain locator timeout would sit on a stale page and never see the mail.
  const rows = page.locator("button", { hasText: subject });
  await expect
    .poll(
      async () => {
        const n = await rows.count();
        if (n === 0) await page.reload();
        return n;
      },
      {
        timeout: 45_000,
        message: `no message matching ${subject} arrived in the local inbox`,
      }
    )
    .toBeGreaterThan(0);

  // Match on the recipient, never on list position. Picking "the first row"
  // once verified somebody else's account: MailDev's ordering is not a promise,
  // and a stale message from an earlier run looks identical in the list.
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    await rows.nth(i).click();

    // The detail pane renders "Loading email…" first; reading it too early
    // would look like a message addressed to somebody else.
    await expect(page.locator("iframe").first()).toBeAttached({
      timeout: 15_000,
    });

    let to = "";
    for (let wait = 0; wait < 15; wait += 1) {
      to = await page
        .locator("main")
        .first()
        .innerText()
        .catch(() => "");
      if (to && !/Loading email/i.test(to)) break;
      await page.waitForTimeout(300);
    }
    if (!to.includes(recipient)) continue;

    const href = await page
      .locator("iframe")
      .first()
      .evaluate(
        (iframe: HTMLIFrameElement, pattern: string) => {
          const doc = iframe.contentDocument;
          if (!doc) return null;
          const re = new RegExp(pattern);
          const anchors = Array.from(doc.querySelectorAll("a"));
          const match = anchors.find((a) => re.test(a.href));
          return match ? match.href : null;
        },
        linkPattern.source
      );

    if (href) return href;
    throw new Error(
      `E-mail to ${recipient} matching ${subject} has no link matching ${linkPattern}`
    );
  }

  throw new Error(
    `No e-mail to ${recipient} matching ${subject} among ${count} message(s)`
  );
}

/** Empties the local inbox so a test only ever sees its own mail. */
export async function clearInbox(page: Page) {
  await page.goto(MAILDEV_URL);
  const deleteAll = page.getByRole("button", { name: /Delete all/i });
  if (await deleteAll.count()) {
    await deleteAll.click();
    // The UI asks for confirmation in some builds.
    const confirm = page.getByRole("button", { name: /^(Delete|Confirm|OK)$/i });
    if (await confirm.count()) await confirm.first().click();
  }
}

/** Talks to the Auth emulator's admin API — used to assert, not to act as a user. */
export async function authAccountExists(email: string): Promise<boolean> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:query`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  const body = (await res.json()) as { userInfo?: { email?: string }[] };
  return (body.userInfo ?? []).some((u) => u.email === email);
}

/**
 * Creates a throwaway, already-verified account directly in the emulators.
 *
 * Tests that change a password must not touch a shared fixture account: if such
 * a test fails before restoring it, every later sign-in fails too and the real
 * failure is buried under a cascade of unrelated ones.
 */
export async function createVerifiedAccount(email: string, password: string) {
  const signUp = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!signUp.ok) {
    throw new Error(`Could not create ${email}: ${await signUp.text()}`);
  }
  const { localId } = (await signUp.json()) as { localId: string };

  const profile = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${localId}`,
    {
      method: "PATCH",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          email: { stringValue: email },
          firstName: { stringValue: "E2E" },
          secondName: { stringValue: "Fixture" },
          sportClub: { stringValue: "E2E Fixture Club" },
          tel_number: { stringValue: "+421900000001" },
          isAdmin: { booleanValue: false },
          isVerified: { booleanValue: true },
        },
      }),
    }
  );
  if (!profile.ok) {
    throw new Error(`Could not write profile for ${email}: ${await profile.text()}`);
  }

  return localId;
}

/** Signs in through the Auth emulator REST API to verify a password works. */
export async function canSignIn(
  email: string,
  password: string
): Promise<boolean> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  return res.ok;
}

/**
 * Reads straight from the Firestore emulator as an administrator.
 *
 * The REST API enforces security rules, and the tightened rules deny anonymous
 * reads of `users` — which is the point. The emulator accepts
 * `Authorization: Bearer owner` to bypass them, so assertions can inspect data
 * the application itself is not allowed to see.
 */
const ADMIN_HEADERS = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};

export async function readUserDoc(uid: string) {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: ADMIN_HEADERS }
  );
  if (!res.ok) return null;
  return (await res.json()) as { fields?: Record<string, any> };
}

export async function findUserByEmail(email: string) {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "users" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "email" },
              op: "EQUAL",
              value: { stringValue: email },
            },
          },
          limit: 1,
        },
      }),
    }
  );
  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error(
      `runQuery on users failed: ${JSON.stringify(body).slice(0, 200)}`
    );
  }
  const hit = (body as { document?: { name: string; fields: any } }[]).find(
    (r) => r.document
  );
  return hit?.document ?? null;
}
