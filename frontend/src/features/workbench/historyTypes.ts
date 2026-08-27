import type { EventRecord, RunState, ScenarioDraft } from './types';

export type RunContextMode = 'current' | 'history' | 'historical';

export interface HistorySummary {
  id: string;
  scenarioName: string;
  scenarioSource: 'example' | 'local';
  scenarioId: string;
  scenarioPath: string;
  rootTopic: string;
  status: RunState['status'];
  startedAt: string;
  finishedAt: string;
  durationMs: number | null;
  eventCount: number;
  outcome: string;
  failureStage: string | null;
  failureMessage: string | null;
  connectionName: string | null;
}

export interface HistoricalRun {
  summary: HistorySummary;
  scenario: ScenarioDraft;
  run: RunState;
  records: EventRecord[];
}

export type HistoryLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type HistoryOperation = 'idle' | 'deleting' | 'clearing';
