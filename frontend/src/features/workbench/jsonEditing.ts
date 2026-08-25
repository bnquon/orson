export interface JsonTextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const JSON_INDENT = '  ';

function lineStartAt(value: string, position: number): number {
  return value.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function selectedLineStarts(value: string, selectionStart: number, selectionEnd: number): number[] {
  const firstLineStart = lineStartAt(value, selectionStart);
  const endLineStart = lineStartAt(value, selectionEnd);
  const lastLineStart =
    selectionEnd > endLineStart || selectionStart === selectionEnd
      ? endLineStart
      : lineStartAt(value, Math.max(0, endLineStart - 1));
  const starts: number[] = [];

  for (let lineStart = firstLineStart; lineStart <= lastLineStart;) {
    starts.push(lineStart);
    const nextNewline = value.indexOf('\n', lineStart);
    if (nextNewline === -1) break;
    lineStart = nextNewline + 1;
  }

  return starts;
}

export function indentJsonSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): JsonTextEdit {
  const lineStarts = selectedLineStarts(value, selectionStart, selectionEnd);
  let nextValue = value;

  for (const lineStart of [...lineStarts].reverse()) {
    nextValue = `${nextValue.slice(0, lineStart)}${JSON_INDENT}${nextValue.slice(lineStart)}`;
  }

  return {
    value: nextValue,
    selectionStart: selectionStart + JSON_INDENT.length,
    selectionEnd: selectionEnd + JSON_INDENT.length * lineStarts.length,
  };
}

export function outdentJsonSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): JsonTextEdit {
  const edits: { lineStart: number; removeLength: number }[] = [];
  for (const lineStart of selectedLineStarts(value, selectionStart, selectionEnd)) {
    const leadingSpaces = value.slice(lineStart, lineStart + JSON_INDENT.length);
    const removeLength = leadingSpaces.match(/^ +/)?.[0].length ?? 0;
    if (removeLength > 0) edits.push({ lineStart, removeLength });
  }
  let nextValue = value;

  for (const { lineStart, removeLength } of [...edits].reverse()) {
    nextValue = `${nextValue.slice(0, lineStart)}${nextValue.slice(lineStart + removeLength)}`;
  }

  const removedBefore = (position: number) =>
    edits.reduce((total, edit) => total + (edit.lineStart < position ? edit.removeLength : 0), 0);

  return {
    value: nextValue,
    selectionStart: selectionStart - removedBefore(selectionStart),
    selectionEnd: selectionEnd - removedBefore(selectionEnd),
  };
}

export function insertJsonNewline(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): JsonTextEdit {
  const lineStart = lineStartAt(value, selectionStart);
  const indentation = value.slice(lineStart, selectionStart).match(/^[ \t]*/)?.[0] ?? '';
  const insertion = `\n${indentation}`;

  return {
    value: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + insertion.length,
    selectionEnd: selectionStart + insertion.length,
  };
}

export function formatJsonPayload(value: string): string | null {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return null;
  }
}
