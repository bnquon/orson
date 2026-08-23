import './LoadingIndicators.css';

type PixelGridLoaderSize = 'inline' | 'status' | 'setup';

interface PixelGridLoaderProps {
  size?: PixelGridLoaderSize;
}

const chevronDelays = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

export function PixelGridLoader({ size = 'status' }: PixelGridLoaderProps) {
  return (
    <span className={`pixel-grid-loader pixel-grid-loader--${size}`} aria-hidden="true">
      {chevronDelays.map((delay, index) => (
        <span
          className="pixel-grid-loader__cell"
          key={index}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
