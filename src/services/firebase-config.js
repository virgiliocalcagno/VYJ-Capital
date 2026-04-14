import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAQI11AzX5yhmP0trc1RcUQOfPxdIqPObk",
  authDomain: "vyj-capital.firebaseapp.com",
  projectId: "vyj-capital",
  storageBucket: "vyj-capital.firebasestorage.app",
  messagingSenderId: "980348234124",
  appId: "1:980348234124:web:c78c003490d533b9a04ea9"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
