import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Section,
  Row,
  Tailwind,
} from "@react-email/components";

interface ReservationConfirmationProps {
  userFirstName: string;
  userSecondName: string;
  course: string;
  date: string;
  startTime: string;
  endTime: string;
  lineNumber: number;
  baseUrl: string;
  discipline: string;
  category: string;
}

export function ReservationConfirmation({
  userFirstName,
  userSecondName,
  course,
  date,
  startTime,
  endTime,
  lineNumber,
  baseUrl,
  discipline,
  category,
}: ReservationConfirmationProps) {
  return (
    <Html>
      <Head>
        <style>
          {`
              body {
             
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: Helvetica, sans-serif;
                margin: 0;
                padding: 0;
              }
              
              .container {
                width: 100%;
                max-width: 500px;
                padding: 20px;
                margin: 0 auto;
                border: 3px solid #e0e0e0;
                border-radius: 8px;
                background-color: #f9f9f9;
              }
  
              .heading {
                padding-top: 15px;
                text-align: center;
                color: #333;
                font-size: 2rem;
                font-weight: bold;
              }
  
              .section-text {
                color: #B22222; 
                font-weight: 500; 
                text-align: center;
                font-size: 1rem;
           
              }
  
              .content {
                color: #333;
                font-weight: 500;
                width: 80%;
                margin: 0 auto;
                text-align: left;
                font-size: 0.9rem;
              }
  
              .text-center {
                text-align: center;
                font-size: 1.7rem;
                font-weight: bold;
                margin-bottom: 1vw;
              }

              .button-container {
                display: flex !important;
                justify-content: center !important;
                margin-top: 1vw;
              }
  
              .accept-button {
                background-color: #4CAF50 !important; 
                color: #fff !important;
                text-decoration: none !important;
             
                padding-top: 0.9rem !important;
                padding-bottom: 0.9rem !important;
                padding-left: 1rem !important;
                padding-right: 1rem !important;

                border-radius: 10px !important;
                font-weight: bold !important;
                text-align: center !important;
                margin-left: auto !important;
                margin-right: auto !important;
           
              }
  
              .accept-button:hover {
                background-color: #45a049;
              }
            `}
        </style>
      </Head>
      <Body>
        <Container className="container">
          <Heading className="heading">Ahoj, Admin</Heading>
          <Text>
            <Section className="section-text">
              <h2>
                Na stránke pre rezerváciu tréningov<br></br> VZNIKLA NOVÁ
                REZERVÁCIA.
              </h2>
            </Section>
            <Container className="content">
              <h2 className="text-center">Detail rezervácie:</h2>
              <p>
                Užívateľ{" "}
                <b>
                  {userFirstName} {userSecondName}
                </b>{" "}
                vytvoril novú rezerváciu.
              </p>
              <p>
                Disciplína: <b>{discipline}</b>, Kategória: <b>{category}</b>.
              </p>
              <p>
                Rezervovaná trať: <b>{course}</b> na deň: <b>{date}</b> v líni:{" "}
                <b>{lineNumber}</b>.
              </p>
              <p>
                V čase od: <b>{startTime}</b> do: <b>{endTime}</b>.
              </p>
            </Container>
          </Text>

          <div className="button-container">
            <Button href={baseUrl} className="accept-button">
              POTVRDIŤ REZERVÁCIU
            </Button>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationConfirmation;
