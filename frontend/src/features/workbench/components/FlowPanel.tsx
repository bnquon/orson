import { CheckCircle, ExpandLines, WarningCircle, ZoomIn, ZoomOut } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { FlowNode, FlowStatus, FlowViewModel } from '../flowModel';
import { formatStatusLabel } from '../runStatus';
import { useFlowViewport } from '../useFlowViewport';
import '../styles/flow.css';

interface FlowPanelProps {
  model: FlowViewModel;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
}

function StatusMark({ status }: { status: FlowStatus }) {
  if (status === 'in_progress') return <LoadingDots size="status" />;
  if (status === 'completed') return <CheckCircle width={16} height={16} />;
  if (status === 'failed') return <WarningCircle width={16} height={16} />;
  return <span className="flow-node__status-mark" aria-hidden="true" />;
}

function NodeContent({ node }: { node: FlowNode }) {
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
      <span className="flow-node__record-state">
        {node.record === null ? 'No matching record observed' : 'Record available in inspector'}
      </span>
    </>
  );
}

export function FlowPanel({ model, selectedRecordId, onSelectRecord }: FlowPanelProps) {
  const {
    canvasRef,
    viewportRef,
    surfaceStyle,
    canvasStyle,
    zoomPercent,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    zoomToFit,
    resetZoom,
  } = useFlowViewport({ graphWidth: model.width, graphHeight: model.height });

  return (
    <section className="flow-panel" aria-label="Live event flow">
      <header className="flow-panel__toolbar">
        <div>
          <strong>Event relationships</strong>
        </div>
        <div className="flow-panel__controls">
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
          <button type="button" aria-label="Zoom to fit" title="Zoom to fit" onClick={zoomToFit}>
            <ExpandLines />
          </button>
        </div>
      </header>
      <div className="flow-panel__viewport workbench-scroll-region" ref={viewportRef}>
        <div className="flow-map__surface" style={surfaceStyle}>
          <div
            className="flow-map"
            ref={canvasRef}
            style={canvasStyle}
            aria-describedby={model.hasObservedRecords ? undefined : 'flow-map-status'}
          >
            <svg
              className="flow-map__edges"
              width={model.width}
              height={model.height}
              viewBox={`0 0 ${model.width} ${model.height}`}
              aria-hidden="true"
            >
              {model.edges.map((edge) => (
                <path
                  className={`flow-map__edge flow-map__edge--${edge.status}`}
                  d={edge.path}
                  key={edge.id}
                />
              ))}
            </svg>
            {model.nodes.map((node) => {
              const className = [
                'flow-node',
                `flow-node--${node.status}`,
                node.recordIds.includes(selectedRecordId ?? '') ? 'flow-node--selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const style = { left: node.layout.left, top: node.layout.top };

              return node.recordId !== null ? (
                <button
                  className={className}
                  style={style}
                  type="button"
                  key={node.id}
                  aria-label={`${node.topic}, ${formatStatusLabel(node.status)}. Select observed record.`}
                  aria-pressed={node.recordIds.includes(selectedRecordId ?? '')}
                  onClick={() => onSelectRecord(node.recordId as string)}
                >
                  <NodeContent node={node} />
                </button>
              ) : (
                <div
                  className={className}
                  style={style}
                  key={node.id}
                  role="group"
                  aria-label={`${node.topic}, ${formatStatusLabel(node.status)}. No observed record to inspect.`}
                >
                  <NodeContent node={node} />
                </div>
              );
            })}
            {!model.hasObservedRecords ? (
              <p className="flow-map__empty" id="flow-map-status" role="status">
                {model.hasRun
                  ? 'No Kafka records observed yet. The configured flow will update as the run progresses.'
                  : 'Configured flow. Start a run to observe Kafka records and inspect them here.'}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
