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
  /**
   * Which training was cancelled. A club with several bookings could not tell
   * from this mail which one it had lost — it said only that one of them was
   * gone. All optional, because the same mail is rendered for older payloads
   * that carried nothing but the name.
   */
  courseName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  lineNumber?: number;
}

export function ReservationDeletedNotification({
  userFirstName,
  courseName,
  date,
  startTime,
  endTime,
  lineNumber,
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
            font-family: Helvetica, sans-serif;
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

            {date && (
              <p>
                Zrušený bol tréning {courseName ? <>pre trať <b>{courseName}</b> </> : null}
                na deň <b>{date}</b>
                {startTime ? (
                  <>
                    {" "}od <b>{startTime}</b> do <b>{endTime}</b>
                  </>
                ) : null}
                {lineNumber ? (
                  <>
                    {" "}v trati <b>{lineNumber}</b>
                  </>
                ) : null}
                .
              </p>
            )}

            <p>
              Pre viac informácii napíšte na e-mail strediska. Nájdete ho na
              stránke kliknutím na tlačidlo "Návod ako postupovať" v kalendári
              daného strediska.
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
