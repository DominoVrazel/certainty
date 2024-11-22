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

interface ReservationAcceptedNotificationProps {
  userFirstName: string;
}

export function ReservationAcceptedNotification({
  userFirstName,
}: ReservationAcceptedNotificationProps) {
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
          <Heading>Dobrý deň {userFirstName},</Heading>
          <Text>
            <p>
              <b>
                Vaša rezervácia bola{" "}
                <span className="ResCreatedText">POTVRDENÁ</span> strediskom.
              </b>
            </p>
            <p> Tešíme sa na Vašu návštevu a prajeme úspešný tréning</p>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationAcceptedNotification;
