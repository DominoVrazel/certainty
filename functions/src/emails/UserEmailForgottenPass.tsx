import React from "react";

import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Button,
} from "@react-email/components";

export function UserEmailForgottenPass({ resetLink }: { resetLink: string }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Pre obnovu hesla kliknite na tlačidlo nižšie</Heading>
          <Text></Text>
          <Button
            href={resetLink}
            style={{
              backgroundColor: "#007bff",
              color: "#ffffff",
              padding: "10px 20px",
              borderRadius: "5px",
              textDecoration: "none",
            }}
          >
            Obnoviť heslo
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

export default UserEmailForgottenPass;
