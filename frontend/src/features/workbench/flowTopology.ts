import type { ScenarioDraft, ScenarioTopologyEdge } from './types';
import { isAcyclicTopology } from './topologyValidation';

type FlowRouteIssueCode =
  | 'missing_endpoint'
  | 'self_reference'
  | 'root_target'
  | 'unknown_source'
  | 'unknown_target'
  | 'duplicate_edge'
  | 'topology_cycle'
  | 'unsupported_direction';

export interface FlowRouteIssue {
  id: string;
  code: FlowRouteIssueCode;
  edgeId: string;
  sourceTopic: string;
  targetTopic: string;
  message: string;
}

interface NormalizedWatchedTopic {
  draftId: string;
  topic: string;
}

export function normalizedTopics(draft: ScenarioDraft): {
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

export function normalizedTopology(
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
