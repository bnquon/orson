import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FlowEdge, FlowNode, FlowViewModel } from '../flowModel';
import type { TopologyTopicDialogMode } from './TopologyTopicDialog';

export interface FlowEditingOptions {
  model: FlowViewModel;
  editingDisabled?: boolean;
  editingDisabledReason?: string;
  onAddRootTopic?: (name: string) => string | null;
  onAddWatchedTopic?: (name: string) => string | null;
  onRenameTopic?: (node: FlowNode, name: string) => string | null;
  onRemoveTopic?: (node: FlowNode) => string | null;
  onCreateEdge?: (source: FlowNode, target: FlowNode) => string | null;
  onRemoveEdge?: (edge: FlowEdge) => string | null;
}

interface TopicDialogState {
  mode: TopologyTopicDialogMode;
  node: FlowNode | null;
}

interface EdgeDragState {
  pointerId: number;
  source: FlowNode;
  x: number;
  y: number;
  targetDraftId: string | null;
}

function nodeAtPoint(model: FlowViewModel, x: number, y: number): FlowNode | null {
  return (
    model.nodes.find(
      (node) =>
        node.role === 'watched' &&
        x >= node.layout.left &&
        x <= node.layout.left + node.layout.width &&
        y >= node.layout.top &&
        y <= node.layout.top + node.layout.height,
    ) ?? null
  );
}

export function useFlowEditing({
  model,
  editingDisabled = false,
  editingDisabledReason = '',
  onAddRootTopic,
  onAddWatchedTopic,
  onRenameTopic,
  onCreateEdge,
  onRemoveEdge,
}: FlowEditingOptions) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const openMenuRef = useRef<HTMLDivElement>(null);
  const openMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const [dialog, setDialog] = useState<TopicDialogState | null>(null);
  const [menuDraftId, setMenuDraftId] = useState<string | null>(null);
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string } | null>(null);
  const [edgeDrag, setEdgeDrag] = useState<EdgeDragState | null>(null);
  const editingAvailable = onAddRootTopic !== undefined;
  const rootNode = model.nodes.find((node) => node.role === 'root') ?? null;
  const selectedEdge = model.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const watchedTargets = model.nodes.filter((node) => node.role === 'watched');

  useEffect(() => {
    if (!editingDisabled) return;
    const frame = window.requestAnimationFrame(() => {
      setDialog(null);
      setMenuDraftId(null);
      setConnectMenuOpen(false);
      setEdgeDrag(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingDisabled]);

  useEffect(() => {
    const draftId = pendingFocusRef.current;
    if (draftId === null || dialog !== null) return;
    const topic = draftId.startsWith('topic:') ? draftId.slice('topic:'.length) : null;
    const resolvedDraftId =
      topic === null ? draftId : model.nodes.find((node) => node.topic === topic)?.draftId;
    const target =
      resolvedDraftId === undefined ? undefined : nodeRefs.current.get(resolvedDraftId);
    if (target === undefined) return;
    pendingFocusRef.current = null;
    window.requestAnimationFrame(() => target.focus());
  }, [dialog, model.nodes]);

  useEffect(() => {
    if (menuDraftId === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuDraftId(null);
      setConnectMenuOpen(false);
      nodeRefs.current.get(menuDraftId)?.focus();
    };
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        openMenuRef.current?.contains(event.target) ||
        openMenuTriggerRef.current?.contains(event.target)
      )
        return;
      setMenuDraftId(null);
      setConnectMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
    };
  }, [menuDraftId]);

  useEffect(() => {
    if (feedback === null) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const reportResult = (error: string | null, focusDraftId?: string) => {
    if (error !== null) {
      setFeedback({ message: error });
      return false;
    }
    setFeedback(null);
    if (focusDraftId !== undefined) pendingFocusRef.current = focusDraftId;
    return true;
  };

  const openDialog = (mode: TopologyTopicDialogMode, node: FlowNode | null = null) => {
    if (editingDisabled) return;
    setMenuDraftId(null);
    setConnectMenuOpen(false);
    setDialog({ mode, node });
  };

  const submitTopic = (name: string): string | null => {
    if (editingDisabled) return editingDisabledReason || 'Topology editing is unavailable.';
    if (dialog === null) return 'The topic editor is no longer available.';
    let error: string | null;
    if (dialog.mode === 'add-root') {
      error = onAddRootTopic ? onAddRootTopic(name) : 'The root topic cannot be edited here.';
      if (error === null) pendingFocusRef.current = 'root';
    } else if (dialog.mode === 'add-watched') {
      error = onAddWatchedTopic ? onAddWatchedTopic(name) : 'Watched topics cannot be edited here.';
      if (error === null) pendingFocusRef.current = `topic:${name.trim()}`;
    } else if (dialog.node !== null) {
      error = onRenameTopic
        ? onRenameTopic(dialog.node, name)
        : 'This topic cannot be renamed here.';
      if (error === null) pendingFocusRef.current = dialog.node.draftId;
    } else {
      error = 'The selected topic is no longer available.';
    }
    if (error === null) setFeedback(null);
    return error;
  };

  const graphPoint = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: ((event.clientX - bounds.left) * model.width) / bounds.width,
      y: ((event.clientY - bounds.top) * model.height) / bounds.height,
    };
  };

  const beginEdgeDrag = (event: ReactPointerEvent<HTMLButtonElement>, source: FlowNode) => {
    if (editingDisabled || onCreateEdge === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setFeedback(null);
    setEdgeDrag({
      pointerId: event.pointerId,
      source,
      x: source.layout.left + source.layout.width,
      y: source.layout.top + source.layout.height / 2,
      targetDraftId: null,
    });
  };

  const moveEdgeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (edgeDrag === null || edgeDrag.pointerId !== event.pointerId) return;
    const point = graphPoint(event);
    if (point === null) return;
    const target = nodeAtPoint(model, point.x, point.y);
    setEdgeDrag({
      ...edgeDrag,
      ...point,
      targetDraftId: target?.draftId ?? null,
    });
  };

  const finishEdgeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (edgeDrag === null || edgeDrag.pointerId !== event.pointerId) return;
    const point = graphPoint(event);
    const target = point === null ? null : nodeAtPoint(model, point.x, point.y);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setEdgeDrag(null);
    if (editingDisabled) {
      setFeedback({ message: editingDisabledReason || 'Topology editing is unavailable.' });
      return;
    }
    if (target === null) return;
    reportResult(
      onCreateEdge ? onCreateEdge(edgeDrag.source, target) : 'Connections cannot be edited here.',
    );
  };

  const cancelEdgeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (edgeDrag?.pointerId !== event.pointerId) return;
    setEdgeDrag(null);
  };

  const removeEdge = (edge: FlowEdge) => {
    if (onRemoveEdge === undefined || editingDisabled) return;
    if (reportResult(onRemoveEdge(edge))) {
      setSelectedEdgeId(null);
      const sourceDraftId = model.nodes.find((node) => node.topic === edge.sourceTopic)?.draftId;
      if (sourceDraftId !== undefined) {
        window.requestAnimationFrame(() => nodeRefs.current.get(sourceDraftId)?.focus());
      }
    }
  };

  return {
    canvasRef,
    nodeRefs,
    openMenuRef,
    openMenuTriggerRef,
    dialog,
    setDialog,
    menuDraftId,
    setMenuDraftId,
    connectMenuOpen,
    setConnectMenuOpen,
    selectedEdgeId,
    setSelectedEdgeId,
    feedback,
    setFeedback,
    edgeDrag,
    editingAvailable,
    rootNode,
    selectedEdge,
    watchedTargets,
    reportResult,
    openDialog,
    submitTopic,
    beginEdgeDrag,
    moveEdgeDrag,
    finishEdgeDrag,
    cancelEdgeDrag,
    removeEdge,
  };
}
