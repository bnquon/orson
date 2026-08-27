import { getRunRecordId } from './flowModel';
import type { EventRecord, ObservedEvent } from './types';

export type ObservedEventOrigin = 'live' | 'historical';

export function formatObservedTimestamp(timestamp: string, now = Date.now()): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return timestamp;

  const date = new Date(parsed);
  const currentDate = new Date(now);
  const dateOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
  };
  if (date.getFullYear() !== currentDate.getFullYear()) {
    dateOptions.year = 'numeric';
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, dateOptions).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(date);

  return `${dateLabel} · ${timeLabel}`;
}

export function toObservedEvent(
  runId: string,
  record: EventRecord,
  isRoot: boolean,
  origin: ObservedEventOrigin,
): ObservedEvent {
  const id = getRunRecordId(runId, record);
  return {
    id,
    name: isRoot ? 'Root event published' : record.topic,
    topic: record.topic,
    kind: isRoot ? 'root' : 'downstream',
    timestamp: record.timestamp || 'Timestamp unavailable',
    elapsed: '',
    partition: record.partition,
    offset: record.offset,
    metadata: `Kafka · ${record.value.length} B · ${origin === 'historical' ? 'historical' : 'observed live'}`,
    headers: record.headers.map((header) => ({ name: header.key, value: header.value })),
    payload: record.value,
  };
}
