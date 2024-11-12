import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
} from "@react-email/components";

interface ReservationDeletedNotificationProps {
  userFirstName: string;
}

export function ReservationDeletedNotification({
  userFirstName,
}: ReservationDeletedNotificationProps) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Dobrý deň, {userFirstName}</Heading>
          <Text>
            <h2>
              <b>Vaša rezervácia bola ZRUŠENÁ strediskom.</b>
            </h2>
            <p> Pre viac info napíšte na mail: </p>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ReservationDeletedNotification;
