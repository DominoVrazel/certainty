import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  Auth,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  Functions,
} from "firebase/functions";

import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDuV2weROSjrpxjtDvGI0o1vkVAWjeMKas",
  authDomain: "certaintyapp.firebaseapp.com",
  projectId: "certaintyapp",
  storageBucket: "certaintyapp.firebasestorage.app",
  messagingSenderId: "221725605974",
  appId: "1:221725605974:web:27bd45736e68497eaa3bf7",
  measurementId: "G-K5NVX8S4WV",
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]; // Use the existing initialized app
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage = getStorage(app);
const functions: Functions = getFunctions(app);

// Local development runs against the Firebase emulator suite (`npm run dev`).
// Every emulator is wired up here and nowhere else, so the whole app agrees on
// which backend it is talking to. Guarded against Vite HMR re-executing this
// module, because the connect* helpers throw once a service has been used.
export const USING_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true";

const EMULATOR_HOST = "127.0.0.1";
const emulatorState = globalThis as typeof globalThis & {
  __certaintyEmulatorsConnected?: boolean;
};

if (USING_EMULATORS && !emulatorState.__certaintyEmulatorsConnected) {
  emulatorState.__certaintyEmulatorsConnected = true;

  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);

  console.info(
    "%c[certainty] Firebase emulators connected — no production data is being touched.",
    "color:#0a0;font-weight:bold"
  );
}

/**
 * Resolves once Firebase Auth has restored (or ruled out) a session.
 *
 * Auth rehydrates from IndexedDB asynchronously, so a read fired straight from
 * a component's mount effect can go out before the token is attached. With the
 * old open rules that went unnoticed; now such a read is simply denied, and the
 * screen renders empty. Await this before any read that requires a signed-in
 * user.
 */
export const authReady: Promise<void> = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, () => {
    unsubscribe();
    resolve();
  });
});

export {
  app,
  db,
  auth,
  storage,
  functions,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  setDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
};

export const registerUser = async (
  first_name: string,
  second_name: string,
  email: string,
  password: string,
  ConfirmPassword: string,
  sport_club: string,
  tel_number: string,
  ZSL_code: string
): Promise<{ success: boolean; message: string }> => {
  try {
    //creating a new user with the email and password
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Add user data to Firestore
    const userDocRef = doc(collection(db, "users"), user.uid);
    await setDoc(userDocRef, {
      firstName: first_name,
      secondName: second_name,
      email: email,
      tel_number: tel_number,
      sportClub: sport_club,
      ZSL_code: ZSL_code,
      isAdmin: false,
      isVerified: false,
      createdAt: new Date(),
    });

    console.log("Používateľ pridaný do databázy!");
    alert(
      "Registrácia prebehla úspešne. Na váš email sme odoslali potvrdenie registrácie."
    );
    return {
      success: true,
      message:
        "Registrácia prebehla úspešne. Na váš email sme odoslali potvrdenie.",
    };
  } catch (error: any) {
    let errorMessage = "Registrácia používateľa zlyhala.";
    if (error.code === "auth/email-already-in-use") {
      errorMessage = "Zadaný email sa už používa. Zadajte iný email.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Neplatný email";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Slabé heslo";
    } else {
      console.error("Registrácia používateľa zlyhala: ", error);
      errorMessage = error.message;
    }
    return { success: false, message: errorMessage };
  }
};

export const loginUser = async (
  email: string,
  password: string
): Promise<{ success: boolean; message: string; userData?: any }> => {
  const auth = getAuth();
  try {
    // Validate email and password input
    if (!email || !password) {
      return { success: false, message: "Vyplňte správne všetky polia." };
    }
    if (validate_email(email) === false) {
      return { success: false, message: "Neplatný email." };
    }

    // Authenticate FIRST, then read the profile by uid.
    //
    // This used to query `users` by e-mail before signing in, which forced the
    // collection to be world-readable and let anyone check whether an address
    // was registered. Signing in first means the only profile a caller can
    // read is their own.
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      return {
        success: false,
        message: "Používateľ neexistuje. Skontrolujte správnosť svojho emailu.",
      };
    }

    const userData = userDoc.data();

    // Check if the user is verified
    if (!userData.isVerified) {
      await signOut(auth);
      return {
        success: false,
        message:
          "Váš účet nie je overený. Skontrolujte svoj email a overte svoj účet.",
      };
    }

    localStorage.setItem("userId", userDoc.id);
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userFirstName", userData.firstName);
    localStorage.setItem("userSecondName", userData.secondName);
    localStorage.setItem("userSportClub", userData.sportClub);
    localStorage.setItem("userAdmin", userData.isAdmin);
    localStorage.setItem("userVerified", userData.isVerified);
    localStorage.setItem("userZSL_code", userData.ZSL_code);
    localStorage.setItem("userTel_number", userData.tel_number);

    return {
      success: true,
      message: userData.isAdmin
        ? "Vitaj admin"
        : `Dobrý deň ${userData.firstName} prihlásenie prebehlo úspešne`,
      userData: {
        email: user.email,
        firstName: userData.firstName,
        secondName: userData.secondName,
        sportClub: userData.sportClub,
        isAdmin: userData.isAdmin,
        isVerified: userData.isVerified,
        ZSL_code: userData.ZSL_code,
        // tel_number: userData.tel_number,
      },
    };
  } catch (error: any) {
    let errorMessage = "Chyba pri prihlasovaní.";
    if (error.code === "auth/invalid-credential") {
      errorMessage = "Nesprávne heslo.";
    } else {
      console.error("Chyba pri prihlasovaní: ", error); // "Error during login: "
      errorMessage = `Chyba pri prihlasovaní: ${error.message}`;
    }
    return { success: false, message: errorMessage };
  }
};

function validate_email(email: any) {
  const expression = /^[^@]+@\w+(\.\w+)+\w$/;
  if (expression.test(email) == true) {
    return true;
  } else {
    return false;
  }
}

export const checkIfEmailExists = async (email: string): Promise<boolean> => {
  const userQuery = query(collection(db, "users"), where("email", "==", email));
  const querySnapshot = await getDocs(userQuery);
  return !querySnapshot.empty;
};

export const logoutUser = async (): Promise<void> => {
  const auth = getAuth();
  try {
    await signOut(auth);
    // Clear user data from session storage
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userFirstName");
    localStorage.removeItem("userSecondName");
    localStorage.removeItem("userSportClub");
    localStorage.removeItem("userAdmin");
    localStorage.removeItem("userVerified");
    localStorage.removeItem("userZSL_code");
    localStorage.removeItem("userTel_number");
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Chyba pri odhlasovaní: ", error.message); // Access message safely
      alert(`Chyba pri odhlasovaní: ${error.message}`); // "Error during logout: [error message]"
    } else {
      console.error("Chyba pri odhlasovaní: ", error); // Fallback for non-Error types
      alert("Chyba pri odhlasovaní."); // Generic error message
    }
  }
};
