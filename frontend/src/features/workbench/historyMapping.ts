import type {
  RunHistoryDetailModel,
  RunHistoryRecordModel,
  RunHistoryScenarioSnapshotModel,
  RunHistorySummaryModel,
} from '../../api/runHistory';
import type {
  ApiError,
  EventRecord,
  RunState,
  ScenarioDraft,
  ScenarioSource,
  TrackedEvent,
} from './types';
import { getRunRecordId } from './flowModel';
import { initialRunState } from './runReducer';
import type { HistoricalRun, HistorySummary } from './historyTypes';

const runStatuses = new Set<RunState['status']>([
  'idle',
  'starting',
  'in_progress',
  'completed',
  'timed_out',
  'cancelled',
  'failed',
]);

function status(value: string): RunState['status'] {
  return runStatuses.has(value as RunState['status']) ? (value as RunState['status']) : 'failed';
}

function source(value: string): ScenarioSource {
  if (value === 'local' || value === 'unsaved') return value;
  return 'example';
}

function numberOrNull(value: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toHistorySummary(model: RunHistorySummaryModel): HistorySummary {
  return {
    id: model.runId,
    scenarioName: model.scenarioName,
    scenarioSource: source(model.scenarioSource),
    scenarioId: model.scenarioId ?? '',
    scenarioPath: model.scenarioReference,
    rootTopic: model.rootTopic,
    status: status(model.status),
    startedAt: model.startedAt,
    finishedAt: model.finishedAt,
    durationMs: numberOrNull(model.durationMs),
    eventCount: model.eventCount,
    outcome: model.outcome,
    failureStage: model.failureStage ?? null,
    failureMessage: model.failureMessage ?? null,
    connectionName: model.connectionName ?? null,
  };
}

function topologyEdges(snapshot: RunHistoryScenarioSnapshotModel) {
  return snapshot.topology.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
  }));
}

function toHistoricalScenario(snapshot: RunHistoryScenarioSnapshotModel): ScenarioDraft {
  const watchedTopics = snapshot.watchedTopics.map((topic, index) => ({
    id: `topic-${index}`,
    name: topic,
  }));
  const topology = topologyEdges(snapshot);
  return {
    name: snapshot.displayName,
    rootTopic: snapshot.rootTopic,
    watchedTopics,
    topology,
    configuredTopology: (snapshot.configuredTopology ?? snapshot.topology).map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
    })),
    messageKey: snapshot.messageKey,
    headers: snapshot.headers.map((header, index) => ({
      id: `header-${index}`,
      name: header.key,
      value: header.value,
      protected: false,
    })),
    correlationHeader: snapshot.correlationHeader ?? '',
    payload: snapshot.payload,
    captureTimeoutSeconds: String(snapshot.captureTimeoutSeconds),
  };
}

function recordModel(source: RunHistoryRecordModel): EventRecord {
  return {
    topic: source.topic,
    key: source.key,
    value: source.value,
    headers: source.headers.map((header) => ({
      key: header.key,
      value: header.value,
    })),
    partition: source.partition,
    offset: source.offset,
    timestamp: source.timestamp,
  };
}

function errorModel(detail: RunHistoryDetailModel): ApiError | null {
  if (detail.summary.failureMessage === undefined && detail.summary.failureStage === undefined) {
    return null;
  }
  return {
    code: detail.summary.failureStage ?? 'run_failed',
    message: detail.summary.failureMessage ?? 'The run failed.',
    retryable: false,
  };
}

function trackedEvents(detail: RunHistoryDetailModel, scenario: ScenarioDraft): TrackedEvent[] {
  if (detail.trackedTopics.length > 0) {
    return detail.trackedTopics.map((event) => ({
      topic: event.topic,
      status: event.status as TrackedEvent['status'],
    }));
  }
  return scenario.watchedTopics.map(({ name }) => ({ topic: name, status: 'unwitnessed' }));
}

export function toHistoricalRun(detail: RunHistoryDetailModel): HistoricalRun {
  const summary = toHistorySummary(detail.summary);
  const scenario = toHistoricalScenario(detail.scenario);
  const indexedRecords = detail.records
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) => (left.item.sequence ?? left.index) - (right.item.sequence ?? right.index),
    );
  const records = indexedRecords.map(({ item }) => recordModel(item));
  const rootIndex = indexedRecords.findIndex(({ item }) => item.isRoot === true);
  const rootRecord =
    (rootIndex >= 0
      ? records[rootIndex]
      : records.find((record) => record.topic === scenario.rootTopic)) ?? null;
  const lastSequence = detail.records.reduce(
    (sequence, item) => Math.max(sequence, item.sequence),
    0,
  );
  const run: RunState = {
    ...initialRunState,
    runId: summary.id,
    status: summary.status,
    rootRecord,
    records,
    trackedEvents: trackedEvents(detail, scenario),
    selectedRecordId: null,
    error: errorModel(detail),
    lastSequence,
  };
  return { summary, scenario, run, records };
}

export function historyRecordId(run: HistoricalRun, record: EventRecord): string {
  return getRunRecordId(run.summary.id, record);
}
