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
import { LoadingDots } from '../../../components/LoadingDots';
import { nextRecordIdForNode, type FlowNode, type FlowStatus } from '../flowModel';
import { formatStatusLabel } from '../runStatus';
import { useFlowViewport } from '../useFlowViewport';
import { TopologyTopicDialog } from './TopologyTopicDialog';
import { useFlowEditing, type FlowEditingOptions } from './useFlowEditing';
import '../styles/flow.css';

interface FlowPanelProps extends FlowEditingOptions {
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  ariaLabel?: string;
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
  const {
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
  } = useFlowEditing({
    model,
    editingDisabled,
    editingDisabledReason,
    onAddRootTopic,
    onAddWatchedTopic,
    onRenameTopic,
    onCreateEdge,
    onRemoveEdge,
  });

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
