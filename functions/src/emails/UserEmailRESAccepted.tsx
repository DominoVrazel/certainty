import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
} from "@react-email/components";

interface ReservationAcceptedNotificationProps {
  userFirstName: string;
}

export function ReservationAcceptedNotification({
  userFirstName,
}: ReservationAcceptedNotificationProps) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Dobrý deň, {userFirstName}</Heading>
          <Text>
            <h2>
              <b>Vaša rezervácia bola POTVRDENÁ strediskom.</b>
            </h2>
            <p> Tešíme sa na Vašu návštevu a prajeme úspešný tréning</p>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationAcceptedNotification;
