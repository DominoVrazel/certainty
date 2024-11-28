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

interface ReservationDeletedNotificationProps {
  userFirstName: string;
}

export function ReservationDeletedNotification({
  userFirstName,
}: ReservationDeletedNotificationProps) {
  return (
    <Html>
      <Head>
        <style>
          {`
          .ResDeletedText{
            color: #a01616;
            font-size: 20px;
            font-weight: bold;
          }
          
          .heading{
            font-size: 28px;
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
            padding-bottom: 2vw;
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
              Vaša rezervácia bola{" "}
              <span className="ResDeletedText">ZRUŠENÁ</span> strediskom.
            </p>

            <p>
              Pre viac informácii napíšte na e-mail strediska. Nájdete ho na
              stránke kliknutím na tlačidlo informácie v kalendári daného
              strediska.
            </p>
          </Text>

          <Img
            src="https://www.timing.sk/online14/ski/stsl.png"
            alt="ZSL Logo"
            width="100"
            style={{ paddingBottom: "10px" }}
          />
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationDeletedNotification;
