import { useId } from 'react';
import { Modal } from './Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Irreversible action: the focus starts on "cancel" so a stray Enter cannot confirm it. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-page replacement for window.confirm (which is blocking and looks out of place on phones). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'إلغاء',
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const messageId = useId();
  return (
    <Modal onClose={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h1 id={titleId}>{title}</h1>
        <p id={messageId} className="dialog__hint" style={{ whiteSpace: 'pre-line' }}>
          {message}
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--primary" autoFocus={!destructive} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn--ghost" autoFocus={destructive} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
