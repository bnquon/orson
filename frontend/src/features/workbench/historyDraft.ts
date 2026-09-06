import type { RunHistoryScenarioSnapshotModel } from '../../api/runHistory';
import type { ScenarioDraft } from './types';

function topologyEdges(
  edges: RunHistoryScenarioSnapshotModel['topology'],
): ScenarioDraft['topology'] {
  return edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
  }));
}

export function toHistoricalScenarioDraft(
  snapshot: RunHistoryScenarioSnapshotModel,
): ScenarioDraft {
  return {
    name: snapshot.displayName,
    rootTopic: snapshot.rootTopic,
    watchedTopics: snapshot.watchedTopics.map((name, index) => ({
      id: `topic-${index}`,
      name,
    })),
    topology: topologyEdges(snapshot.topology),
    configuredTopology: topologyEdges(snapshot.configuredTopology ?? snapshot.topology),
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
