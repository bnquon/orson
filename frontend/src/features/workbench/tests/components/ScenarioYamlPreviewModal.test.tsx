// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ScenarioYamlPreviewModal,
  type ScenarioYamlPreviewState,
} from '../../components/ScenarioYamlPreviewModal';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function renderPreview(preview: ScenarioYamlPreviewState) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<ScenarioYamlPreviewModal open preview={preview} onClose={() => {}} />));
  return document.body.querySelector('[role="dialog"]');
}

describe('ScenarioYamlPreviewModal', () => {
  it('shows warnings above the canonical read-only YAML', () => {
    const dialog = renderPreview({
      status: 'ready',
      yaml: 'name: order-flow\n',
      warnings: [
        {
          code: 'missing_topology_edge',
          path: 'topology',
          message: 'A watched topic is not connected.',
          sourceFilename: 'scenario.yaml',
          line: 0,
          column: 0,
        },
      ],
    });

    expect(dialog?.textContent).toContain('Current draft has 1 warning');
    expect(dialog?.textContent).toContain('A watched topic is not connected.');
    expect(dialog?.querySelector('[aria-label="Canonical scenario YAML"]')?.textContent).toBe(
      'name: order-flow\n',
    );
    expect(dialog?.textContent).toContain('Copy YAML');
  });

  it('copies the canonical YAML and reports success', async () => {
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      const dialog = renderPreview({
        status: 'ready',
        yaml: 'name: order-flow\n',
        warnings: [],
      });
      const copyButton = dialog?.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy scenario YAML"]',
      );

      await act(async () => {
        copyButton?.click();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith('name: order-flow\n');
      expect(copyButton?.textContent).toContain('Copied');
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it('shows validation diagnostics instead of a YAML block', () => {
    const dialog = renderPreview({
      status: 'failed',
      error: {
        code: 'scenario_invalid',
        message: 'The current draft is invalid.',
        retryable: false,
      },
      diagnostics: [
        {
          code: 'publish_topic_required',
          path: 'publish.topic',
          message: 'Publish topic is required.',
          details: 'publish.topic must not be empty',
          sourceFilename: 'scenario.yaml',
          line: 8,
          column: 4,
        },
      ],
    });

    expect(dialog?.textContent).toContain('YAML preview is unavailable');
    expect(dialog?.textContent).toContain('Publish topic is required.');
    expect(dialog?.textContent).toContain('scenario.yaml:8:4');
    expect(dialog?.textContent).toContain('publish.topic');
    expect(dialog?.textContent).toContain('publish.topic must not be empty');
    expect(dialog?.querySelector('[aria-label="Canonical scenario YAML"]')).toBeNull();
    expect(dialog?.querySelector('[aria-label="Copy scenario YAML"]')).toBeNull();
  });
});
