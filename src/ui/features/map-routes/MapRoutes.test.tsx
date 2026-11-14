// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteCandidate, RouteLeg } from '../../../contracts';
import type { CanvasDrawHelpers } from '../../shared/types';
import { MapRoutes } from './MapRoutes';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const mockLeg1: RouteLeg = {
  cells: [0, 1, 2],
  path: [
    { east_m: 0, north_m: 0, elevation_m: 100 },
    { east_m: 50, north_m: 50, elevation_m: 105 },
    { east_m: 100, north_m: 100, elevation_m: 110 },
  ],
  profile: { distance_m: [0, 50, 100], elevation_m: [100, 105, 110], pathIndex: [0, 1, 2] },
  qualityIntervals: [],
  weightedCost: { value: 10, units: 'weighted-cost' },
  metrics: {
    horizontalDistance_m: 141.4,
    surfaceDistance_m: 141.8,
    ascent_m: 10,
    descent_m: 0,
    maxTerrainSlope_deg: 5,
    maxAbsEdgeGrade_deg: 5,
    lowQualityLength_m: 0,
    lowQualityPct: 0,
    unknownQualityLength_m: 0,
    unknownQualityPct: 0,
    cellCount: 3,
  },
};

const mockLeg2: RouteLeg = {
  cells: [0, 5, 2],
  path: [
    { east_m: 0, north_m: 0, elevation_m: 100 },
    { east_m: 20, north_m: 80, elevation_m: 102 },
    { east_m: 100, north_m: 100, elevation_m: 110 },
  ],
  profile: { distance_m: [0, 50, 100], elevation_m: [100, 105, 110], pathIndex: [0, 1, 2] },
  qualityIntervals: [],
  weightedCost: { value: 15, units: 'weighted-cost' },
  metrics: {
    horizontalDistance_m: 160.0,
    surfaceDistance_m: 160.5,
    ascent_m: 10,
    descent_m: 0,
    maxTerrainSlope_deg: 3,
    maxAbsEdgeGrade_deg: 3,
    lowQualityLength_m: 0,
    lowQualityPct: 0,
    unknownQualityLength_m: 0,
    unknownQualityPct: 0,
    cellCount: 3,
  },
};

const mockReturnLeg: RouteLeg = {
  cells: [2, 6, 0],
  path: [
    { east_m: 100, north_m: 100, elevation_m: 110 },
    { east_m: 40, north_m: 20, elevation_m: 104 },
    { east_m: 0, north_m: 0, elevation_m: 100 },
  ],
  profile: { distance_m: [0, 50, 100], elevation_m: [100, 105, 110], pathIndex: [0, 1, 2] },
  qualityIntervals: [],
  weightedCost: { value: 12, units: 'weighted-cost' },
  metrics: {
    horizontalDistance_m: 155.0,
    surfaceDistance_m: 155.4,
    ascent_m: 0,
    descent_m: 10,
    maxTerrainSlope_deg: 4,
    maxAbsEdgeGrade_deg: 4,
    lowQualityLength_m: 0,
    lowQualityPct: 0,
    unknownQualityLength_m: 0,
    unknownQualityPct: 0,
    cellCount: 3,
  },
};

const mockCandidates: RouteCandidate[] = [
  {
    candidateId: 'cand-1',
    policies: ['shortest-feasible'],
    outbound: mockLeg1,
    returnLeg: null,
    missionStatus: 'one-way',
    explanation: ['Shortest direct route'],
  },
  {
    candidateId: 'cand-2',
    policies: ['terrain-aware'],
    outbound: mockLeg2,
    returnLeg: mockReturnLeg,
    missionStatus: 'round-trip-complete',
    explanation: ['Gentle slope traversal with safe return'],
  },
];

describe('TASK-011: Map Routes', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('map-routes');
    expect(entry.slot).toBe('map-routes');
    expect(entry.Component).toBeDefined();
  });

  it('registers canvas layer on mount and cleans up on unmount', () => {
    const unregister = vi.fn();
    const registerLayer = vi.fn().mockReturnValue(unregister);

    const { unmount } = render(
      <MapRoutes
        candidates={mockCandidates}
        selectedCandidateId="cand-1"
        stale={false}
        hover={null}
        routeLayerVisible={true}
        registerLayer={registerLayer}
      />,
    );

    expect(registerLayer).toHaveBeenCalledTimes(1);
    expect(typeof registerLayer.mock.calls[0]?.[0]).toBe('function');

    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('draws outbound and return polylines with distinct styling for selected route', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapRoutes
        candidates={mockCandidates}
        selectedCandidateId="cand-2"
        stale={false}
        hover={null}
        routeLayerVisible={true}
        registerLayer={registerLayer}
      />,
    );

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const helpers: CanvasDrawHelpers = {
      ctx,
      width: 400,
      height: 300,
      pxPerCell: 2,
      scaleX: 1,
      scaleY: 1,
      toPx: (p) => [p.east_m, p.north_m],
      fromPx: (x, y) => ({ east_m: x, north_m: y }),
    };

    capturedDraw!(helpers);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    // Return leg for cand-2 is dashed
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 5]);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('renders hover synchronization ring when hover is active', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    const hoverSample = {
      pathIndex: 1,
      distance_m: 50.0,
      point: { east_m: 50, north_m: 50, elevation_m: 105 },
    };

    render(
      <MapRoutes
        candidates={mockCandidates}
        selectedCandidateId="cand-1"
        stale={false}
        hover={hoverSample}
        routeLayerVisible={true}
        registerLayer={registerLayer}
      />,
    );

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 60 }),
      setLineDash: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;

    const helpers: CanvasDrawHelpers = {
      ctx,
      width: 400,
      height: 300,
      pxPerCell: 2,
      scaleX: 1,
      scaleY: 1,
      toPx: (p) => [p.east_m, p.north_m],
      fromPx: (x, y) => ({ east_m: x, north_m: y }),
    };

    capturedDraw!(helpers);

    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 8, 0, Math.PI * 2);
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('50m (105.0m)'), expect.any(Number), expect.any(Number));
  });

  it('suppresses drawing when routeLayerVisible is false', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapRoutes
        candidates={mockCandidates}
        selectedCandidateId="cand-1"
        stale={false}
        hover={null}
        routeLayerVisible={false}
        registerLayer={registerLayer}
      />,
    );

    const ctx = {
      save: vi.fn(),
      beginPath: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const helpers: CanvasDrawHelpers = {
      ctx,
      width: 400,
      height: 300,
      pxPerCell: 2,
      scaleX: 1,
      scaleY: 1,
      toPx: (p) => [p.east_m, p.north_m],
      fromPx: (x, y) => ({ east_m: x, north_m: y }),
    };

    capturedDraw!(helpers);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('renders DOM routes summary and indicates stale status', () => {
    render(
      <MapRoutes
        candidates={mockCandidates}
        selectedCandidateId="cand-1"
        stale={true}
        hover={null}
        routeLayerVisible={true}
        registerLayer={vi.fn().mockReturnValue(() => {})}
      />,
    );

    expect(screen.getByText('Candidates:')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('cand-1')).toBeTruthy();
    expect(screen.getByTestId('map-routes-stale-indicator')).toBeTruthy();
  });
});
