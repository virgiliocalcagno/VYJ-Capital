import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "api-key-manual-placeholder", // Se reemplaza por la del usuario si es necesario
  authDomain: "vyj-capital.firebaseapp.com",
  projectId: "vyj-capital",
  storageBucket: "vyj-capital.appspot.com",
  messagingSenderId: "367375355026",
  appId: "1:367375355026:web:866e746e8aeecda16c5181"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
