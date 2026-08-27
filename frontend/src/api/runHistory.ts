import {
  ClearRunHistory,
  DeleteRunHistory,
  GetRunHistory,
  ListRunHistory,
} from '../../wailsjs/go/main/App';
import { call } from './client';
import type { Result } from './result';

export interface RunHistorySummaryModel {
  runId: string;
  scenarioId?: string;
  scenarioSource: string;
  scenarioReference: string;
  scenarioName: string;
  rootTopic: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  eventCount: number;
  failureStage?: string;
  failureMessage?: string;
  connectionName?: string;
  outcome: string;
}

export interface RunHistoryScenarioSnapshotModel {
  version: number;
  id?: string;
  source: string;
  reference: string;
  displayName: string;
  sourceFilename?: string;
  rootTopic: string;
  messageKey: string;
  payload: string;
  headers: Array<{ key: string; value: string }>;
  watchedTopics: string[];
  correlationHeader: string;
  captureTimeoutSeconds: number;
  topology: Array<{ id: string; from: string; to: string }>;
  configuredTopology?: Array<{ id: string; from: string; to: string }>;
}

export interface RunHistoryRecordModel {
  sequence: number;
  kind: string;
  isRoot: boolean;
  topic: string;
  key: string;
  value: string;
  headers: Array<{ key: string; value: string }>;
  partition: number;
  offset: string;
  timestamp: string;
}

export interface RunHistoryDetailModel {
  summary: RunHistorySummaryModel;
  scenario: RunHistoryScenarioSnapshotModel;
  records: RunHistoryRecordModel[];
  trackedTopics: Array<{ topic: string; status: string }>;
}

type EmptyActionData = Record<string, never>;

export function listRunHistory(workspaceId: string): Promise<Result<RunHistorySummaryModel[]>> {
  return call(async () => {
    const response = await ListRunHistory(workspaceId);
    return { ...response, data: response.data?.runs ?? [] };
  });
}

export function getRunHistory(
  id: string,
  workspaceId: string,
): Promise<Result<RunHistoryDetailModel>> {
  return call(async () => {
    const response = await GetRunHistory(id, workspaceId);
    return response;
  });
}

export function deleteRunHistory(
  id: string,
  workspaceId: string,
): Promise<Result<EmptyActionData>> {
  return call(async () => ({
    ...(await DeleteRunHistory(id, workspaceId)),
    data: {},
  }));
}

export function clearRunHistory(workspaceId: string): Promise<Result<EmptyActionData>> {
  return call(async () => ({
    ...(await ClearRunHistory(workspaceId)),
    data: {},
  }));
}
