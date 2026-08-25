import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComposeEditorSection } from './ComposeEditorSection';
import type { ScenarioDraft, TouchedState, ValidationResult } from '../types';

const draft: ScenarioDraft = {
  rootTopic: 'order.created',
  watchedTopics: [],
  topology: [],
  messageKey: '',
  headers: [
    {
      id: 'header-content-type',
      name: 'content-type',
      value: 'application/json',
      protected: false,
    },
  ],
  payload: '{"ok":true}',
  captureTimeoutSeconds: '10',
};

const touched: TouchedState = { fields: {}, watchedTopicIds: [], headerIds: [] };
const validation: ValidationResult = {
  fieldErrors: {},
  watchedTopicErrors: {},
  headerErrors: {},
  issueCount: 0,
  firstInvalidControlId: null,
};

function renderHeaders() {
  return renderToStaticMarkup(
    <ComposeEditorSection
      draft={draft}
      setDraft={() => undefined}
      activeTab="headers"
      onTabChange={() => undefined}
      touched={touched}
      validation={validation}
      jsonError={null}
      jsonValidationPending={false}
      onTouchField={() => undefined}
      onTouchHeader={() => undefined}
    />,
  );
}

describe('ComposeEditorSection headers', () => {
  it('renders managed correlation details above editable custom headers', () => {
    const markup = renderHeaders();

    expect(markup.indexOf('Managed by Orson')).toBeLessThan(markup.indexOf('content-type'));
    expect(markup).toContain('x-correlation-id');
    expect(markup).toContain('Generated automatically per run');
    expect(markup).toContain('Correlation ID managed by Orson');
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain('Orson generates a new correlation ID for each run');
  });

  it('keeps global labels out and preserves the editable custom header count', () => {
    const markup = renderHeaders();

    expect(markup).not.toContain('>Header name<');
    expect(markup).not.toContain('>Value<');
    expect(markup).not.toContain('headers-editor__toolbar');
    expect(markup.indexOf('Custom headers')).toBeLessThan(markup.indexOf('compose-add-header'));
    expect(markup).toContain('compose-editor__count">1</span>');
    expect(markup).toContain('aria-label="Header name"');
    expect(markup).toContain('aria-label="Value for content-type"');
  });

  it('does not make the managed row editable or removable', () => {
    const markup = renderHeaders();
    const managedStart = markup.indexOf('header-row--managed');
    const customStart = markup.indexOf('header-row-wrap');
    const managedMarkup = markup.slice(managedStart, customStart);

    expect(managedMarkup).not.toContain('<input');
    expect(managedMarkup).not.toContain('Remove');
    expect(managedMarkup).toContain('<svg');
  });
});
