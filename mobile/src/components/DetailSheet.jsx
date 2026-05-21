import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export function StatRow({ label, value, highlight }) {
  return (
    <div className="rb-detail-sheet__row">
      <span className="rb-detail-sheet__row-label">{label}</span>
      <span className={`rb-detail-sheet__row-value${highlight ? ' rb-detail-sheet__row-value--accent' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default function DetailSheet({ open, title, titleId, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="rb-detail-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="rb-detail-sheet__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="rb-detail-sheet__panel glass-card">
        <div className="rb-detail-sheet__handle" aria-hidden />
        <header className="rb-detail-sheet__header">
          <h2 id={titleId} className="rb-detail-sheet__title font-display">
            {title}
          </h2>
          <button type="button" className="rb-detail-sheet__close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </header>
        <div className="rb-detail-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
