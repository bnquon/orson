import type { ScenarioDraft, ScenarioTopologyEdge } from './types';

function activeTopologyEdges(draft: ScenarioDraft): {
  edges: ScenarioTopologyEdge[];
  topics: Set<string>;
} {
  const rootTopic = draft.rootTopic.trim();
  const topics = new Set<string>();
  if (rootTopic !== '') topics.add(rootTopic);
  for (const configuredTopic of draft.watchedTopics) {
    const topic = configuredTopic.name.trim();
    if (topic !== '') topics.add(topic);
  }

  const seenEdges = new Set<string>();
  const edges: ScenarioTopologyEdge[] = [];
  for (const configuredEdge of draft.configuredTopology) {
    const from = configuredEdge.from.trim();
    const to = configuredEdge.to.trim();
    const key = `${from}->${to}`;
    if (
      from === '' ||
      to === '' ||
      from === to ||
      !topics.has(from) ||
      !topics.has(to) ||
      seenEdges.has(key)
    ) {
      continue;
    }
    seenEdges.add(key);
    edges.push({ id: configuredEdge.id, from, to });
  }
  return { edges, topics };
}

export function hasActiveTopologyCycle(draft: ScenarioDraft): boolean {
  const { edges, topics } = activeTopologyEdges(draft);
  return !isAcyclicTopology(edges, topics);
}

export function isAcyclicTopology(
  edges: ScenarioTopologyEdge[],
  topics: ReadonlySet<string>,
): boolean {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>([...topics].map((topic) => [topic, 0]));

  for (const edge of edges) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const pending = [...topics].filter((topic) => incoming.get(topic) === 0);
  let visitedCount = 0;
  while (pending.length > 0) {
    const topic = pending.shift();
    if (topic === undefined) continue;
    visitedCount += 1;
    for (const target of outgoing.get(topic) ?? []) {
      const nextIncoming = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, nextIncoming);
      if (nextIncoming === 0) pending.push(target);
    }
  }

  return visitedCount === topics.size;
}
