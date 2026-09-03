// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function renderToast(onDismiss: () => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<Toast message="Saved" tone="success" onDismiss={onDismiss} />));
  return host.querySelector<HTMLElement>('.toast');
}

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

  it('dismisses automatically after four seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderToast(onDismiss);

    act(() => {
      vi.advanceTimersByTime(3_999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('pauses the remaining dismissal time while hovered', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const toast = renderToast(onDismiss);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    act(() => {
      toast?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      toast?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
