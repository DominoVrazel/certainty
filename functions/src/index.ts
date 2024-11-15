import { onRequest } from 'firebase-functions/v2/https';
import { createTransport } from 'nodemailer';
import express from 'express';
import { defineSecret, defineString } from 'firebase-functions/params';
import { render } from "@react-email/components";
import UserEmailRES from './emails/UserEmailRES';
import AdminEmailRES from './emails/AdminEmailRES';
import UserEmailRESAccepted from './emails/UserEmailRESAccepted';
import UserEmailRESDeleted from './emails/UserEmailRESDeleted';
import e from 'express';


// Create an Express app
const app = express();

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

const reservationBaseUrl = defineString("RESERVATIONS_BASE_URL");

interface EmailData {
  reservationId: string,

  emailData: {
    recipient: string;
    subject: string;
    userFirstName: string ;
    userSecondName: string;
    course: string;
    courseName: string;
    date: string;
    startTime: string;
    endTime: string;
    lineNumber: number;
    emailIdentifier: string;
    discipline: string;
    category: string;
  }
}

enum EmailType {
  EmailUserRes = 'USER_SUCCESS_RES',
  EmailAdminRes = 'ADMIN_SUCCESS_RES',
  EmailUserResAccepted = 'USER_ACCEPTED_RES',
  EmailUserResDeleted = "USER_DELETE_RES"
}

// The POST endpoint that handles email sending
app.post('*', async (request, response) => {

  // Create a Nodemailer transporter using SMTP
  const transporter = createTransport({
    service: 'Gmail',
    auth: {
      user: gmailUser.value(),
      pass: gmailToken.value()
    }
  });
  
  // Since CORS consists of two requests (a preflight OPTIONS request, and a main request that follows the OPTIONS request), 
  // to handle a preflight request, you must set the appropriate Access-Control-Allow-* headers to match the requests you want to accept. 
  // Learn more about CORS and preflight requests at: https://cloud.google.com/functions/docs/writing/write-http-functions#cors
  response.set('Access-Control-Allow-Origin', '*');
  if (request.method === 'OPTIONS') {
    response.set('Access-Control-Allow-Methods', 'GET');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Access-Control-Max-Age', '3600');
    response.status(204).send('');
    return;
  } 

  const data = request.body.data as EmailData;

  // The response from a client endpoint is always a JSON object. 
  // At a minimum it contains either `result` or `error`, along with any optional fields. 
  // If the response is not a JSON object, or does not contain data or error, 
  // the client SDK should treat the request as failed with Google error code INTERNAL (13).
  // Learn more about the response format at: https://firebase.google.com/docs/functions/callable-reference#response_body
  

  const reservationUrl = `${reservationBaseUrl.value()}/${data.reservationId}`;

  let html = '';
  if(data.emailData.emailIdentifier === EmailType.EmailUserRes) {
    html = await render(UserEmailRES({ ... data.emailData, baseUrl: reservationUrl }));
  }
  if(data.emailData.emailIdentifier === EmailType.EmailAdminRes) {
    html = await render(AdminEmailRES({ ... data.emailData, baseUrl: reservationUrl }));
  }
  if(data.emailData.emailIdentifier === EmailType.EmailUserResAccepted) {
    html = await render(UserEmailRESAccepted ({ ... data.emailData }));
  }
  if(data.emailData.emailIdentifier === EmailType.EmailUserResDeleted) {
    html = await render(UserEmailRESDeleted ({ ... data.emailData }));
  }


  return transporter.sendMail({
    from: gmailUser.value(),
    to: data.emailData.recipient,
    subject: data.emailData.subject,
    html: html,
  }).then(() => {
    response.status(200).json({ result: 'Email sent successfully' });
  }).catch(error => {
    response.status(500).json({ error: `Error sending email: ${error}` });
  });
});




// Export the Express app with rate limiter applied and CORS enabled
export const sendEmail = onRequest({
  cors: [
    'http://localhost:5002', 
    'http://127.0.0.1:5002',
    'https://www.your-allowed-domain.com',
  ],
}, app);