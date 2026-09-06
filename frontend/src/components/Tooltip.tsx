import { useId, type ReactNode } from 'react';
import './Tooltip.css';

interface TooltipProps {
  label: string;
  content: string;
  children: ReactNode;
  interactive?: boolean;
  multiline?: boolean;
  onClick?: () => void;
  placement?: 'top' | 'bottom' | 'left';
}

export function Tooltip({
  label,
  content,
  children,
  interactive = false,
  multiline = false,
  onClick,
  placement = 'top',
}: TooltipProps) {
  const tooltipId = useId();
  const trigger = interactive ? (
    <button
      className="tooltip__trigger"
      type="button"
      aria-label={label}
      aria-describedby={tooltipId}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <span
      className="tooltip__trigger"
      role="img"
      tabIndex={0}
      aria-label={label}
      aria-describedby={tooltipId}
    >
      {children}
    </span>
  );

  return (
    <span className="tooltip">
      {trigger}
      <span
        className={`tooltip__content${multiline ? ' tooltip__content--multiline' : ''} tooltip__content--${placement}`}
        id={tooltipId}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
