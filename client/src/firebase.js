import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAMs-wQc8FG9cu9aHFzXYLy2XC41phCmaA",
  authDomain: "swarm-12-week-startup.firebaseapp.com",
  projectId: "swarm-12-week-startup",
  storageBucket: "swarm-12-week-startup.firebasestorage.app",
  messagingSenderId: "936210614408",
  appId: "1:936210614408:web:afc70c25feb9892cdbb73d"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);