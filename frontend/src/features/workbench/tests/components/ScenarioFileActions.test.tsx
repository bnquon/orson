import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioFileActions } from '../../components/ScenarioFileActions';

const commonProps = {
  sourceFilename: 'order.yaml',
  dirty: true,
  saveDisabled: false,
  saveAsDisabled: false,
  saveDisabledReason: '',
  saveAsDisabledReason: '',
  operation: 'idle' as const,
  onSave: () => undefined,
  onSaveAs: () => undefined,
};

describe('ScenarioFileActions', () => {
  it('offers only Save as for a read-only example', () => {
    const markup = renderToStaticMarkup(<ScenarioFileActions {...commonProps} source="example" />);

    expect(markup).toContain('Save as');
    expect(markup).toContain('scenario-file-actions--example');
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('title="Save order.yaml"');
  });

  it('offers Save and Save as for an imported local file', () => {
    const markup = renderToStaticMarkup(<ScenarioFileActions {...commonProps} source="local" />);

    expect(markup).toContain('title="Save order.yaml"');
    expect(markup).toContain('Save as');
  });

  it('disables file actions for invalid drafts or active runs', () => {
    const markup = renderToStaticMarkup(
      <ScenarioFileActions
        {...commonProps}
        source="local"
        saveDisabled
        saveAsDisabled
        saveDisabledReason="Fix scenario issues before saving"
        saveAsDisabledReason="Saving is disabled while a run is active"
      />,
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('Fix scenario issues before saving');
    expect(markup).toContain('Saving is disabled while a run is active');
    expect(markup.match(/tabindex="0"/g)).toHaveLength(2);
    expect(markup.match(/aria-describedby=/g)).toHaveLength(2);
  });

  it('shows the existing loading dots during a save', () => {
    const markup = renderToStaticMarkup(
      <ScenarioFileActions {...commonProps} source="local" operation="saving" />,
    );

    expect(markup).toContain('Saving');
    expect(markup).toContain('loading-dots');
  });

  it('keeps both local file actions mounted and disabled during an import', () => {
    const markup = renderToStaticMarkup(
      <ScenarioFileActions
        {...commonProps}
        source="local"
        operation="importing"
        saveDisabled
        saveAsDisabled
      />,
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('Save');
    expect(markup).toContain('Save as');
    expect(markup).not.toContain('loading-dots');
  });
});
