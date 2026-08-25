import { useId, type ReactNode } from 'react';
import './Tooltip.css';

interface TooltipProps {
  label: string;
  content: string;
  children: ReactNode;
}

export function Tooltip({ label, content, children }: TooltipProps) {
  const tooltipId = useId();

  return (
    <span className="tooltip">
      <span
        className="tooltip__trigger"
        role="img"
        tabIndex={0}
        aria-label={label}
        aria-describedby={tooltipId}
      >
        {children}
      </span>
      <span className="tooltip__content" id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}
