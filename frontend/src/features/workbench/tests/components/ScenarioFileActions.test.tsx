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
  previewDisabled: false,
  previewDisabledReason: '',
  previewing: false,
  operation: 'idle' as const,
  onSave: () => undefined,
  onSaveAs: () => undefined,
  onPreview: () => undefined,
};

describe('ScenarioFileActions', () => {
  it('offers Save as and View YAML for an example', () => {
    const markup = renderToStaticMarkup(<ScenarioFileActions {...commonProps} source="example" />);

    expect(markup).toContain('Save as');
    expect(markup).toContain('View YAML');
    expect(markup).toContain('scenario-file-actions--example');
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('title="Save order.yaml"');
  });

  it('offers Save and Save as for an imported local file', () => {
    const markup = renderToStaticMarkup(<ScenarioFileActions {...commonProps} source="local" />);

    expect(markup).toContain('title="Save order.yaml"');
    expect(markup).toContain('Save as');
    expect(markup).toContain('View YAML');
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
    expect(markup).toContain('View YAML');
    expect(markup).not.toContain('loading-dots');
  });

  it('keeps preview available when save actions are disabled', () => {
    const markup = renderToStaticMarkup(
      <ScenarioFileActions
        {...commonProps}
        source="local"
        saveDisabled
        saveAsDisabled
        saveDisabledReason="Saving is disabled while a run is active"
        saveAsDisabledReason="Saving is disabled while a run is active"
      />,
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('title="View canonical YAML"');
  });

  it('does not expose preview in read-only historical mode', () => {
    const markup = renderToStaticMarkup(
      <ScenarioFileActions {...commonProps} source="example" readOnly />,
    );

    expect(markup).not.toContain('View YAML');
  });
});
