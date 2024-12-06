import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  Auth,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDuV2weROSjrpxjtDvGI0o1vkVAWjeMKas",
  authDomain: "certaintyapp.firebaseapp.com",
  projectId: "certaintyapp",
  storageBucket: "certaintyapp.appspot.com",
  messagingSenderId: "221725605974",
  appId: "1:221725605974:web:27bd45736e68497eaa3bf7",
  measurementId: "G-K5NVX8S4WV",
};

export {
  db,
  auth,
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

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]; // Use the existing initialized app
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export const registerUser = async (
  first_name: string,
  second_name: string,
  email: string,
  password: string,
  ConfirmPassword: string,
  sport_club: string,
  tel_number: string,
  ZSL_code: string
): Promise<boolean> => {
  try {
    if (
      !first_name ||
      !second_name ||
      !email ||
      !password ||
      !sport_club ||
      !tel_number
    ) {
      alert("Vyplňte všetky polia");
      return false;
    } else if (password != ConfirmPassword) {
      alert("Neplatné overenie hesla");
      return false;
    } else if (!isStrongPassword(password)) {
      alert(
        "Heslo musí obsahovať aspoň jedno veľké písmeno, jedno malé písmeno, jedno číslo a musí mať minimálne 6 znakov."
      );
      return false;
    } else if (!isValidPhoneNumber(tel_number)) {
      alert("Neplatné telefónne číslo.");
      return false;
    } else if (ZSL_code && !isValidZSL_code(ZSL_code)) {
      alert("Nesprávne registračné číslo ZSL.");
      return false;
    }
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
      "Registrácia prebehla úspešne . Na váš email sme odoslali potvrdenie."
    );
    return true;
  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      alert("Zadaný email sa už používa. Zadajte iný email.");
    } else if (error.code === "auth/invalid-email") {
      alert("Neplatný email");
    } else if (error.code === "auth/weak-password") {
      alert("Slabé heslo");
    } else {
      console.error("Registrácia používateľa zlyhala: ", error);
      alert(error.message);
    }
    return false;
  }
};

const isStrongPassword = (password: string): boolean => {
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,}$/;
  return strongPasswordRegex.test(password);
};

const isValidPhoneNumber = (tel_number: string): boolean => {
  const phoneNumberRegex = /^\+\d{3}\d{9}$/;
  return phoneNumberRegex.test(tel_number);
};

const isValidZSL_code = (ZSL_code: string): boolean => {
  const zslCodeRegex = /^(\d{3}|\d{6})$/;
  return zslCodeRegex.test(ZSL_code);
};

export const loginUser = async (
  email: string,
  password: string
): Promise<any> => {
  const auth = getAuth();
  try {
    // Validate email and password input
    if (!email || !password) {
      alert("Vyplňte správne všetky polia.");
      return;
    }
    if (validate_email(email) === false) {
      alert("Neplatný email."); // "Invalid email."
      return;
    }

    const userQuery = query(
      collection(db, "users"),
      where("email", "==", email)
    );
    const querySnapshot = await getDocs(userQuery);

    if (querySnapshot.empty) {
      // User does not exist
      alert("Používateľ neexistuje. Skontrolujte správnosť svojho emailu."); // "User does not exist."
      return;
    }

    const userData = querySnapshot.docs[0].data();

    // Check if the user is verified
    if (!userData.isVerified) {
      alert(
        "Váš účet nie je overený. Skontrolujte svoj email a overte svoj účet."
      ); // "Your account is not verified."
      return;
    }

    // Firebase sign-in with email and password
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Successful login
    console.log(`Prihlásený užívateľ: ${user.email}`);

    localStorage.setItem("userEmail", email);
    localStorage.setItem("userFirstName", userData.firstName);
    localStorage.setItem("userSecondName", userData.secondName);
    localStorage.setItem("userSportClub", userData.sportClub);
    localStorage.setItem("userAdmin", userData.isAdmin);
    localStorage.setItem("userVerified", userData.isVerified);
    localStorage.setItem("userZSL_code", userData.ZSL_code);

    if (userData.isAdmin === true) {
      alert(`Vitaj admin`);
    } else {
      alert(`Dobrý deň ${userData.firstName} prihlásenie prebehlo úspešne`);
    }

    return {
      email: user.email,
      firstName: userData.firstName,
      secondName: userData.secondName,
      sportClub: userData.sportClub,
      isAdmin: userData.isAdmin,
      isVerified: userData.isVerified,
      ZSL_code: userData.ZSL_code,
    };
  } catch (error: any) {
    // Handle login errors

    if (error.code === "auth/invalid-credential") {
      alert("Nesprávne heslo."); // "Invalid credentials."
    } else {
      console.error("Chyba pri prihlasovaní: ", error); // "Error during login: "
      alert(`Chyba pri prihlasovaní: ${error.message}`); // "Error during login: [error message]"
    }
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
    alert("Odhlásenie prebehlo úspešne."); // "Logout successful."
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
