import { describe, expect, it } from 'vitest';
import {
  calculateFlowSurfaceLayout,
  clampFlowZoom,
  FLOW_ZOOM_MAX,
  FLOW_ZOOM_MIN,
} from '../useFlowViewport';

describe('flow viewport calculations', () => {
  it('clamps zoom to the supported range', () => {
    expect(clampFlowZoom(0.1)).toBe(FLOW_ZOOM_MIN);
    expect(clampFlowZoom(3)).toBe(FLOW_ZOOM_MAX);
    expect(clampFlowZoom(1.234)).toBe(1.23);
  });

  it('keeps the scaled graph scrollable and centers it when there is room', () => {
    expect(calculateFlowSurfaceLayout(800, 600, 400, 200, 1)).toEqual({
      surfaceWidth: 800,
      surfaceHeight: 600,
      canvasLeft: 200,
      canvasTop: 200,
    });
    expect(calculateFlowSurfaceLayout(400, 300, 400, 200, 2)).toEqual({
      surfaceWidth: 944,
      surfaceHeight: 544,
      canvasLeft: 72,
      canvasTop: 72,
    });
  });
});
