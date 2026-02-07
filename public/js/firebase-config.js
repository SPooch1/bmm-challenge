const firebaseConfig = {
  apiKey: "AIzaSyCd9_N57ytAly0vbBOMa08sUnX_cSJ8-UI",
  authDomain: "bmm-challenge-fd4fd.firebaseapp.com",
  projectId: "bmm-challenge-fd4fd",
  storageBucket: "bmm-challenge-fd4fd.firebasestorage.app",
  messagingSenderId: "143539334532",
  appId: "1:143539334532:web:dbe1919656c38a358401d1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Offline persistence disabled for now — can cause issues in Safari

// auth and db are global — used by all modules
