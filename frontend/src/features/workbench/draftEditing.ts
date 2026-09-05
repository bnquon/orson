import type { ScenarioDraft, ScenarioTopologyEdge } from './types';
import { hasActiveTopologyCycle } from './topologyValidation';

type DraftMutationErrorCode =
  | 'topic_name_required'
  | 'topic_name_duplicate'
  | 'topic_id_required'
  | 'topic_id_duplicate'
  | 'watched_topic_not_found'
  | 'topology_source_invalid'
  | 'topology_target_invalid'
  | 'topology_self_edge'
  | 'topology_edge_duplicate'
  | 'topology_edge_id_duplicate'
  | 'topology_edge_not_found'
  | 'topology_cycle';

interface DraftMutationError {
  code: DraftMutationErrorCode;
  message: string;
}

export type DraftMutationResult =
  { ok: true; draft: ScenarioDraft } | { ok: false; error: DraftMutationError };

export interface WatchedTopicInput {
  id: string;
  name: string;
}

export interface TopologyEdgeInput {
  id?: string;
  from: string;
  to: string;
}

export type TopologyEdgeEndpoints = Pick<ScenarioTopologyEdge, 'from' | 'to'>;

function mutationError(code: DraftMutationErrorCode, message: string): DraftMutationResult {
  return { ok: false, error: { code, message } };
}

function topicNames(draft: ScenarioDraft): Set<string> {
  return new Set(
    [draft.rootTopic, ...draft.watchedTopics.map((topic) => topic.name)]
      .map((topic) => topic.trim())
      .filter(Boolean),
  );
}

function watchedTopicNames(draft: ScenarioDraft): Set<string> {
  return new Set(draft.watchedTopics.map((topic) => topic.name.trim()).filter(Boolean));
}

function hasTopicName(draft: ScenarioDraft, name: string, exceptWatchedId?: string): boolean {
  if (draft.rootTopic.trim() === name) return true;
  return draft.watchedTopics.some(
    (topic) => topic.id !== exceptWatchedId && topic.name.trim() === name,
  );
}

function edgeMatches(edge: ScenarioTopologyEdge, endpoints: TopologyEdgeEndpoints): boolean {
  return edge.from.trim() === endpoints.from && edge.to.trim() === endpoints.to;
}

function hasEdge(draft: ScenarioDraft, endpoints: TopologyEdgeEndpoints): boolean {
  return [...draft.topology, ...draft.configuredTopology].some((edge) =>
    edgeMatches(edge, endpoints),
  );
}

function hasEdgeId(draft: ScenarioDraft, id: string): boolean {
  return [...draft.topology, ...draft.configuredTopology].some((edge) => edge.id === id);
}

export function areScenarioDraftsEqual(left: ScenarioDraft, right: ScenarioDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function setRootTopic(
  draft: ScenarioDraft,
  name: string,
  previousName = draft.rootTopic,
): DraftMutationResult {
  const nextName = name.trim();
  if (nextName === '') {
    return mutationError('topic_name_required', 'Enter a root topic name.');
  }
  if (draft.watchedTopics.some((topic) => topic.name.trim() === nextName)) {
    return mutationError('topic_name_duplicate', `A topic named “${nextName}” already exists.`);
  }

  const previous = previousName.trim();
  if (previous === nextName && draft.rootTopic === nextName) return { ok: true, draft };

  return {
    ok: true,
    draft: {
      ...draft,
      rootTopic: nextName,
      topology: renameTopologyTopic(draft.topology, previous, nextName),
      configuredTopology: renameTopologyTopic(draft.configuredTopology, previous, nextName),
    },
  };
}

export function addWatchedTopic(
  draft: ScenarioDraft,
  topic: WatchedTopicInput,
): DraftMutationResult {
  const id = topic.id.trim();
  const name = topic.name.trim();
  if (id === '') {
    return mutationError('topic_id_required', 'The watched topic needs an ID.');
  }
  if (draft.watchedTopics.some((existing) => existing.id === id)) {
    return mutationError('topic_id_duplicate', 'That watched topic already exists.');
  }
  if (name === '') {
    return mutationError('topic_name_required', 'Enter a watched topic name.');
  }
  if (hasTopicName(draft, name)) {
    return mutationError('topic_name_duplicate', `A topic named “${name}” already exists.`);
  }

  return {
    ok: true,
    draft: {
      ...draft,
      watchedTopics: [...draft.watchedTopics, { id, name }],
    },
  };
}

export function renameWatchedTopic(
  draft: ScenarioDraft,
  topicId: string,
  name: string,
  previousName?: string,
): DraftMutationResult {
  const topic = draft.watchedTopics.find((candidate) => candidate.id === topicId);
  if (topic === undefined) {
    return mutationError('watched_topic_not_found', 'That watched topic no longer exists.');
  }

  const nextName = name.trim();
  if (nextName === '') {
    return mutationError('topic_name_required', 'Enter a watched topic name.');
  }
  if (hasTopicName(draft, nextName, topicId)) {
    return mutationError('topic_name_duplicate', `A topic named “${nextName}” already exists.`);
  }

  const previous = (previousName ?? topic.name).trim();
  if (previous === nextName && topic.name === nextName) return { ok: true, draft };

  return {
    ok: true,
    draft: {
      ...draft,
      watchedTopics: draft.watchedTopics.map((candidate) =>
        candidate.id === topicId ? { ...candidate, name: nextName } : candidate,
      ),
      topology: renameTopologyTopic(draft.topology, previous, nextName),
      configuredTopology: renameTopologyTopic(draft.configuredTopology, previous, nextName),
    },
  };
}

export function removeWatchedTopic(draft: ScenarioDraft, topicId: string): DraftMutationResult {
  const topic = draft.watchedTopics.find((candidate) => candidate.id === topicId);
  if (topic === undefined) {
    return mutationError('watched_topic_not_found', 'That watched topic no longer exists.');
  }

  return {
    ok: true,
    draft: {
      ...draft,
      watchedTopics: draft.watchedTopics.filter((candidate) => candidate.id !== topicId),
      topology: removeTopologyTopic(draft.topology, topic.name),
      configuredTopology: removeTopologyTopic(draft.configuredTopology, topic.name),
    },
  };
}

export function addTopologyEdge(
  draft: ScenarioDraft,
  input: TopologyEdgeInput,
): DraftMutationResult {
  const from = input.from.trim();
  const to = input.to.trim();
  const names = topicNames(draft);
  const watchedNames = watchedTopicNames(draft);

  if (from === '' || !names.has(from)) {
    return mutationError('topology_source_invalid', 'Choose an existing topic as the source.');
  }
  if (to === '' || !watchedNames.has(to)) {
    return mutationError('topology_target_invalid', 'Choose a watched topic as the target.');
  }
  if (from === to) {
    return mutationError('topology_self_edge', 'A topic cannot connect to itself.');
  }
  if (hasEdge(draft, { from, to })) {
    return mutationError('topology_edge_duplicate', 'That topology connection already exists.');
  }

  const id = input.id?.trim() || `edge:${from}->${to}`;
  if (hasEdgeId(draft, id)) {
    return mutationError(
      'topology_edge_id_duplicate',
      'That topology connection ID already exists.',
    );
  }

  const edge = { id, from, to };
  const nextDraft = {
    ...draft,
    topology: [...draft.topology, edge],
    configuredTopology: [...draft.configuredTopology, edge],
  };
  if (hasActiveTopologyCycle(nextDraft)) {
    return mutationError('topology_cycle', 'That connection would create a topology cycle.');
  }

  return { ok: true, draft: nextDraft };
}

export function removeTopologyEdge(
  draft: ScenarioDraft,
  input: TopologyEdgeEndpoints,
): DraftMutationResult {
  const endpoints = { from: input.from.trim(), to: input.to.trim() };
  const topology = draft.topology.filter((edge) => !edgeMatches(edge, endpoints));
  const configuredTopology = draft.configuredTopology.filter(
    (edge) => !edgeMatches(edge, endpoints),
  );

  if (
    topology.length === draft.topology.length &&
    configuredTopology.length === draft.configuredTopology.length
  ) {
    return mutationError('topology_edge_not_found', 'That topology connection no longer exists.');
  }

  return {
    ok: true,
    draft: { ...draft, topology, configuredTopology },
  };
}

export function renameTopologyTopic(
  topology: ScenarioTopologyEdge[],
  previousName: string,
  nextName: string,
): ScenarioTopologyEdge[] {
  const previous = previousName.trim();
  const next = nextName.trim();

  if (previous === '' || next === '' || previous === next) return topology;

  return topology.map((edge) => ({
    ...edge,
    from: edge.from.trim() === previous ? next : edge.from,
    to: edge.to.trim() === previous ? next : edge.to,
  }));
}

export function removeTopologyTopic(
  topology: ScenarioTopologyEdge[],
  topicName: string,
): ScenarioTopologyEdge[] {
  const topic = topicName.trim();
  if (topic === '') return topology;

  return topology.filter((edge) => edge.from.trim() !== topic && edge.to.trim() !== topic);
}
