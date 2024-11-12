import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
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
      <Head />
      <Body>
        <Container>
          <Heading>Dobrý deň, {userFirstName}</Heading>
          <Text>
            <h2>
              <b>Vaša rezervácia bola úspešne VYTVORENÁ.</b>
            </h2>
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
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationNotification;
