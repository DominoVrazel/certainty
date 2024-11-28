import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Img,
  Button,
} from "@react-email/components";

interface ReservationNotificationProps {
  userFirstName: string;
  verifyLink: string;
}

export function UserEmailVerify({
  userFirstName,
  verifyLink,
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
            font-size: 28px;
            text-align: center;
          }

          p{
            font-size: 18px;
            text-align: center;
          }

          .regards {
            text-align: left;
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
            border-radius: 1vw;
            margin-top: 4vw;
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
      <Body className="body">
        <Container className="container">
          <Img
            src="https://sp-ao.shortpixel.ai/client/to_webp,q_glossy,ret_img,w_1020,h_994/https://www.zvazslovenskeholyzovania.sk/wp-content/uploads/zsl-rysko-zjazdove-lyzovanie-1024x998.png"
            alt="Reservation Image"
            width="100"
            style={{ marginLeft: "auto", marginRight: "auto" }}
          />
          <Heading className="heading">Dobrý deň {userFirstName},</Heading>
          <Text>
            <p>Prosím overte svoj email kliknútím na tlačidlo nižšie.</p>
          </Text>

          <div className="button-container">
            <Button href={verifyLink} className="accept-button">
              POTVRDIŤ EMAIL
            </Button>
          </div>
          <Text>
            <p className="regards">S pozdravom,</p>
          </Text>
          <Img
            src="https://www.timing.sk/online14/ski/stsl.png"
            alt="ZSL Logo"
            width="100"
            style={{ paddingBottom: "1vw" }}
          />
        </Container>
      </Body>
    </Html>
  );
}

export default UserEmailVerify;
