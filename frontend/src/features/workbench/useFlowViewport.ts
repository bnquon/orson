import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from 'react';

export const FLOW_ZOOM_MIN = 0.5;
export const FLOW_ZOOM_MAX = 2;
const FLOW_ZOOM_DEFAULT = 1;
const FLOW_ZOOM_STEP = 0.1;
const FLOW_VIEWPORT_PADDING = 72;

interface ViewportSize {
  width: number;
  height: number;
}

export interface FlowSurfaceLayout {
  surfaceWidth: number;
  surfaceHeight: number;
  canvasLeft: number;
  canvasTop: number;
}

export interface FlowViewportOptions {
  graphWidth: number;
  graphHeight: number;
}

export interface FlowViewportState {
  canvasRef: RefCallback<HTMLDivElement>;
  viewportRef: RefCallback<HTMLDivElement>;
  zoom: number;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  surfaceStyle: CSSProperties;
  canvasStyle: CSSProperties;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;
}

function roundZoom(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampFlowZoom(value: number): number {
  return roundZoom(Math.min(FLOW_ZOOM_MAX, Math.max(FLOW_ZOOM_MIN, value)));
}

export function calculateFitZoom(
  viewportWidth: number,
  viewportHeight: number,
  graphWidth: number,
  graphHeight: number,
  padding = FLOW_VIEWPORT_PADDING,
): number {
  if (viewportWidth <= padding * 2 || viewportHeight <= padding * 2) {
    return FLOW_ZOOM_DEFAULT;
  }

  const availableWidth = viewportWidth - padding * 2;
  const availableHeight = viewportHeight - padding * 2;
  const widthZoom = graphWidth > 0 ? availableWidth / graphWidth : FLOW_ZOOM_DEFAULT;
  const heightZoom = graphHeight > 0 ? availableHeight / graphHeight : FLOW_ZOOM_DEFAULT;

  return clampFlowZoom(Math.min(widthZoom, heightZoom));
}

export function calculateFlowSurfaceLayout(
  viewportWidth: number,
  viewportHeight: number,
  graphWidth: number,
  graphHeight: number,
  zoom: number,
  padding = FLOW_VIEWPORT_PADDING,
): FlowSurfaceLayout {
  const scaledWidth = graphWidth * zoom;
  const scaledHeight = graphHeight * zoom;
  const surfaceWidth = Math.max(viewportWidth, scaledWidth + padding * 2);
  const surfaceHeight = Math.max(viewportHeight, scaledHeight + padding * 2);

  return {
    surfaceWidth,
    surfaceHeight,
    canvasLeft: Math.max(padding, (surfaceWidth - scaledWidth) / 2),
    canvasTop: Math.max(padding, (surfaceHeight - scaledHeight) / 2),
  };
}

function sameSize(left: ViewportSize, right: ViewportSize): boolean {
  return left.width === right.width && left.height === right.height;
}

export function useFlowViewport({
  graphWidth,
  graphHeight,
}: FlowViewportOptions): FlowViewportState {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(FLOW_ZOOM_DEFAULT);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const setViewportRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    viewportRef.current = node;
  }, []);
  const setCanvasRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    canvasRef.current = node;
  }, []);

  const measureViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return { width: 0, height: 0 };

    return { width: viewport.clientWidth, height: viewport.clientHeight };
  }, []);

  const zoomToFit = useCallback(() => {
    const viewport = measureViewport();
    const canvas = canvasRef.current;
    const measuredGraph = {
      width: canvas?.offsetWidth ?? graphWidth,
      height: canvas?.offsetHeight ?? graphHeight,
    };

    setViewportSize((current) => (sameSize(current, viewport) ? current : viewport));
    setZoom(
      calculateFitZoom(viewport.width, viewport.height, measuredGraph.width, measuredGraph.height),
    );
  }, [graphHeight, graphWidth, measureViewport]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const updateViewportSize = () => {
      const nextSize = measureViewport();
      setViewportSize((current) => (sameSize(current, nextSize) ? current : nextSize));
    };

    updateViewportSize();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measureViewport]);

  const zoomIn = useCallback(() => {
    setZoom((current) => clampFlowZoom(current + FLOW_ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((current) => clampFlowZoom(current - FLOW_ZOOM_STEP));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(FLOW_ZOOM_DEFAULT);
  }, []);

  const layout = useMemo(
    () =>
      calculateFlowSurfaceLayout(
        viewportSize.width,
        viewportSize.height,
        graphWidth,
        graphHeight,
        zoom,
      ),
    [graphHeight, graphWidth, viewportSize.height, viewportSize.width, zoom],
  );

  return {
    canvasRef: setCanvasRef,
    viewportRef: setViewportRef,
    zoom,
    zoomPercent: Math.round(zoom * 100),
    canZoomIn: zoom < FLOW_ZOOM_MAX,
    canZoomOut: zoom > FLOW_ZOOM_MIN,
    surfaceStyle: {
      height: layout.surfaceHeight,
      width: layout.surfaceWidth,
    },
    canvasStyle: {
      height: graphHeight,
      left: layout.canvasLeft,
      top: layout.canvasTop,
      transform: `scale(${zoom})`,
      transformOrigin: 'top left',
      width: graphWidth,
    },
    zoomIn,
    zoomOut,
    zoomToFit,
    resetZoom,
  };
}
