import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// CONFIGURACIÓN REAL EXTRAÍDA DE VYJ-CAPITAL CLOUD
const firebaseConfig = {
  apiKey: "AIzaSyAQI11AzX5yhmP0trc1RcUQOfPxdIqPObk",
  authDomain: "vyj-capital.firebaseapp.com",
  projectId: "vyj-capital",
  storageBucket: "vyj-capital.firebasestorage.app",
  messagingSenderId: "980348234124",
  appId: "1:980348234124:web:c78c003490d533b9a04ea9"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);

// Exportación de servicios
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1");

export default app;
