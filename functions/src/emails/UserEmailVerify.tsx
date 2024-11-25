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
          <Heading className="heading">Dobrý deň {userFirstName},</Heading>
          <Text>Prosím potvrdte rezerváciu kliknútím na tlačidlo nižšie.</Text>

          <div className="button-container">
            <Button href={verifyLink} className="accept-button">
              POTVRDIŤ REZERVÁCIU
            </Button>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

export default UserEmailVerify;
