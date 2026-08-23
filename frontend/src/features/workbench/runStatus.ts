import type { ApiError, RunStatus } from './types';

export const terminalRunStatuses: ReadonlySet<RunStatus> = new Set([
  'completed',
  'timed_out',
  'cancelled',
  'failed',
]);

export type RunFailureStage = 'publish' | 'capture' | 'processing' | 'unknown' | null;

export function isActiveRunStatus(status: RunStatus): boolean {
  return status === 'starting' || status === 'in_progress';
}

export function formatStatusLabel(status: string): string {
  return status.replace('_', ' ');
}

export function runFailureStage(error: ApiError | null | undefined): RunFailureStage {
  if (error === null || error === undefined) return null;
  if (error.code === 'publish_failed') return 'publish';
  if (error.code === 'capture_failed') return 'capture';
  if (error.code === 'processing_failed') return 'processing';
  return 'unknown';
}
