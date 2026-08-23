import './LoadingIndicators.css';

type LoadingDotsSize = 'inline' | 'status' | 'setup';

interface LoadingDotsProps {
  size?: LoadingDotsSize;
}

export function LoadingDots({ size = 'inline' }: LoadingDotsProps) {
  return (
    <span className={`loading-dots loading-dots--${size}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
