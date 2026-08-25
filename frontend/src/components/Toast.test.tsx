import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders dismissible polite success feedback', () => {
    const markup = renderToStaticMarkup(
      <Toast message="video-processing.yaml imported" tone="success" onDismiss={() => undefined} />,
    );

    expect(markup).toContain('video-processing.yaml imported');
    expect(markup).toContain('toast--success');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Dismiss message"');
  });

  it('announces errors assertively', () => {
    const markup = renderToStaticMarkup(
      <Toast message="The file could not be saved" tone="error" onDismiss={() => undefined} />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
  });
});
