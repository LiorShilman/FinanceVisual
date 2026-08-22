import { useState, type FormEvent } from 'react';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../../app/useAuth';
import styles from './LoginScreen.module.css';

type Mode = 'signIn' | 'signUp';

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = mode === 'signIn' ? await signInWithEmail(email, password) : await signUpWithEmail(email, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  async function handleGoogle() {
    setError(null);
    setSubmitting(true);
    const result = await signInWithGoogle();
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>הלוח הפיננסי המשפחתי</h1>
        <p className={styles.subtitle}>{mode === 'signIn' ? 'התחברות לחשבון שלך' : 'יצירת חשבון חדש'}</p>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'signIn' ? styles.tabActive : ''}`}
            onClick={() => setMode('signIn')}
          >
            התחברות
          </button>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'signUp' ? styles.tabActive : ''}`}
            onClick={() => setMode('signUp')}
          >
            הרשמה
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>אימייל</span>
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>סיסמה</span>
            <input
              className={styles.input}
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <span className={styles.error}>{error}</span>}

          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={submitting}>
            {mode === 'signIn' ? 'התחברות' : 'הרשמה'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>או</span>
        </div>

        <button type="button" className={styles.btn} onClick={handleGoogle} disabled={submitting}>
          המשך עם Google
        </button>
      </div>
    </div>
  );
}
