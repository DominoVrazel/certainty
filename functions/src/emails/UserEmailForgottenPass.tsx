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
      <Head>
        <style>
          {`
          
          .heading{
            font-size: 20px;
            text-align: center;
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
          <Heading className="heading">
            Pre obnovu hesla kliknite na tlačidlo nižšie
          </Heading>

          <div className="button-container">
            <Button href={resetLink} className="accept-button">
              OBNOVIŤ HESLO
            </Button>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

export default UserEmailForgottenPass;
