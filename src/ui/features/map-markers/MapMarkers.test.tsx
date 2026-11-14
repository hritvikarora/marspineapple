// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalPoint, PointOfInterest } from '../../../contracts';
import type { CanvasDrawHelpers } from '../../shared/types';
import { MapMarkers } from './MapMarkers';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const mockPois: PointOfInterest[] = [
  {
    id: 'outpost-1',
    name: 'Habitation Alpha',
    kind: 'outpost',
    position: { east_m: 100, north_m: 200 },
    purpose: 'Crew base',
    officialName: false,
    positionalUncertainty_m: null,
    sourceIds: [],
    synthetic: true,
  },
  {
    id: 'science-1',
    name: 'Mineral Ridge',
    kind: 'science-stop',
    position: { east_m: 800, north_m: 1200 },
    purpose: 'Mineral analysis',
    officialName: true,
    positionalUncertainty_m: 2,
    sourceIds: [],
    synthetic: false,
  },
];

const mockStart: LocalPoint = { east_m: 100, north_m: 200 };
const mockDest: LocalPoint = { east_m: 800, north_m: 1200 };

describe('TASK-010: Map Markers', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('map-markers');
    expect(entry.slot).toBe('map-markers');
    expect(entry.Component).toBeDefined();
  });

  it('registers canvas layer on mount and cleans up on unmount', () => {
    const unregister = vi.fn();
    const registerLayer = vi.fn().mockReturnValue(unregister);
    const onPick = vi.fn();

    const { unmount } = render(
      <MapMarkers
        pois={mockPois}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={true}
        onPick={onPick}
        registerLayer={registerLayer}
      />,
    );

    expect(registerLayer).toHaveBeenCalledTimes(1);
    expect(typeof registerLayer.mock.calls[0]?.[0]).toBe('function');

    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('draws start, destination, and distinct POI markers on canvas', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapMarkers
        pois={mockPois}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={true}
        onPick={vi.fn()}
        registerLayer={registerLayer}
      />,
    );

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillStyle: '',
      strokeStyle: '',
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
      scaleX: 0.2,
      scaleY: 0.2,
      toPx: (p) => [p.east_m * 0.2, p.north_m * 0.2],
      fromPx: (x, y) => ({ east_m: x / 0.2, north_m: y / 0.2 }),
    };

    capturedDraw!(helpers);

    expect(ctx.save).toHaveBeenCalled();
    // Start letter 'S' and destination letter 'D'
    expect(ctx.fillText).toHaveBeenCalledWith('S', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith('D', expect.any(Number), expect.any(Number));
    // POI names
    expect(ctx.fillText).toHaveBeenCalledWith('Habitation Alpha', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith('Mineral Ridge', expect.any(Number), expect.any(Number));
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('suppresses POI markers when poiLayerVisible is false', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapMarkers
        pois={mockPois}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={false}
        onPick={vi.fn()}
        registerLayer={registerLayer}
      />,
    );

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillStyle: '',
      strokeStyle: '',
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
      scaleX: 0.2,
      scaleY: 0.2,
      toPx: (p) => [p.east_m * 0.2, p.north_m * 0.2],
      fromPx: (x, y) => ({ east_m: x / 0.2, north_m: y / 0.2 }),
    };

    capturedDraw!(helpers);

    // Start & Dest rendered
    expect(ctx.fillText).toHaveBeenCalledWith('S', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith('D', expect.any(Number), expect.any(Number));
    // POI labels suppressed
    expect(ctx.fillText).not.toHaveBeenCalledWith('Habitation Alpha', expect.any(Number), expect.any(Number));
  });

  it('renders DOM coordinates summary', () => {
    render(
      <MapMarkers
        pois={mockPois}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={true}
        onPick={vi.fn()}
        registerLayer={vi.fn().mockReturnValue(() => {})}
      />,
    );

    expect(screen.getByText(/100m E, 200m N/)).toBeTruthy();
    expect(screen.getByText(/800m E, 1200m N/)).toBeTruthy();
    expect(screen.getByText(/2 active/)).toBeTruthy();
  });
});
