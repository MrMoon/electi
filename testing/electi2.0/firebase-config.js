import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB5hQwe1q-KkHovjbppL151JF4MaBN7-O4",
  authDomain: "operation-electi.firebaseapp.com",
  projectId: "operation-electi",
  storageBucket: "operation-electi.firebasestorage.app",
  messagingSenderId: "390391477698",
  appId: "1:390391477698:web:01a68241996f311959925b",
  measurementId: "G-TST9TKC5RP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// FIX: Initialize App Check to solve the token error
// IMPORTANT: For development, this allows localhost access. 
// For production, you must register your site with reCAPTCHA v3 in the
// Google Cloud console and add your site key to the provider.
// You also need to enforce App Check in the Firebase console.
try {
    const appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'), // Public reCAPTCHA key for localhost
        isTokenAutoRefreshEnabled: true
    });
    console.log("Firebase App Check initialized.");
} catch(e) {
    console.error("Error initializing Firebase App Check", e);
}


const firebaseServices = { 
    auth, 
    db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    doc, 
    setDoc, 
    getDoc, 
    serverTimestamp 
};

export { firebaseServices };

