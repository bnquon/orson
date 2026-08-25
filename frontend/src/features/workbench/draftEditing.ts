import type { ScenarioDraft, ScenarioTopologyEdge } from './types';

export function areScenarioDraftsEqual(left: ScenarioDraft, right: ScenarioDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
