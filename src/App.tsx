import '@xyflow/react/dist/style.css';
import { ReactFlowProvider } from '@xyflow/react';
import { BoardScreen } from './ui/screens/BoardScreen';

export default function App() {
  return (
    <ReactFlowProvider>
      <BoardScreen />
    </ReactFlowProvider>
  );
}
