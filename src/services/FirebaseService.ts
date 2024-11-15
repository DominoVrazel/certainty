import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, Auth, signOut } from "firebase/auth";
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

export { db, auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setDoc, getDocs, collection, doc, query, where };

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
  tel_number: string
): Promise<boolean> => {
  try {
    if (!first_name || !second_name || !email || !password || !sport_club) {
      alert("Vyplňte všetky polia");
      return false; 
    }
    else if (password != ConfirmPassword){
      alert("Neplatné overenie hesla");
      return false;
    } 
    //creating a new user with the email and password
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Add user data to Firestore
    const userDocRef = doc(collection(db, "users"), user.uid); 
    await setDoc(userDocRef, {
      firstName: first_name,
      secondName: second_name,
      email: email,
      tel_number: tel_number,
      sportClub: sport_club,
      isAdmin: false,
      createdAt: new Date(),
    });

    console.log("Používateľ pridaný do databázy!");
    alert("Registrácia prebehla úspešne!");
    return true;

  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      alert("Zadaný email sa už používa. Zadajte iný email.");
    }
    else if(error.code === "auth/invalid-email"){
      alert("Neplatný email");
    }
    else if(error.code === "auth/weak-password"){
      alert("Slabé heslo (Minimum 6 písmen)")
    }
    else {
      console.error("Registrácia používateľa zlyhala: ", error);
      alert(error.message);
    }
    return false;
  }
};

export const loginUser = async (email: string, password: string): Promise<any> => {
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

    const userQuery = query(collection(db, "users"), where("email", "==", email));
    const querySnapshot = await getDocs(userQuery);

    if (querySnapshot.empty) {
      // User does not exist
      alert("Používateľ neexistuje. Skontrolujte správnosť svojho emailu."); // "User does not exist."
      return;
    }

    // Firebase sign-in with email and password
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userData = querySnapshot.docs[0].data();
    // Successful login
    console.log(`Prihlásený užívateľ: ${user.email}`);
    
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userFirstName", userData.firstName);
    localStorage.setItem("userSecondName", userData.secondName);
    localStorage.setItem("userSportClub", userData.sportClub);
    localStorage.setItem("userAdmin", userData.isAdmin);

    
    if (userData.isAdmin === true){
      alert(`Vitaj admin`)
    }
    else{
      alert(`Dobrý deň ${userData.firstName} prihlásenie prebehlo úspešne`);
    }
    

    return {
      email: user.email,
      firstName: userData.firstName,
      secondName: userData.secondName,
      sportClub: userData.sportClub,
      isAdmin: userData.isAdmin,
    };

  } catch (error: any) {
    // Handle login errors

    if (error.code === "auth/invalid-credential") {
      alert("Nesprávne heslo."); // "Invalid credentials."
    } 
    else {
      console.error("Chyba pri prihlasovaní: ", error); // "Error during login: "
      alert(`Chyba pri prihlasovaní: ${error.message}`); // "Error during login: [error message]"
    }
  }
};

function validate_email(email: any){
  const expression = /^[^@]+@\w+(\.\w+)+\w$/
  if (expression.test(email) == true){
    return true
  }
  else {
    return false
  }
}

export const logoutUser = async (): Promise<void> => {
  const auth = getAuth();
  try {
    await signOut(auth);
    // Clear user data from session storage
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userFirstName");
    localStorage.removeItem("userSecondName");
    localStorage.removeItem("userSportClub");
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