/**
 * Firebase configuration for Zenithfall web application
 * This file initializes Firebase services and provides authentication
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration - these values come from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase only if we have the configuration and not already initialized
let app;
let auth: Auth | undefined;
let db: Firestore | undefined;

if (typeof window !== 'undefined') {
  // Client-side initialization
  const isFirebaseEnabled = !!firebaseConfig.projectId;

  if (isFirebaseEnabled && firebaseConfig.projectId) {
    // Only initialize if not already done
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);

    console.log('🔥 Firebase initialized for project:', firebaseConfig.projectId);
  } else {
    console.log('🔥 Firebase disabled - running in local mode');
  }
}

/**
 * Sign in anonymously - this is our baseline authentication
 */
export async function signInAnonymous(): Promise<string | null> {
  if (!auth) {
    console.warn('Firebase auth not initialized');
    return null;
  }

  try {
    const result = await signInAnonymously(auth);
    console.log('🔥 Anonymous sign-in successful:', result.user.uid);
    return result.user.uid;
  } catch (error) {
    console.error('🔥 Anonymous sign-in failed:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function getCurrentUser() {
  return auth?.currentUser || null;
}

/**
 * Get Firebase services
 */
export function getFirebaseServices() {
  return {
    auth,
    db,
    isEnabled: !!auth && !!db
  };
}

/**
 * Get authentication token for API calls
 */
export async function getAuthToken(): Promise<string | null> {
  if (!auth?.currentUser) {
    // Try to sign in anonymously
    await signInAnonymous();
  }

  if (auth?.currentUser) {
    try {
      return await auth.currentUser.getIdToken();
    } catch (error) {
      console.error('🔥 Failed to get auth token:', error);
      return null;
    }
  }

  return null;
}

/**
 * Firebase configuration object for debugging
 */
export function getFirebaseConfig() {
  return {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    isEnabled: !!firebaseConfig.projectId,
    hasAuth: !!auth,
    hasFirestore: !!db
  };
}

export { auth, db };