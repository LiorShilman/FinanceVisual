import '@xyflow/react/dist/style.css';
import { ReactFlowProvider } from '@xyflow/react';
import { useAuth } from '../../app/useAuth';
import { useBoardSync } from '../../app/boardSync';
import { BoardScreen } from './BoardScreen';
import { LoginScreen } from './LoginScreen';
import styles from './AuthGate.module.css';

export function AuthGate() {
  const { user, loading: authLoading } = useAuth();
  const { loading: boardLoading } = useBoardSync(user?.uid ?? null);

  // wait for the board's own data too, not just auth — otherwise the board briefly renders with
  // whatever the store's default state happens to be (the free-mode tab) before the real saved
  // layout arrives from Firestore, flashing the wrong tab on every hard refresh.
  if (authLoading || (user && boardLoading)) {
    return (
      <div className={styles.loading}>
        <span>טוען…</span>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <ReactFlowProvider>
      <BoardScreen />
    </ReactFlowProvider>
  );
}
