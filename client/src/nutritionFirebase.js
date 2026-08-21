
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const nutritionConfig = {
  apiKey: import.meta.env.VITE_NUTRITION_API_KEY,
  authDomain: import.meta.env.VITE_NUTRITION_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_NUTRITION_PROJECT_ID || "swarm-nutrition-app",
  storageBucket: import.meta.env.VITE_NUTRITION_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_NUTRITION_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_NUTRITION_APP_ID
};

const nutritionApp = initializeApp(nutritionConfig, "nutrition");
export const nutritionDb = getFirestore(nutritionApp);