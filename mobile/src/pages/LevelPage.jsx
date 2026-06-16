import { Navigate } from 'react-router-dom';

/** Уровень перенесён в раздел «Сводка». */
export default function LevelPage() {
  return <Navigate to="/summary" replace />;
}
