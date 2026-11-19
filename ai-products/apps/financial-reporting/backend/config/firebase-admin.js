import admin from "firebase-admin";
import serviceAccount from "../services/firebaseServiceAccount.json" assert { type: "json" };

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.appspot.com`,
  });

  console.log("✅ Firebase Admin initialized");
}

export default admin;
