import { describe, expect, it } from 'vitest';
import {
  formatJsonPayload,
  indentJsonSelection,
  insertJsonNewline,
  outdentJsonSelection,
} from '../jsonEditing';

describe('json editing helpers', () => {
  it('indents a selected block by two spaces', () => {
    expect(indentJsonSelection('{\n"name": "Orson"\n}', 2, 17)).toEqual({
      value: '{\n  "name": "Orson"\n}',
      selectionStart: 4,
      selectionEnd: 19,
    });
  });

  it('outdents selected lines by up to two spaces', () => {
    expect(outdentJsonSelection('{\n  "name": "Orson"\n}', 4, 19)).toEqual({
      value: '{\n"name": "Orson"\n}',
      selectionStart: 2,
      selectionEnd: 17,
    });
  });

  it('preserves the current indentation after Enter', () => {
    expect(insertJsonNewline('{\n  "name"', 10, 10)).toEqual({
      value: '{\n  "name"\n  ',
      selectionStart: 13,
      selectionEnd: 13,
    });
  });

  it('formats valid JSON and leaves invalid JSON unchanged', () => {
    expect(formatJsonPayload('{"name":"Orson"}')).toBe('{\n  "name": "Orson"\n}');
    expect(formatJsonPayload('{invalid')).toBeNull();
  });
});
