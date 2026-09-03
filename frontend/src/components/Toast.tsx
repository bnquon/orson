import { useCallback, useEffect, useRef, type FocusEvent } from 'react';
import { CheckCircle, InfoCircle, WarningCircle, Xmark } from 'iconoir-react';
import './Toast.css';

type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface ToastProps {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  onDismiss: () => void;
}

type PauseReason = 'focus' | 'hover';

const defaultDurationMs = 4_000;

const toneIcons = {
  success: CheckCircle,
  info: InfoCircle,
  warning: WarningCircle,
  error: WarningCircle,
};

export function Toast({
  message,
  tone = 'info',
  durationMs = defaultDurationMs,
  onDismiss,
}: ToastProps) {
  const ToneIcon = toneIcons[tone];
  const urgent = tone === 'error';
  const dismissRef = useRef(onDismiss);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingMsRef = useRef(durationMs);
  const startedAtRef = useRef(0);
  const pauseReasonsRef = useRef(new Set<PauseReason>());

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearDismissTimer = useCallback(() => {
    if (timeoutRef.current === null) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const startDismissTimer = useCallback(() => {
    if (durationMs <= 0 || pauseReasonsRef.current.size > 0) return;

    startedAtRef.current = Date.now();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      dismissRef.current();
    }, remainingMsRef.current);
  }, [durationMs]);

  useEffect(() => {
    clearDismissTimer();
    remainingMsRef.current = durationMs;
    startDismissTimer();
    return clearDismissTimer;
  }, [clearDismissTimer, durationMs, message, startDismissTimer, tone]);

  const pauseDismissTimer = (reason: PauseReason) => {
    if (pauseReasonsRef.current.has(reason)) return;
    pauseReasonsRef.current.add(reason);

    if (timeoutRef.current !== null) {
      remainingMsRef.current = Math.max(
        0,
        remainingMsRef.current - (Date.now() - startedAtRef.current),
      );
      clearDismissTimer();
    }
  };

  const resumeDismissTimer = (reason: PauseReason) => {
    pauseReasonsRef.current.delete(reason);
    if (pauseReasonsRef.current.size === 0 && timeoutRef.current === null) startDismissTimer();
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) resumeDismissTimer('focus');
  };

  return (
    <div
      className={`toast toast--${tone}`}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      onMouseEnter={() => pauseDismissTimer('hover')}
      onMouseLeave={() => resumeDismissTimer('hover')}
      onFocus={() => pauseDismissTimer('focus')}
      onBlur={handleBlur}
    >
      <ToneIcon className="toast__icon" width={16} height={16} aria-hidden="true" />
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        <Xmark width={16} height={16} aria-hidden="true" />
      </button>
    </div>
  );
}
