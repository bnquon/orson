import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  addTopologyEdge,
  addWatchedTopic,
  removeTopologyEdge,
  removeWatchedTopic,
  renameWatchedTopic,
  setRootTopic,
  type DraftMutationResult,
} from './draftEditing';
import type { FlowEdge, FlowNode } from './flowModel';
import type { ScenarioDraft } from './types';

function applyDraftMutation(
  result: DraftMutationResult,
  setDraft: Dispatch<SetStateAction<ScenarioDraft>>,
): string | null {
  if (!result.ok) return result.error.message;
  setDraft(result.draft);
  return null;
}

export function useTopologyEditing(
  draft: ScenarioDraft,
  setDraft: Dispatch<SetStateAction<ScenarioDraft>>,
) {
  const addRoot = useCallback(
    (name: string) => applyDraftMutation(setRootTopic(draft, name), setDraft),
    [draft, setDraft],
  );

  const addWatched = useCallback(
    (name: string) =>
      applyDraftMutation(addWatchedTopic(draft, { id: crypto.randomUUID(), name }), setDraft),
    [draft, setDraft],
  );

  const renameTopic = useCallback(
    (node: FlowNode, name: string) =>
      applyDraftMutation(
        node.role === 'root'
          ? setRootTopic(draft, name, node.topic)
          : renameWatchedTopic(draft, node.draftId, name, node.topic),
        setDraft,
      ),
    [draft, setDraft],
  );

  const removeTopic = useCallback(
    (node: FlowNode) => {
      if (node.role === 'root') return 'The root topic cannot be deleted.';
      return applyDraftMutation(removeWatchedTopic(draft, node.draftId), setDraft);
    },
    [draft, setDraft],
  );

  const createEdge = useCallback(
    (source: FlowNode, target: FlowNode) =>
      applyDraftMutation(
        addTopologyEdge(draft, { from: source.topic, to: target.topic }),
        setDraft,
      ),
    [draft, setDraft],
  );

  const removeEdge = useCallback(
    (edge: FlowEdge) =>
      applyDraftMutation(
        removeTopologyEdge(draft, { from: edge.sourceTopic, to: edge.targetTopic }),
        setDraft,
      ),
    [draft, setDraft],
  );

  return { addRoot, addWatched, renameTopic, removeTopic, createEdge, removeEdge };
}
