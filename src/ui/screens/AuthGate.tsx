import '@xyflow/react/dist/style.css';
import { ReactFlowProvider } from '@xyflow/react';
import { useAuth } from '../../app/useAuth';
import { useBoardSync } from '../../app/boardSync';
import { BoardScreen } from './BoardScreen';
import { LoginScreen } from './LoginScreen';
import styles from './AuthGate.module.css';

export function AuthGate() {
  const { user, loading } = useAuth();
  useBoardSync(user?.uid ?? null);

  if (loading) {
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
