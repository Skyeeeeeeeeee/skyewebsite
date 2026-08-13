// Paste your Firebase project's config here:
// Firebase console -> Project settings (gear icon) -> General -> "Your apps" -> Web app.
// These values are meant to be public/client-side — Firestore security rules are what
// actually keep your data private, not secrecy of these keys.
const realConfig = {
  apiKey: "AIzaSyA_leHDLfTqGZ3O-4uF3ZyI45bCWjXLC4g",
  authDomain: "skyesite-70e06.firebaseapp.com",
  projectId: "skyesite-70e06",
  storageBucket: "skyesite-70e06.firebasestorage.app",
  messagingSenderId: "642041699159",
  appId: "1:642041699159:web:399342ce828c4274823c12",
};

// When the site is opened from localhost (local dev/testing), talk to local Firebase
// emulators instead of the real project so nothing real gets touched during development.
export const useEmulators = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// Firebase treats any "demo-"-prefixed project ID as emulator-only — no real project needed.
// If you run `firebase emulators:start --project <id>` yourself, make this match that id.
const demoConfig = { apiKey: 'demo-key', authDomain: 'demo-project.firebaseapp.com', projectId: 'demo-project' };

export const firebaseConfig = useEmulators ? demoConfig : realConfig;
