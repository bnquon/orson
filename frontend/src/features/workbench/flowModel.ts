import type { EventRecord, RunState, ScenarioDraft, TrackedEvent } from './types';
import { isActiveRunStatus, runFailureStage, terminalRunStatuses } from './runStatus';

export type FlowStatus = 'configured' | 'in_progress' | 'completed' | 'unwitnessed' | 'failed';

interface FlowLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FlowNode {
  id: string;
  topic: string;
  role: 'root' | 'watched';
  status: FlowStatus;
  record: EventRecord | null;
  recordId: string | null;
  recordIds: string[];
  layout: FlowLayout;
}

interface FlowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  status: FlowStatus;
  path: string;
}

export interface FlowViewModel {
  width: number;
  height: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  hasRun: boolean;
  hasObservedRecords: boolean;
}

interface FlowLayoutConfig {
  canvasWidth: number;
  root: FlowLayout;
  firstWatched: FlowLayout;
  downstream: { left: number; firstTop: number; rowGap: number };
  nodeWidth: number;
  nodeHeight: number;
}

interface FlowTopologyConfig {
  rootFanOut: 'first-watched';
  downstreamFanOut: 'first-watched';
}

const layoutConfig: FlowLayoutConfig = {
  canvasWidth: 1200,
  root: { left: 120, top: 108, width: 190, height: 82 },
  firstWatched: { left: 480, top: 108, width: 190, height: 82 },
  downstream: { left: 840, firstTop: 72, rowGap: 196 },
  nodeWidth: 190,
  nodeHeight: 82,
};

const topologyConfig: FlowTopologyConfig = {
  rootFanOut: 'first-watched',
  downstreamFanOut: 'first-watched',
};

export function getRunRecordId(runId: string, record: EventRecord): string {
  return `${runId}:${record.topic}:${record.partition}:${record.offset}`;
}

function sameRecord(left: EventRecord, right: EventRecord): boolean {
  return (
    left.topic === right.topic && left.partition === right.partition && left.offset === right.offset
  );
}

function normalizedTopics(draft: ScenarioDraft): { rootTopic: string; watchedTopics: string[] } {
  const rootTopic = draft.rootTopic.trim();
  const watchedTopics: string[] = [];
  const seen = new Set<string>();

  for (const configuredTopic of draft.watchedTopics) {
    const topic = configuredTopic.name.trim();
    if (topic === '' || seen.has(topic)) continue;
    seen.add(topic);
    watchedTopics.push(topic);
  }

  return { rootTopic, watchedTopics };
}

function trackedFor(topic: string, trackedEvents: TrackedEvent[]): TrackedEvent | undefined {
  return trackedEvents.find((tracked) => tracked.topic === topic);
}

function statusForRoot(run: RunState, hasRun: boolean, record: EventRecord | null): FlowStatus {
  if (record !== null) return 'completed';
  if (!hasRun) return 'configured';
  if (isActiveRunStatus(run.status)) return 'in_progress';

  const stage = runFailureStage(run.error);
  if (run.status === 'failed' || stage !== null) return 'failed';
  if (terminalRunStatuses.has(run.status)) return 'unwitnessed';
  return 'configured';
}

function statusForWatched(
  run: RunState,
  hasRun: boolean,
  topic: string,
  record: EventRecord | null,
): FlowStatus {
  if (record !== null) return 'completed';
  if (!hasRun) return 'configured';

  const tracked = trackedFor(topic, run.trackedEvents);
  if (tracked?.status === 'failed') return 'failed';
  if (tracked?.status === 'completed') return 'completed';
  if (isActiveRunStatus(run.status)) return 'in_progress';
  if (run.status === 'failed' && runFailureStage(run.error) !== 'publish') return 'failed';
  if (terminalRunStatuses.has(run.status)) return 'unwitnessed';
  return 'configured';
}

function layoutForWatched(index: number): FlowLayout {
  if (index === 0) return layoutConfig.firstWatched;
  return {
    left: layoutConfig.downstream.left,
    top: layoutConfig.downstream.firstTop + (index - 1) * layoutConfig.downstream.rowGap,
    width: layoutConfig.nodeWidth,
    height: layoutConfig.nodeHeight,
  };
}

function edgePath(source: FlowLayout, target: FlowLayout): string {
  const sourceX = source.left + source.width;
  const sourceY = source.top + source.height / 2;
  const targetX = target.left;
  const targetY = target.top + target.height / 2;

  if (sourceY === targetY) return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  const controlOffset = Math.max(44, (targetX - sourceX) / 2);
  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

function edgeStatus(source: FlowNode, target: FlowNode): FlowStatus {
  if (source.status === 'failed' || target.status === 'failed') return 'failed';
  if (target.status === 'completed') return 'completed';
  if (target.status === 'in_progress') return 'in_progress';
  if (target.status === 'unwitnessed') return 'unwitnessed';
  return 'configured';
}

function latestRecordForTopic(
  records: EventRecord[],
  topic: string,
  rootRecord: EventRecord | null,
): EventRecord | null {
  const matches = recordsForTopic(records, topic, rootRecord);
  return matches[matches.length - 1] ?? null;
}

function recordsForTopic(
  records: EventRecord[],
  topic: string,
  rootRecord: EventRecord | null,
): EventRecord[] {
  return records.filter(
    (record) => record.topic === topic && (rootRecord === null || !sameRecord(record, rootRecord)),
  );
}

export function buildFlowViewModel(draft: ScenarioDraft, run: RunState): FlowViewModel {
  const { rootTopic, watchedTopics } = normalizedTopics(draft);
  const hasRun = run.runId !== null;
  const actualRootRecord = run.rootRecord;
  const rootRecord = actualRootRecord?.topic === rootTopic ? actualRootRecord : null;
  const rootNode: FlowNode | null = rootTopic
    ? {
        id: `root:${rootTopic}`,
        topic: rootTopic,
        role: 'root',
        status: statusForRoot(run, hasRun, rootRecord),
        record: rootRecord,
        recordId:
          rootRecord !== null && run.runId !== null ? getRunRecordId(run.runId, rootRecord) : null,
        recordIds:
          rootRecord !== null && run.runId !== null ? [getRunRecordId(run.runId, rootRecord)] : [],
        layout: layoutConfig.root,
      }
    : null;

  const watchedNodes = watchedTopics.map((topic, index): FlowNode => {
    const records = recordsForTopic(run.records, topic, actualRootRecord);
    const record = latestRecordForTopic(run.records, topic, actualRootRecord);
    return {
      id: `watched:${topic}`,
      topic,
      role: 'watched',
      status: statusForWatched(run, hasRun, topic, record),
      record,
      recordId: record !== null && run.runId !== null ? getRunRecordId(run.runId, record) : null,
      recordIds:
        run.runId === null ? [] : records.map((item) => getRunRecordId(run.runId as string, item)),
      layout: layoutForWatched(index),
    };
  });

  const nodes = rootNode === null ? watchedNodes : [rootNode, ...watchedNodes];
  const edges: FlowEdge[] = [];
  const firstWatched = watchedNodes[0];

  if (
    rootNode !== null &&
    firstWatched !== undefined &&
    topologyConfig.rootFanOut === 'first-watched'
  ) {
    edges.push({
      id: `${rootNode.id}->${firstWatched.id}`,
      sourceId: rootNode.id,
      targetId: firstWatched.id,
      status: edgeStatus(rootNode, firstWatched),
      path: edgePath(rootNode.layout, firstWatched.layout),
    });
  }

  if (firstWatched !== undefined && topologyConfig.downstreamFanOut === 'first-watched') {
    for (const target of watchedNodes.slice(1)) {
      edges.push({
        id: `${firstWatched.id}->${target.id}`,
        sourceId: firstWatched.id,
        targetId: target.id,
        status: edgeStatus(firstWatched, target),
        path: edgePath(firstWatched.layout, target.layout),
      });
    }
  }

  const maxNodeBottom = nodes.reduce(
    (bottom, node) => Math.max(bottom, node.layout.top + node.layout.height),
    0,
  );

  return {
    width: layoutConfig.canvasWidth,
    height: Math.max(410, maxNodeBottom + 72),
    nodes,
    edges,
    hasRun,
    hasObservedRecords: run.records.length > 0,
  };
}
