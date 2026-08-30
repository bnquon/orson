import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('supports an accessible interactive trigger and multiline content', () => {
    const markup = renderToStaticMarkup(
      <Tooltip
        label="Why Save as is unavailable"
        content={'Missing:\n• scenario name'}
        interactive
        multiline
      >
        <span aria-hidden="true">i</span>
      </Tooltip>,
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('aria-label="Why Save as is unavailable"');
    expect(markup).toContain('tooltip__content--multiline');
    expect(markup).toContain('Missing:\n• scenario name');
  });
});
