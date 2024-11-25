import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  collection,
  Firestore,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import LoadingAnimation, { LoaderState } from "./LoadingAnimation";

enum VerifyUserStatus {
  EmailNotFound,
  AlreadyVerified,
  Success,
  Fail,
  None,
}

async function getUserByEmail(db: Firestore, email: string) {
  const users = collection(db, "users");
  const usersQuery = query(users, where("email", "==", email));
  const userQueryDocs = await getDocs(usersQuery);

  return userQueryDocs.docs[0];
}

async function getSessionEmail(db: Firestore, uuid: string) {
  const reservationsRef = collection(db, "verify_user_sessions");
  const sessionQuery = query(reservationsRef, where("uuid", "==", uuid));
  const docs = await getDocs(sessionQuery);
  const session = docs.docs[0];

  return session.data().email;
}

async function isUserVerified(db: Firestore, email: string) {
  const user = await getUserByEmail(db, email);
  return user.data().isVerified === true;
}

async function verifyUser(db: Firestore, email: string) {
  const user = await getUserByEmail(db, email);

  await updateDoc(user.ref, {
    isVerified: true,
  });
}

const VerifyUserMessage: React.FC<{ userStatus: VerifyUserStatus }> = (
  props
) => {
  const userStatus = props.userStatus;

  switch (userStatus) {
    case VerifyUserStatus.AlreadyVerified:
      return <p>Vas email je uz overeny</p>;
    case VerifyUserStatus.Success:
      return <p>Vas email bol uspesne overeny</p>;
    case VerifyUserStatus.Fail:
      return <p>Vas email sa nepodarilo overit</p>;
    case VerifyUserStatus.EmailNotFound:
      return <p>Pouzivatel nebol najdeny</p>;
    default:
      return null;
  }
};

const VerifyUser: React.FC = () => {
  const location = useLocation();
  const [status, setStatus] = useState(VerifyUserStatus.None);
  const [verifyLoadingState, setVerifyLoadingState] = useState(
    LoaderState.Loading
  );


  const queryParams = new URLSearchParams(location.search);
  const uuid = queryParams.get("uuid") as string;

  useEffect(() => {
    const verifyUserLogic = async () => {
      const db = getFirestore();
      let userEmail;

      try {
        userEmail = await getSessionEmail(db, uuid);
      } catch (error) {
        console.log("Error: ", error);
        setStatus(VerifyUserStatus.EmailNotFound);
        setVerifyLoadingState(LoaderState.Finsihed);
        return;
      }

      const isVerified = await isUserVerified(db, userEmail);
      if (isVerified) {
        setStatus(VerifyUserStatus.AlreadyVerified);
        setVerifyLoadingState(LoaderState.Finsihed);
        return;
      }
      try {
        await verifyUser(db, userEmail);
      } catch (error) {
        console.log("Error: ", error);
        setStatus(VerifyUserStatus.Fail);
        setVerifyLoadingState(LoaderState.Finsihed);
        return;
      }

      setStatus(VerifyUserStatus.Success);
      setVerifyLoadingState(LoaderState.Finsihed);

    };

    verifyUserLogic();
  }, [location]);

  return (
    <>
      {/* {email && <p>Email: {email}</p>} */}
      <div className="ForgottenPass-body">
        <LoadingAnimation state={verifyLoadingState}></LoadingAnimation>
        <VerifyUserMessage userStatus={status}></VerifyUserMessage>
      </div>
    </>
  );
};

export default VerifyUser;
