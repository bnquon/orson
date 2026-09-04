import type {
  EventRecord,
  RunState,
  ScenarioDraft,
  ScenarioTopologyEdge,
  TrackedEvent,
} from './types';
import { isActiveRunStatus, runFailureStage, terminalRunStatuses } from './runStatus';
import { isAcyclicTopology } from './topologyValidation';

export type FlowStatus = 'configured' | 'in_progress' | 'completed' | 'unwitnessed' | 'failed';

export const flowRootDraftId = 'root';

interface FlowLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FlowNode {
  id: string;
  draftId: string;
  topic: string;
  role: 'root' | 'watched';
  disconnected: boolean;
  status: FlowStatus;
  record: EventRecord | null;
  recordId: string | null;
  recordIds: string[];
  layout: FlowLayout;
}

export interface FlowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceTopic: string;
  targetTopic: string;
  status: FlowStatus;
  path: string;
}

type FlowRouteIssueCode =
  | 'missing_endpoint'
  | 'self_reference'
  | 'root_target'
  | 'unknown_source'
  | 'unknown_target'
  | 'duplicate_edge'
  | 'topology_cycle'
  | 'unsupported_direction';

interface FlowRouteIssue {
  id: string;
  code: FlowRouteIssueCode;
  edgeId: string;
  sourceTopic: string;
  targetTopic: string;
  message: string;
}

export interface FlowViewModel {
  width: number;
  height: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  routeIssues: FlowRouteIssue[];
}

interface FlowLayoutConfig {
  canvasWidth: number;
  firstColumnLeft: number;
  firstRowTop: number;
  columnGap: number;
  rowGap: number;
  nodeWidth: number;
  nodeHeight: number;
}

const layoutConfig: FlowLayoutConfig = {
  canvasWidth: 1200,
  firstColumnLeft: 120,
  firstRowTop: 108,
  columnGap: 360,
  rowGap: 196,
  nodeWidth: 190,
  nodeHeight: 82,
};

export function getRunRecordId(runId: string, record: EventRecord): string {
  return `${runId}:${record.topic}:${record.partition}:${record.offset}`;
}

export function nextRecordIdForNode(
  node: Pick<FlowNode, 'recordId' | 'recordIds'>,
  selectedRecordId: string | null,
): string | null {
  if (node.recordIds.length === 0) return node.recordId;
  if (node.recordIds.length === 1) return node.recordIds[0] ?? node.recordId;

  const selectedIndex = selectedRecordId === null ? -1 : node.recordIds.indexOf(selectedRecordId);
  if (selectedIndex < 0) return node.recordIds[node.recordIds.length - 1] ?? node.recordId;
  return node.recordIds[(selectedIndex + 1) % node.recordIds.length] ?? node.recordId;
}

function sameRecord(left: EventRecord, right: EventRecord): boolean {
  return (
    left.topic === right.topic && left.partition === right.partition && left.offset === right.offset
  );
}

interface NormalizedWatchedTopic {
  draftId: string;
  topic: string;
}

function normalizedTopics(draft: ScenarioDraft): {
  rootTopic: string;
  watchedTopics: NormalizedWatchedTopic[];
} {
  const rootTopic = draft.rootTopic.trim();
  const watchedTopics: NormalizedWatchedTopic[] = [];
  const seen = new Set<string>();

  for (const configuredTopic of draft.watchedTopics) {
    const topic = configuredTopic.name.trim();
    if (topic === '' || topic === rootTopic || seen.has(topic)) continue;
    seen.add(topic);
    watchedTopics.push({ draftId: configuredTopic.id, topic });
  }

  return { rootTopic, watchedTopics };
}

function normalizedTopologyEdgeId(from: string, to: string): string {
  return `edge:${from}->${to}`;
}

interface NormalizedTopology {
  edges: ScenarioTopologyEdge[];
  connectedTopics: Set<string>;
  edgeDraftIds: Map<string, string>;
  routeIssues: FlowRouteIssue[];
}

function routeIssue(
  index: number,
  code: FlowRouteIssueCode,
  edge: ScenarioTopologyEdge,
  sourceTopic: string,
  targetTopic: string,
  message: string,
): FlowRouteIssue {
  return {
    id: `route-issue:${index}:${code}`,
    code,
    edgeId: edge.id,
    sourceTopic,
    targetTopic,
    message,
  };
}

function normalizedTopology(
  rootTopic: string,
  watchedTopics: string[],
  configuredEdges: ScenarioTopologyEdge[],
): NormalizedTopology {
  const availableTopics = new Set<string>([
    ...(rootTopic === '' ? [] : [rootTopic]),
    ...watchedTopics,
  ]);
  const seenEdges = new Set<string>();
  const connectedTopics = new Set<string>();
  const edgeDraftIds = new Map<string, string>();
  const routeIssues: FlowRouteIssue[] = [];

  const normalizedEdges = configuredEdges.flatMap((configuredEdge, index) => {
    const from = configuredEdge.from.trim();
    const to = configuredEdge.to.trim();
    const edgeKey = `${from}->${to}`;

    if (from === '' || to === '') {
      routeIssues.push(
        routeIssue(
          index,
          'missing_endpoint',
          configuredEdge,
          from,
          to,
          'This route cannot be rendered until both its source and target topics are set.',
        ),
      );
      return [];
    }
    if (from === to) {
      routeIssues.push(
        routeIssue(
          index,
          'self_reference',
          configuredEdge,
          from,
          to,
          `Route ${from} → ${to} cannot be rendered because it references the same topic.`,
        ),
      );
      return [];
    }
    if (!availableTopics.has(from)) {
      routeIssues.push(
        routeIssue(
          index,
          'unknown_source',
          configuredEdge,
          from,
          to,
          `Route ${from} → ${to} cannot be rendered because its source topic is unavailable.`,
        ),
      );
      return [];
    }
    if (!availableTopics.has(to)) {
      routeIssues.push(
        routeIssue(
          index,
          'unknown_target',
          configuredEdge,
          from,
          to,
          `Route ${from} → ${to} cannot be rendered because its target topic is unavailable.`,
        ),
      );
      return [];
    }
    if (seenEdges.has(edgeKey)) {
      routeIssues.push(
        routeIssue(
          index,
          'duplicate_edge',
          configuredEdge,
          from,
          to,
          `Route ${from} → ${to} is a duplicate and was not rendered.`,
        ),
      );
      return [];
    }

    seenEdges.add(edgeKey);
    connectedTopics.add(from);
    connectedTopics.add(to);
    if (to === rootTopic) {
      routeIssues.push(
        routeIssue(
          index,
          'root_target',
          configuredEdge,
          from,
          to,
          `Route ${from} → ${to} cannot be rendered because the root topic cannot be a target.`,
        ),
      );
      return [];
    }
    const id = normalizedTopologyEdgeId(from, to);
    edgeDraftIds.set(id, configuredEdge.id);
    return [
      {
        id,
        from,
        to,
      },
    ];
  });

  if (!isAcyclicTopology(normalizedEdges, availableTopics)) {
    const cycleEdgeIndex = normalizedEdges.findIndex((_, index) => {
      const edgesThroughIndex = normalizedEdges.slice(0, index + 1);
      return !isAcyclicTopology(edgesThroughIndex, availableTopics);
    });
    const cycleEdge = normalizedEdges[cycleEdgeIndex] ?? normalizedEdges[0];
    if (cycleEdge !== undefined) {
      routeIssues.push({
        id: 'route-issue:topology-cycle',
        code: 'topology_cycle',
        edgeId: edgeDraftIds.get(cycleEdge.id) ?? cycleEdge.id,
        sourceTopic: cycleEdge.from,
        targetTopic: cycleEdge.to,
        message: `Route ${cycleEdge.from} → ${cycleEdge.to} cannot be rendered because it creates a topology cycle.`,
      });
    }
    // Keep the nodes visible, but avoid rendering a misleading partial topology.
    return { edges: [], connectedTopics, edgeDraftIds, routeIssues };
  }

  return { edges: normalizedEdges, connectedTopics, edgeDraftIds, routeIssues };
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

function depthsFor(topics: string[], topology: ScenarioTopologyEdge[]): Map<string, number> {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();

  for (const edge of topology) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const depths = new Map<string, number>(topics.map((topic) => [topic, 0]));
  const remainingIncoming = new Map<string, number>(
    topics.map((topic) => [topic, incoming.get(topic) ?? 0]),
  );
  const pending = topics.filter((topic) => remainingIncoming.get(topic) === 0);

  while (pending.length > 0) {
    const topic = pending.shift();
    if (topic === undefined) continue;

    for (const target of outgoing.get(topic) ?? []) {
      depths.set(target, Math.max(depths.get(target) ?? 0, (depths.get(topic) ?? 0) + 1));
      const nextIncoming = (remainingIncoming.get(target) ?? 0) - 1;
      remainingIncoming.set(target, nextIncoming);
      if (nextIncoming === 0) pending.push(target);
    }
  }

  // Topology normalization removes cycle-closing edges. This fallback keeps any
  // unexpected malformed input renderable without allowing an infinite traversal.
  for (const topic of topics) {
    if ((remainingIncoming.get(topic) ?? 0) > 0) depths.set(topic, 0);
  }

  return depths;
}

function layoutsFor(topics: string[], topology: ScenarioTopologyEdge[]): Map<string, FlowLayout> {
  const depths = depthsFor(topics, topology);
  const topicsByDepth = new Map<number, string[]>();

  for (const topic of topics) {
    const depth = depths.get(topic) ?? 0;
    const columnTopics = topicsByDepth.get(depth) ?? [];
    columnTopics.push(topic);
    topicsByDepth.set(depth, columnTopics);
  }

  const layouts = new Map<string, FlowLayout>();
  for (const [depth, columnTopics] of topicsByDepth) {
    columnTopics.forEach((topic, siblingIndex) => {
      layouts.set(topic, {
        left: layoutConfig.firstColumnLeft + depth * layoutConfig.columnGap,
        top: layoutConfig.firstRowTop + siblingIndex * layoutConfig.rowGap,
        width: layoutConfig.nodeWidth,
        height: layoutConfig.nodeHeight,
      });
    });
  }

  return layouts;
}

function edgePath(
  source: FlowLayout,
  target: FlowLayout,
  nodeLayouts: FlowLayout[],
): string | null {
  const sourceRight = source.left + source.width;
  const sourceY = source.top + source.height / 2;
  const targetLeft = target.left;
  const targetY = target.top + target.height / 2;

  if (target.left <= source.left) return null;

  if (target.left - source.left > layoutConfig.columnGap) {
    const expressLaneTop = Math.max(24, Math.min(...nodeLayouts.map((layout) => layout.top)) - 44);
    return `M ${sourceRight} ${sourceY} L ${sourceRight} ${expressLaneTop} L ${targetLeft} ${expressLaneTop} L ${targetLeft} ${targetY}`;
  }

  if (sourceY === targetY) return `M ${sourceRight} ${sourceY} L ${targetLeft} ${targetY}`;

  const controlOffset = Math.max(44, (targetLeft - sourceRight) / 2);
  return `M ${sourceRight} ${sourceY} C ${sourceRight + controlOffset} ${sourceY}, ${targetLeft - controlOffset} ${targetY}, ${targetLeft} ${targetY}`;
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
  const watchedTopicNames = watchedTopics.map(({ topic }) => topic);
  const topics = rootTopic === '' ? watchedTopicNames : [rootTopic, ...watchedTopicNames];
  const normalized = normalizedTopology(rootTopic, watchedTopicNames, draft.configuredTopology);
  const topology = normalized.edges;
  const layouts = layoutsFor(topics, topology);
  const hasRun = run.runId !== null;
  const actualRootRecord = run.rootRecord;
  const rootRecord = actualRootRecord?.topic === rootTopic ? actualRootRecord : null;

  const rootNode: FlowNode | null = rootTopic
    ? {
        id: `root:${rootTopic}`,
        draftId: flowRootDraftId,
        topic: rootTopic,
        role: 'root',
        disconnected: false,
        status: statusForRoot(run, hasRun, rootRecord),
        record: rootRecord,
        recordId:
          rootRecord !== null && run.runId !== null ? getRunRecordId(run.runId, rootRecord) : null,
        recordIds:
          rootRecord !== null && run.runId !== null ? [getRunRecordId(run.runId, rootRecord)] : [],
        layout: layouts.get(rootTopic) as FlowLayout,
      }
    : null;

  const watchedNodes = watchedTopics.map(({ draftId, topic }): FlowNode => {
    const records = recordsForTopic(run.records, topic, actualRootRecord);
    const record = latestRecordForTopic(run.records, topic, actualRootRecord);
    return {
      id: `watched:${topic}`,
      draftId,
      topic,
      role: 'watched',
      disconnected: !normalized.connectedTopics.has(topic),
      status: statusForWatched(run, hasRun, topic, record),
      record,
      recordId: record !== null && run.runId !== null ? getRunRecordId(run.runId, record) : null,
      recordIds:
        run.runId === null ? [] : records.map((item) => getRunRecordId(run.runId as string, item)),
      layout: layouts.get(topic) as FlowLayout,
    };
  });

  const nodes = rootNode === null ? watchedNodes : [rootNode, ...watchedNodes];
  const nodesByTopic = new Map(nodes.map((node) => [node.topic, node]));
  const nodeLayouts = nodes.map((node) => node.layout);
  const edges: FlowEdge[] = [];
  const routeIssues = [...normalized.routeIssues];

  for (const configuredEdge of topology) {
    const source = nodesByTopic.get(configuredEdge.from);
    const target = nodesByTopic.get(configuredEdge.to);
    if (source === undefined || target === undefined) continue;

    const path = edgePath(source.layout, target.layout, nodeLayouts);
    if (path === null) {
      routeIssues.push({
        id: `route-issue:${configuredEdge.id}:unsupported-direction`,
        code: 'unsupported_direction',
        edgeId: normalized.edgeDraftIds.get(configuredEdge.id) ?? configuredEdge.id,
        sourceTopic: configuredEdge.from,
        targetTopic: configuredEdge.to,
        message: `Route ${configuredEdge.from} → ${configuredEdge.to} cannot be rendered in the forward-only layout.`,
      });
      continue;
    }

    edges.push({
      id: configuredEdge.id,
      sourceId: source.id,
      targetId: target.id,
      sourceTopic: source.topic,
      targetTopic: target.topic,
      status: edgeStatus(source, target),
      path,
    });
  }

  const maxNodeBottom = nodes.reduce(
    (bottom, node) => Math.max(bottom, node.layout.top + node.layout.height),
    0,
  );
  const maxNodeRight = nodes.reduce(
    (right, node) => Math.max(right, node.layout.left + node.layout.width),
    0,
  );

  return {
    width: Math.max(layoutConfig.canvasWidth, maxNodeRight + layoutConfig.firstColumnLeft),
    height: Math.max(410, maxNodeBottom + 72),
    nodes,
    edges,
    routeIssues,
  };
}
