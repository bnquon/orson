import {
  CheckCircle,
  Xmark,
  EditPencil,
  Link,
  MoreHoriz,
  Plus,
  Trash,
  WarningCircle,
  ZoomIn,
  ZoomOut,
} from 'iconoir-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LoadingDots } from '../../../components/LoadingDots';
import {
  nextRecordIdForNode,
  type FlowEdge,
  type FlowNode,
  type FlowStatus,
  type FlowViewModel,
} from '../flowModel';
import { formatStatusLabel } from '../runStatus';
import { useFlowViewport } from '../useFlowViewport';
import { TopologyTopicDialog, type TopologyTopicDialogMode } from './TopologyTopicDialog';
import '../styles/flow.css';

interface FlowPanelProps {
  model: FlowViewModel;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  ariaLabel?: string;
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

function StatusMark({ status }: { status: FlowStatus }) {
  if (status === 'in_progress') return <LoadingDots size="status" />;
  if (status === 'completed') return <CheckCircle width={16} height={16} />;
  if (status === 'failed') return <WarningCircle width={16} height={16} />;
  return <span className="flow-node__status-mark" aria-hidden="true" />;
}

function NodeContent({ node, showDisconnected }: { node: FlowNode; showDisconnected: boolean }) {
  return (
    <>
      <span className="flow-node__topline">
        <span>{node.role === 'root' ? 'Root event' : 'Watched topic'}</span>
        <span className={`flow-node__status flow-node__status--${node.status}`}>
          <StatusMark status={node.status} />
          <span>{formatStatusLabel(node.status)}</span>
        </span>
      </span>
      <strong>{node.topic}</strong>
      <span
        className={`flow-node__record-state ${showDisconnected && node.disconnected ? 'flow-node__record-state--disconnected' : ''}`}
      >
        {showDisconnected && node.disconnected
          ? 'Not connected'
          : node.record === null
            ? 'No matching record observed'
            : 'Record available in inspector'}
      </span>
    </>
  );
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

export function FlowPanel({
  model,
  selectedRecordId,
  onSelectRecord,
  ariaLabel = 'Live event flow',
  editingDisabled = false,
  editingDisabledReason = '',
  onAddRootTopic,
  onAddWatchedTopic,
  onRenameTopic,
  onRemoveTopic,
  onCreateEdge,
  onRemoveEdge,
}: FlowPanelProps) {
  const {
    viewportRef,
    surfaceStyle,
    canvasStyle,
    zoomPercent,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useFlowViewport({ graphWidth: model.width, graphHeight: model.height });
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

  return (
    <section className="flow-panel" aria-label={ariaLabel}>
      <header className="flow-panel__toolbar">
        <div className="flow-panel__heading">
          <strong>Event relationships</strong>
          {selectedEdge !== null ? (
            <span className="flow-panel__edge-summary">
              {selectedEdge.sourceTopic} → {selectedEdge.targetTopic}
              <button
                type="button"
                disabled={editingDisabled}
                title={editingDisabled ? editingDisabledReason : 'Delete selected connection'}
                onClick={() => removeEdge(selectedEdge)}
              >
                <Trash width={14} height={14} aria-hidden="true" /> Delete connection
              </button>
            </span>
          ) : editingAvailable && model.edges.length > 0 ? (
            <span className="flow-panel__connection-hint">Click a connection to remove it</span>
          ) : null}
        </div>
        <div className="flow-panel__controls">
          {editingAvailable ? (
            <button
              className="flow-panel__add-topic"
              id="flow-add-topic"
              type="button"
              disabled={editingDisabled || rootNode === null}
              title={
                editingDisabled
                  ? editingDisabledReason
                  : rootNode === null
                    ? 'Add the root topic first'
                    : 'Add watched topic'
              }
              onClick={() => openDialog('add-watched')}
            >
              <Plus width={15} height={15} aria-hidden="true" /> Add topic
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!canZoomOut}
            onClick={zoomOut}
          >
            <ZoomOut />
          </button>
          <button
            className="flow-panel__zoom-value"
            type="button"
            aria-label="Reset zoom to 100 percent"
            title="Reset zoom to 100%"
            onClick={resetZoom}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={!canZoomIn}
            onClick={zoomIn}
          >
            <ZoomIn />
          </button>
        </div>
      </header>
      <div className="flow-panel__canvas-area">
        <div className="flow-panel__viewport workbench-scroll-region" ref={viewportRef}>
          <div className="flow-map__surface" style={surfaceStyle}>
            <div className="flow-map" ref={canvasRef} style={canvasStyle}>
              {rootNode !== null ? (
                <>
                  {model.routeIssues.length > 0 ? (
                    <div className="flow-map__routing-warning" role="status">
                      <WarningCircle width={16} height={16} aria-hidden="true" />
                      <span>{model.routeIssues[0]?.message}</span>
                    </div>
                  ) : null}
                  <svg
                    className="flow-map__edges"
                    width={model.width}
                    height={model.height}
                    viewBox={`0 0 ${model.width} ${model.height}`}
                    aria-label={editingAvailable ? 'Topology connections' : undefined}
                    aria-hidden={editingAvailable ? undefined : true}
                  >
                    {model.edges.map((edge) => (
                      <g key={edge.id}>
                        <path
                          className={`flow-map__edge flow-map__edge--${edge.status} ${selectedEdgeId === edge.id ? 'flow-map__edge--selected' : ''}`}
                          d={edge.path}
                        />
                        {editingAvailable ? (
                          <path
                            className="flow-map__edge-hit"
                            d={edge.path}
                            role="button"
                            tabIndex={editingDisabled ? -1 : 0}
                            aria-disabled={editingDisabled}
                            aria-label={`Connection from ${edge.sourceTopic} to ${edge.targetTopic}`}
                            aria-pressed={selectedEdgeId === edge.id}
                            onClick={() => {
                              setSelectedEdgeId(edge.id);
                              setFeedback(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedEdgeId(edge.id);
                              } else if (
                                (event.key === 'Delete' || event.key === 'Backspace') &&
                                !editingDisabled
                              ) {
                                event.preventDefault();
                                removeEdge(edge);
                              }
                            }}
                          />
                        ) : null}
                      </g>
                    ))}
                    {edgeDrag !== null ? (
                      <path
                        className="flow-map__edge-preview"
                        d={`M ${edgeDrag.source.layout.left + edgeDrag.source.layout.width} ${edgeDrag.source.layout.top + edgeDrag.source.layout.height / 2} L ${edgeDrag.x} ${edgeDrag.y}`}
                      />
                    ) : null}
                  </svg>
                  {model.nodes.map((node) => {
                    const className = [
                      'flow-node',
                      `flow-node--${node.status}`,
                      editingAvailable ? 'flow-node--editable' : '',
                      node.recordIds.includes(selectedRecordId ?? '') ? 'flow-node--selected' : '',
                      edgeDrag?.targetDraftId === node.draftId ? 'flow-node--drop-target' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const menuOpen = !editingDisabled && menuDraftId === node.draftId;
                    return (
                      <div
                        className={`flow-node-shell ${menuOpen ? 'flow-node-shell--menu-open' : ''}`}
                        style={{ left: node.layout.left, top: node.layout.top }}
                        key={node.draftId}
                      >
                        {node.recordId !== null ? (
                          <button
                            ref={(element) => {
                              if (element === null) nodeRefs.current.delete(node.draftId);
                              else nodeRefs.current.set(node.draftId, element);
                            }}
                            className={className}
                            type="button"
                            aria-label={`${node.topic}, ${formatStatusLabel(node.status)}. Select observed record${node.recordIds.length > 1 ? ' (click to cycle records)' : ''}.`}
                            aria-pressed={node.recordIds.includes(selectedRecordId ?? '')}
                            onClick={() => {
                              const recordId = nextRecordIdForNode(node, selectedRecordId);
                              if (recordId !== null) onSelectRecord(recordId);
                            }}
                          >
                            <NodeContent node={node} showDisconnected={editingAvailable} />
                          </button>
                        ) : (
                          <div
                            ref={(element) => {
                              if (element === null) nodeRefs.current.delete(node.draftId);
                              else nodeRefs.current.set(node.draftId, element);
                            }}
                            className={className}
                            tabIndex={editingAvailable ? -1 : undefined}
                            role="group"
                            aria-label={`${node.topic}, ${formatStatusLabel(node.status)}. No observed record to inspect.`}
                          >
                            <NodeContent node={node} showDisconnected={editingAvailable} />
                          </div>
                        )}
                        {editingAvailable ? (
                          <>
                            {node.role === 'watched' ? (
                              <span className="flow-node__target-handle" aria-hidden="true" />
                            ) : null}
                            <button
                              className="flow-node__source-handle"
                              type="button"
                              aria-label={`Drag a connection from ${node.topic}`}
                              disabled={editingDisabled}
                              title={
                                editingDisabled ? editingDisabledReason : 'Drag to a watched topic'
                              }
                              onPointerDown={(event) => beginEdgeDrag(event, node)}
                              onPointerMove={moveEdgeDrag}
                              onPointerUp={finishEdgeDrag}
                              onPointerCancel={cancelEdgeDrag}
                            />
                            <button
                              ref={menuOpen ? openMenuTriggerRef : null}
                              className="flow-node__menu-trigger"
                              type="button"
                              aria-label={`Edit ${node.topic}`}
                              aria-expanded={menuOpen}
                              disabled={editingDisabled}
                              title={editingDisabled ? editingDisabledReason : 'Topic actions'}
                              onClick={() => {
                                setMenuDraftId(menuOpen ? null : node.draftId);
                                setConnectMenuOpen(false);
                              }}
                            >
                              <MoreHoriz width={16} height={16} aria-hidden="true" />
                            </button>
                            {menuOpen ? (
                              <div
                                ref={openMenuRef}
                                className="flow-node__menu"
                                aria-label={`Actions for ${node.topic}`}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDialog(
                                      node.role === 'root' ? 'rename-root' : 'rename-watched',
                                      node,
                                    )
                                  }
                                >
                                  <EditPencil width={14} height={14} aria-hidden="true" /> Rename
                                </button>
                                <button
                                  type="button"
                                  aria-expanded={connectMenuOpen}
                                  onClick={() => setConnectMenuOpen((open) => !open)}
                                >
                                  <Link width={14} height={14} aria-hidden="true" /> Connect to…
                                </button>
                                {connectMenuOpen ? (
                                  <div className="flow-node__connect-targets">
                                    {watchedTargets.length === 0 ? (
                                      <span>Add a watched topic first.</span>
                                    ) : (
                                      watchedTargets.map((target) => (
                                        <button
                                          type="button"
                                          key={target.draftId}
                                          onClick={() => {
                                            if (editingDisabled) return;
                                            const error = onCreateEdge
                                              ? onCreateEdge(node, target)
                                              : 'Connections cannot be edited here.';
                                            if (reportResult(error)) {
                                              setMenuDraftId(null);
                                              setConnectMenuOpen(false);
                                            }
                                          }}
                                        >
                                          {target.topic}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                ) : null}
                                {node.role === 'watched' ? (
                                  <button
                                    className="flow-node__delete"
                                    type="button"
                                    onClick={() => {
                                      if (editingDisabled) return;
                                      const error = onRemoveTopic
                                        ? onRemoveTopic(node)
                                        : 'This topic cannot be removed here.';
                                      if (reportResult(error)) {
                                        setMenuDraftId(null);
                                        setConnectMenuOpen(false);
                                        window.requestAnimationFrame(() =>
                                          document.getElementById('flow-add-topic')?.focus(),
                                        );
                                      }
                                    }}
                                  >
                                    <Trash width={14} height={14} aria-hidden="true" /> Delete topic
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </>
              ) : null}
            </div>
          </div>
        </div>
        {rootNode === null ? (
          <div className="flow-map__empty" tabIndex={-1}>
            <strong>No root topic yet</strong>
            <span>Add the published starting topic to begin building this scenario.</span>
            {editingAvailable ? (
              <button
                type="button"
                disabled={editingDisabled}
                title={editingDisabled ? editingDisabledReason : 'Add root topic'}
                onClick={() => openDialog('add-root')}
              >
                <Plus width={16} height={16} aria-hidden="true" /> Add root topic
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {feedback ? (
        <div className="flow-panel__feedback" role="alert">
          <WarningCircle width={15} height={15} aria-hidden="true" />
          <span>{feedback.message}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setFeedback(null)}>
            <Xmark width={15} height={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {dialog !== null && !editingDisabled ? (
        <TopologyTopicDialog
          mode={dialog.mode}
          initialValue={dialog.node?.topic}
          onClose={() => setDialog(null)}
          onSubmit={submitTopic}
        />
      ) : null}
    </section>
  );
}
