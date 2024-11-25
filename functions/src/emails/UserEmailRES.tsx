import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Img,
} from "@react-email/components";

interface ReservationNotificationProps {
  userFirstName: string;
  course: string;
  date: string;
  startTime: string;
  endTime: string;
  lineNumber: number;
  baseUrl: string;
}

export function ReservationNotification({
  userFirstName,
  course,
  date,
  startTime,
  endTime,
  lineNumber,
}: ReservationNotificationProps) {
  return (
    <Html>
      <Head>
        <style>
          {`
          .ResCreatedText{
            color: #008000;
            font-size: 20px;
            font-weight: bold;
          }
          
          .heading{
            font-size: 24px;
          }

          p{
            font-size: 18px;
          }

          .body{
            display: flex;
          }

          .container{
            width: 80%;
            background-color: #fafafa;
            padding-left: 2vw;
            padding-right: 2vw;
            padding-top: 2vw;
            border-radius: 1vw;
            margin-top: 4vw;
            margin-bottom: 1vw;
          }
        
        `}
        </style>
      </Head>
      <Body className="body">
        <Container className="container">
          <Img
            src="https://sp-ao.shortpixel.ai/client/to_webp,q_glossy,ret_img,w_1020,h_994/https://www.zvazslovenskeholyzovania.sk/wp-content/uploads/zsl-rysko-zjazdove-lyzovanie-1024x998.png"
            alt="Reservation Image"
            width="100"
            style={{ paddingLeft: "1vw" }}
          />
          <Heading className="heading">Dobrý deň {userFirstName},</Heading>
          <Text>
            <p>
              <b>
                Vaša rezervácia bola úspešne{" "}
                <span className="ResCreatedText">VYTVORENÁ</span> .
              </b>
            </p>
            <p>
              {" "}
              Rezervácia pre trať <b>{course}</b> na deň <b>{date}</b> od{" "}
              <b>{startTime}</b> do <b>{endTime}</b> v líni <b>{lineNumber}</b>{" "}
              bola vytvorená.
            </p>

            <p>
              <b>Rezervácia teraz čaká na potvrdenie</b> strediskom. Informácie
              o potvrdení rezervácie môžete sledovať na rezervačnej stránke v{" "}
              <b>DETAILE</b> Vašej rezervácie.
            </p>

            <p> S pozdravom,</p>
          </Text>
          <Img
            src="https://www.timing.sk/online14/ski/stsl.png"
            alt="ZSL Logo"
            width="100"
            style={{}}
          />
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationNotification;
