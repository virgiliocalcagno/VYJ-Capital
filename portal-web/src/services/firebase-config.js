import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// Configuración de Firebase obtenida de vyj-capital
const firebaseConfig = {
  apiKey: "AIzaSyAQI11AzX5yhmP0trc1RcUQOfPxdIqPObk",
  authDomain: "vyj-capital.firebaseapp.com",
  projectId: "vyj-capital",
  storageBucket: "vyj-capital.firebasestorage.app",
  messagingSenderId: "980348234124",
  appId: "1:980348234124:web:c78c003490d533b9a04ea9",
  databaseURL: "https://vyj-capital-default-rtdb.firebaseio.com"
};

// Inicialización de la App de Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios inicializados
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "us-central1"); // Ajusta la región si es necesario

export default app;
