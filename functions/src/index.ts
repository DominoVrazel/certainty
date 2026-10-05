import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { createTransport } from "nodemailer";
import express from "express";
import { defineSecret, defineString } from "firebase-functions/params";
import { render } from "@react-email/components";
import UserEmailRES from "./emails/UserEmailRES";
import AdminEmailRES from "./emails/AdminEmailRES";
import UserEmailRESAccepted from "./emails/UserEmailRESAccepted";
import UserEmailRESDeleted from "./emails/UserEmailRESDeleted";
import UserEmailForgottenPass from "./emails/UserEmailForgottenPass";
import EmailAddedToTraining from "./emails/EmailAddedToTraining";
import { ResetPasswordController } from "./controllers/reset-password.controller";
import { getAuth } from "firebase-admin/auth";
import admin from "firebase-admin";
import UserEmailVerify from "./emails/UserEmailVerify";

// Create an Express app
const emailApp = express();
const resetPasswordApp = express();

// Create a rate limiter that allows 1 request per 15 minutes
// const rateLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15-minute window
//   max: 1, // Maximum 1 request per 15-minute window per IP
//   message: 'Too many requests. Please try again later.',
//   headers: true,
//   handler: (request, response, options) => {
//     console.error('Rate limit exceeded:', request.ip);
//     response.status(429).json({ error: 'Too many requests. Please try again later.' });
//   },
// });

// Apply the rate limiter middleware to the Express app
// app.use(rateLimiter);

const gmailUser = defineSecret("GMAIL_USER");
const gmailToken = defineSecret("GMAIL_TOKEN");

/**
 * The options object passed to onRequest is evaluated at deploy time, before
 * Params resolve — calling appDomain.value() there warned and risked baking in
 * an empty origin. `cors` is typed as plain strings and cannot take a Param, so
 * read the value straight from the environment, which the CLI has already
 * loaded from .env (or .env.local under the emulator).
 */
const corsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.APP_DOMAIN,
].filter((origin): origin is string => Boolean(origin));

const reservationBaseUrl = defineString("RESERVATIONS_BASE_URL");
const resetPassBaseUrl = defineString("RESET_PASS_BASE_URL");
const verifyUserBaseUrl = defineString("VERIFY_USER_BASE_URL");

// Set by the Functions emulator, never in deployed functions.
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

/**
 * Locally the database is seeded from production, so it holds real addresses.
 * Sending through the real Gmail account would mail actual people every time a
 * test reservation is made — so in the emulator we deliver to a local SMTP
 * inbox instead. The send path is otherwise identical: same nodemailer call,
 * same rendered HTML, same recipients, just a different SMTP host.
 */
const buildTransport = () => {
  if (isEmulator) {
    return createTransport({
      host: process.env.LOCAL_SMTP_HOST ?? "127.0.0.1",
      port: Number(process.env.LOCAL_SMTP_PORT ?? 1026),
      secure: false,
      ignoreTLS: true,
    });
  }

  return createTransport({
    service: "Gmail",
    auth: {
      user: gmailUser.value(),
      pass: gmailToken.value(),
    },
  });
};

// Reading the secret locally is pointless and fails if .secret.local is absent.
const senderAddress = () =>
  isEmulator ? "rezervacia@local.test" : gmailUser.value();

interface EmailData {
  reservationId: string;

  emailData: {
    recipient: string;
    subject: string;
    userFirstName: string;
    userSecondName: string;
    userTelNumber: string;
    userEmail: string;
    course: string;
    courseName: string;
    date: string;
    startTime: string;
    endTime: string;
    lineNumber: number;
    emailIdentifier: string;
    promoCodesString: string;
    discipline: string;
    category: string;
    uuid: string;
  };
}

// interface EmailUserResData {
//   type: EmailType.EmailUserRes,
//   reservationUrl: string;
// }

// interface EmailAdminRes {
//   type: EmailType.EmailAdminRes,
//   baseUrl: string;
// }

// type EmnailData2 = EmailUserResData | EmailAdminRes;

enum EmailType {
  EmailUserRes = "USER_SUCCESS_RES",
  EmailAdminRes = "ADMIN_SUCCESS_RES",
  EmailUserResAccepted = "USER_ACCEPTED_RES",
  EmailUserResDeleted = "USER_DELETE_RES",
  EmailForgottenPassword = "USER_FORGOTTEN_PASSWORD",
  EmailVerifyUser = "USER_VERIFY_EMAIL",
  EmailAddedToTraining = "USER_ADDED_TO_TRAINING",
}

// const data: EmnailData2 = {};

// if (data.type === EmailType.EmailUserRes) {
//   data.reservationUrl
// }

// if (data.type === EmailType.EmailAdminRes) {
//   data.
// }

// tagged unions

const firebaseAdminApp = admin.initializeApp();
const adminAuth = getAuth();
const db = admin.firestore(firebaseAdminApp);
const resetPasswordController = new ResetPasswordController(
  firebaseAdminApp,
  adminAuth,
  db
);

resetPasswordApp.post("*", (req, res) => {
  return resetPasswordController.resetPassword(req, res);
});

/** Delivers one message through whichever transport this environment uses. */
async function deliver(to: string, subject: string, html: string) {
  await buildTransport().sendMail({
    from: senderAddress(),
    to,
    subject,
    html,
  });
}

/**
 * Picks and renders the template for an email. Extracted so the account
 * verification and password reset endpoints below can reuse it instead of
 * duplicating the template selection.
 */
async function renderEmailHtml(data: EmailData): Promise<string> {
  const reservationUrl = `${reservationBaseUrl.value()}/${data.reservationId}`;
  let html = "";

  if (data.emailData.emailIdentifier === EmailType.EmailVerifyUser) {
    const verifyLink = `${verifyUserBaseUrl.value()}?uuid=${
      data.emailData.uuid
    }`;
    html = await render(UserEmailVerify({ ...data.emailData, verifyLink }));
  }
  if (data.emailData.emailIdentifier === EmailType.EmailUserRes) {
    html = await render(
      UserEmailRES({ ...data.emailData, baseUrl: reservationUrl })
    );
  }
  if (data.emailData.emailIdentifier === EmailType.EmailAdminRes) {
    html = await render(
      AdminEmailRES({ ...data.emailData, baseUrl: reservationUrl })
    );
  }
  if (data.emailData.emailIdentifier === EmailType.EmailUserResAccepted) {
    html = await render(UserEmailRESAccepted({ ...data.emailData }));
  }
  if (data.emailData.emailIdentifier === EmailType.EmailUserResDeleted) {
    html = await render(UserEmailRESDeleted({ ...data.emailData }));
  }
  if (data.emailData.emailIdentifier === EmailType.EmailAddedToTraining) {
    html = await render(EmailAddedToTraining({ ...data.emailData }));
  }
  if (data.emailData.emailIdentifier === EmailType.EmailForgottenPassword) {
    const resetLink = `${resetPassBaseUrl.value()}?uuid=${
      data.emailData.uuid
    }`;
    html = await render(
      UserEmailForgottenPass({ ...data.emailData, resetLink })
    );
  }

  return html;
}

// The POST endpoint that handles email sending
emailApp.post("*", async (request, response) => {
  try {
    // Create a Nodemailer transporter using SMTP
    const transporter = buildTransport();

    response.set("Access-Control-Allow-Origin", "*");
    if (request.method === "OPTIONS") {
      response.set("Access-Control-Allow-Methods", "GET");
      response.set("Access-Control-Allow-Headers", "Content-Type");
      response.set("Access-Control-Max-Age", "3600");
      response.status(204).send("");
      return;
    }

    const data = request.body.data as EmailData;

    const reservationUrl = `${reservationBaseUrl.value()}/${
      data.reservationId
    }`;

    let html = "";
    if (data.emailData.emailIdentifier === EmailType.EmailVerifyUser) {
      const verifyLink = `${verifyUserBaseUrl.value()}?uuid=${
        data.emailData.uuid
      }`;
      html = await render(UserEmailVerify({ ...data.emailData, verifyLink }));
    }

    if (data.emailData.emailIdentifier === EmailType.EmailUserRes) {
      html = await render(
        UserEmailRES({ ...data.emailData, baseUrl: reservationUrl })
      );
    }
    if (data.emailData.emailIdentifier === EmailType.EmailAdminRes) {
      html = await render(
        AdminEmailRES({ ...data.emailData, baseUrl: reservationUrl })
      );
    }
    if (data.emailData.emailIdentifier === EmailType.EmailUserResAccepted) {
      html = await render(UserEmailRESAccepted({ ...data.emailData }));
    }
    if (data.emailData.emailIdentifier === EmailType.EmailUserResDeleted) {
      html = await render(UserEmailRESDeleted({ ...data.emailData }));
    }
    if (data.emailData.emailIdentifier === EmailType.EmailAddedToTraining) {
      html = await render(EmailAddedToTraining({ ...data.emailData }));
    }
    if (data.emailData.emailIdentifier === EmailType.EmailForgottenPassword) {
      const resetLink = `${resetPassBaseUrl.value()}?uuid=${
        data.emailData.uuid
      }`;
      html = await render(
        UserEmailForgottenPass({ ...data.emailData, resetLink: resetLink })
      );
    }

    return transporter
      .sendMail({
        from: senderAddress(),
        to: data.emailData.recipient,
        subject: data.emailData.subject,
        html: html,
      })
      .then(() => {
        response.status(200).json({ result: "Email sent successfully" });
      })
      .catch((error) => {
        response.status(500).json({
          error: `Error sending email: ${error}`,
        });
      });
  } catch (error) {
    response.status(500).json({ error: `Error sending email: ${error}` });
  }
});

// Export the Express app with rate limiter applied and CORS enabled
export const sendEmail = onRequest(
  {
    secrets: [gmailUser, gmailToken],

    cors: corsOrigins,
  },
  emailApp
);

export const resetPassword = onRequest(
  {
    secrets: [gmailUser, gmailToken],
    cors: corsOrigins,
  },
  resetPasswordApp
);

/**
 * Account verification and password-reset tokens used to be created and
 * consumed by the browser, which meant `user_sessions` and
 * `verify_user_sessions` had to be world-readable — and anyone who read them
 * could take over any account. These endpoints move both halves behind the
 * Admin SDK so the rules can deny clients all access to those collections.
 */
const startEmailVerificationApp = express();
const startPasswordResetApp = express();
const verifyUserAccountApp = express();

for (const app of [
  startEmailVerificationApp,
  startPasswordResetApp,
  verifyUserAccountApp,
]) {
  app.use((_req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });
}

/** Starts e-mail verification for a freshly registered club. */
startEmailVerificationApp.post("*", async (req, res) => {
  const { email, userFirstName } = (req.body?.data ?? {}) as {
    email?: string;
    userFirstName?: string;
  };
  if (!email) {
    return res.status(400).send({ data: { ok: false } });
  }

  const uuid = randomUUID();
  await db.collection("verify_user_sessions").add({ uuid, email });

  const html = await renderEmailHtml({
    reservationId: "",
    emailData: {
      recipient: email,
      subject: "Overenie emailu",
      userFirstName: userFirstName ?? "",
      emailIdentifier: EmailType.EmailVerifyUser,
      uuid,
    },
  } as EmailData);

  await deliver(email, "Overenie emailu", html);
  return res.status(200).send({ data: { ok: true } });
});

/**
 * Starts a password reset. Always reports success: telling the caller whether
 * an address is registered is exactly the account enumeration the old
 * client-side `checkIfEmailExists` allowed.
 */
startPasswordResetApp.post("*", async (req, res) => {
  const { email } = (req.body?.data ?? {}) as { email?: string };
  if (!email) {
    return res.status(400).send({ data: { ok: false } });
  }

  try {
    await adminAuth.getUserByEmail(email);
  } catch {
    return res.status(200).send({ data: { ok: true } });
  }

  const uuid = randomUUID();
  await db.collection("user_sessions").add({ uuid, email });

  const html = await renderEmailHtml({
    reservationId: "",
    emailData: {
      recipient: email,
      subject: "Obnovenie hesla",
      emailIdentifier: EmailType.EmailForgottenPassword,
      uuid,
    },
  } as EmailData);

  await deliver(email, "Obnovenie hesla", html);
  return res.status(200).send({ data: { ok: true } });
});

/** Consumes a verification token and marks the account verified. */
verifyUserAccountApp.post("*", async (req, res) => {
  const { uuid } = (req.body?.data ?? {}) as { uuid?: string };
  if (!uuid) {
    return res.status(400).send({ data: { status: "INVALID" } });
  }

  const sessions = await db
    .collection("verify_user_sessions")
    .where("uuid", "==", uuid)
    .limit(1)
    .get();

  if (sessions.empty) {
    return res.status(200).send({ data: { status: "NOT_FOUND" } });
  }

  const { email } = sessions.docs[0].data() as { email: string };
  const users = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (users.empty) {
    return res.status(200).send({ data: { status: "NOT_FOUND" } });
  }

  const userDoc = users.docs[0];
  if (userDoc.data().isVerified === true) {
    return res.status(200).send({ data: { status: "ALREADY_VERIFIED" } });
  }

  await userDoc.ref.update({ isVerified: true });
  await sessions.docs[0].ref.delete();

  return res.status(200).send({ data: { status: "VERIFIED" } });
});

export const startEmailVerification = onRequest(
  { secrets: [gmailUser, gmailToken], cors: corsOrigins },
  startEmailVerificationApp
);

export const startPasswordReset = onRequest(
  { secrets: [gmailUser, gmailToken], cors: corsOrigins },
  startPasswordResetApp
);

export const verifyUserAccount = onRequest(
  { cors: corsOrigins },
  verifyUserAccountApp
);
