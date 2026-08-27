import { describe, expect, it } from 'vitest';
import { formatRunDuration } from '../historyFormatting';

describe('formatRunDuration', () => {
  it('uses milliseconds for short durations', () => {
    expect(formatRunDuration(874)).toBe('874 ms');
  });

  it('uses seconds with precision appropriate to the duration', () => {
    expect(formatRunDuration(2_000)).toBe('2.0 s');
    expect(formatRunDuration(10_000)).toBe('10 s');
  });

  it('handles missing and negative durations', () => {
    expect(formatRunDuration(null)).toBe('—');
    expect(formatRunDuration(-1)).toBe('0 ms');
  });
});
