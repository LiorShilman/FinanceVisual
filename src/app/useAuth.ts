import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

// Firebase's own error codes translated to plain Hebrew — the console-facing messages are English
// and assume the reader knows the SDK's vocabulary, neither of which fits this app's audience.
const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/user-disabled': 'המשתמש הזה חסום',
  'auth/user-not-found': 'לא נמצא משתמש עם האימייל הזה',
  'auth/wrong-password': 'סיסמה שגויה',
  'auth/invalid-credential': 'אימייל או סיסמה שגויים',
  'auth/email-already-in-use': 'כבר קיים משתמש עם האימייל הזה',
  'auth/weak-password': 'הסיסמה חייבת להכיל לפחות 6 תווים',
  'auth/popup-closed-by-user': 'החלון נסגר לפני שהושלמה ההתחברות',
  'auth/network-request-failed': 'בעיית רשת — נסה/י שוב',
  'auth/operation-not-allowed': 'שיטת ההתחברות הזו לא מופעלת בפרויקט — יש להפעיל אותה תחת Authentication → Sign-in method בקונסולת Firebase',
  'auth/unauthorized-domain': 'הדומיין הזה לא מאושר בפרויקט — יש להוסיף אותו תחת Authentication → Settings → Authorized domains בקונסולת Firebase',
};

function friendlyAuthError(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  return ERROR_MESSAGES[code] ?? 'משהו השתבש, נסה/י שוב';
}

export interface UseAuthResult {
  user: User | null;
  /** true only until the very first auth-state callback fires — Firebase always resolves this
   * quickly (from a cached session or straight to "logged out"), never stays true indefinitely. */
  loading: boolean;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error?: string }> {
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    return {};
  } catch (err) {
    return { error: friendlyAuthError(err) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<{ error?: string }> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return {};
  } catch (err) {
    return { error: friendlyAuthError(err) };
  }
}

export async function signInWithGoogle(): Promise<{ error?: string }> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    return {};
  } catch (err) {
    return { error: friendlyAuthError(err) };
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
