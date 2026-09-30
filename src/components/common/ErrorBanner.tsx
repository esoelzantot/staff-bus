import { FiAlertTriangle, FiX } from 'react-icons/fi';

interface Props {
  message: string | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div className="banner banner--error" role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="banner__close" onClick={onDismiss} aria-label="إغلاق الرسالة">
          <FiX />
        </button>
      )}
    </div>
  );
}
