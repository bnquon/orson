import { describe, expect, it } from 'vitest';
import { formatObservedTimestamp } from '../observedEvent';

describe('formatObservedTimestamp', () => {
  it('formats timestamps with a readable date, local time, and milliseconds', () => {
    const timestamp = '2026-08-27T07:49:39.051Z';
    const result = formatObservedTimestamp(timestamp, Date.parse('2026-08-27T12:00:00Z'));
    const expectedDate = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(timestamp));
    const expectedTime = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    }).format(new Date(timestamp));

    expect(result).toBe(`${expectedDate} · ${expectedTime}`);
  });

  it('includes the year when the event is from a different year', () => {
    const result = formatObservedTimestamp(
      '2025-08-27T07:49:39.051Z',
      Date.parse('2026-08-27T12:00:00Z'),
    );

    expect(result).toContain('2025');
    expect(result).toContain('39.051');
  });

  it('preserves unavailable timestamps', () => {
    expect(formatObservedTimestamp('Timestamp unavailable')).toBe('Timestamp unavailable');
  });
});
