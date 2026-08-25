import { CheckCircle, InfoCircle, WarningCircle, Xmark } from 'iconoir-react';
import './Toast.css';

type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
}

const toneIcons = {
  success: CheckCircle,
  info: InfoCircle,
  warning: WarningCircle,
  error: WarningCircle,
};

export function Toast({ message, tone = 'info', onDismiss }: ToastProps) {
  const ToneIcon = toneIcons[tone];
  const urgent = tone === 'error';

  return (
    <div
      className={`toast toast--${tone}`}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
    >
      <ToneIcon className="toast__icon" width={16} height={16} />
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        <Xmark width={16} height={16} />
      </button>
    </div>
  );
}
