// Paste your Firebase project's config here:
// Firebase console -> Project settings (gear icon) -> General -> "Your apps" -> Web app.
// These values are meant to be public/client-side — Firestore security rules are what
// actually keep your data private, not secrecy of these keys.
const realConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// When the site is opened from localhost (local dev/testing), talk to local Firebase
// emulators instead of the real project so nothing real gets touched during development.
export const useEmulators = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// Firebase treats any "demo-"-prefixed project ID as emulator-only — no real project needed.
// If you run `firebase emulators:start --project <id>` yourself, make this match that id.
const demoConfig = { apiKey: 'demo-key', authDomain: 'demo-project.firebaseapp.com', projectId: 'demo-project' };

export const firebaseConfig = useEmulators ? demoConfig : realConfig;
