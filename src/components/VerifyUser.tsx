import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/FirebaseService";
import LoadingAnimation, { LoaderState } from "./LoadingAnimation";

enum VerifyUserStatus {
  EmailNotFound,
  AlreadyVerified,
  Success,
  Fail,
  None,
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
    /**
     * Verification runs server-side now.
     *
     * It used to read `verify_user_sessions`, look the account up by e-mail and
     * flip `isVerified` straight from the browser. That forced both collections
     * to be world-readable and writable — and anyone who could read a
     * verification token could verify, or hijack, somebody else's account.
     */
    const verifyUserLogic = async () => {
      const verifyUserAccount = httpsCallable<
        { uuid: string },
        { status: string }
      >(functions, "verifyUserAccount");

      try {
        const response = await verifyUserAccount({ uuid });

        switch (response.data?.status) {
          case "VERIFIED":
            setStatus(VerifyUserStatus.Success);
            break;
          case "ALREADY_VERIFIED":
            setStatus(VerifyUserStatus.AlreadyVerified);
            break;
          default:
            setStatus(VerifyUserStatus.EmailNotFound);
        }
      } catch (error) {
        console.error("Verification failed:", error);
        setStatus(VerifyUserStatus.Fail);
      }

      setVerifyLoadingState(LoaderState.Finished);
    };

    verifyUserLogic();
  }, [location]);

  return (
    <>
      <div className="ForgottenPass-body">
        <LoadingAnimation state={verifyLoadingState}></LoadingAnimation>
        <VerifyUserMessage userStatus={status}></VerifyUserMessage>
      </div>
    </>
  );
};

export default VerifyUser;
