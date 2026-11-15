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

    expect(screen.getByTestId('map-markers-info')).toBeTruthy();
    expect(screen.getByText(/100m E, 200m N/)).toBeTruthy();
    expect(screen.getByText(/800m E, 1200m N/)).toBeTruthy();
    expect(screen.getByText(/2 active/)).toBeTruthy();
  });

  it('draws Start and Destination on exact cell centres with paper/ink contrast and lineWidth >= 1.5', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapMarkers
        pois={[]}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={false}
        onPick={vi.fn()}
        registerLayer={registerLayer}
      />,
    );

    const strokes: Array<{ strokeStyle: string; fillStyle: string; lineWidth: number }> = [];
    const fills: Array<{ fillStyle: string }> = [];
    const texts: Array<{ text: string; x: number; y: number; fillStyle: string }> = [];

    const ctxObj = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(() => {
        strokes.push({
          strokeStyle: String(ctxObj.strokeStyle),
          fillStyle: String(ctxObj.fillStyle),
          lineWidth: ctxObj.lineWidth,
        });
      }),
      fill: vi.fn(() => {
        fills.push({ fillStyle: String(ctxObj.fillStyle) });
      }),
      fillRect: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn((text: string, x: number, y: number) => {
        texts.push({ text, x, y, fillStyle: String(ctxObj.fillStyle) });
      }),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    };
    const ctx = ctxObj as unknown as CanvasRenderingContext2D;

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

    if (!capturedDraw) throw new Error('Expected draw callback to be registered');
    (capturedDraw as (helpers: CanvasDrawHelpers) => void)(helpers);

    // Exact cell centres without pixel nudges: (20, 40) and (160, 240)
    expect(texts).toEqual([
      { text: 'S', x: 20, y: 40, fillStyle: '#000000' },
      { text: 'D', x: 160, y: 240, fillStyle: '#FFFFFF' },
    ]);

    // Paper fill + ink stroke for S, inverse ink fill + paper stroke for D
    expect(strokes).toEqual([
      { fillStyle: '#FFFFFF', strokeStyle: '#000000', lineWidth: 2 },
      { fillStyle: '#000000', strokeStyle: '#FFFFFF', lineWidth: 2 },
    ]);
    for (const s of strokes) {
      expect(s.lineWidth).toBeGreaterThanOrEqual(1.5);
    }
    expect(fills.some((f) => f.fillStyle === '#FFFFFF')).toBe(true);
    expect(fills.some((f) => f.fillStyle === '#000000')).toBe(true);
  });

  it('keeps POI marks smaller than Start/Dest, omits context labels, and maintains lineWidth >= 1.5', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    const contextPoi: PointOfInterest = {
      id: 'ctx-1',
      name: 'Unlabelled Context Point',
      kind: 'context',
      position: { east_m: 300, north_m: 400 },
      purpose: 'Context',
      officialName: false,
      positionalUncertainty_m: null,
      sourceIds: [],
      synthetic: true,
    };

    render(
      <MapMarkers
        pois={[...mockPois, contextPoi]}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={true}
        onPick={vi.fn()}
        registerLayer={registerLayer}
      />,
    );

    const lineWidths: number[] = [];
    const arcRadii: number[] = [];
    const ctxObj = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(() => {
        lineWidths.push(ctxObj.lineWidth);
      }),
      fill: vi.fn(),
      fillRect: vi.fn(),
      arc: vi.fn((_x: number, _y: number, r: number) => {
        arcRadii.push(r);
      }),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 40 }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    };
    const ctx = ctxObj as unknown as CanvasRenderingContext2D;

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

    if (!capturedDraw) throw new Error('Expected draw callback to be registered');
    (capturedDraw as (helpers: CanvasDrawHelpers) => void)(helpers);

    expect(lineWidths.length).toBeGreaterThan(0);
    for (const width of lineWidths) {
      expect(width).toBeGreaterThanOrEqual(1.5);
    }

    // Context POI renders a small dot (2.5px) and does not add a text label
    expect(arcRadii).toContain(2.5);
    expect(ctx.fillText).not.toHaveBeenCalledWith('Unlabelled Context Point', expect.any(Number), expect.any(Number));
    // All POI arc radii stay smaller than Start/Dest body radius (8.5)
    const poiRadii = arcRadii.slice(0, -4);
    for (const r of poiRadii) {
      expect(r).toBeLessThan(8.5);
    }
  });

  it('unregisters the previous draw callback on rerender so draw functions never stack', () => {
    const activeLayers = new Set<(helpers: CanvasDrawHelpers) => void>();
    const unregisterSpies: Array<ReturnType<typeof vi.fn>> = [];
    const registerLayer = vi.fn((fn: (helpers: CanvasDrawHelpers) => void) => {
      activeLayers.add(fn);
      const unregister = vi.fn(() => {
        activeLayers.delete(fn);
      });
      unregisterSpies.push(unregister);
      return unregister;
    });

    const { rerender, unmount } = render(
      <MapMarkers
        pois={mockPois}
        start={mockStart}
        destination={mockDest}
        poiLayerVisible={true}
        onPick={vi.fn()}
        registerLayer={registerLayer}
      />,
    );

    expect(activeLayers.size).toBe(1);

    const movedStart: LocalPoint = { east_m: 250, north_m: 350 };
    rerender(
      <MapMarkers
        pois={mockPois}
        start={movedStart}
        destination={null}
        poiLayerVisible={false}
        onPick={vi.fn()}
        registerLayer={registerLayer}
      />,
    );

    expect(unregisterSpies[0]).toHaveBeenCalledTimes(1);
    expect(activeLayers.size).toBe(1);
    expect(screen.getByText(/250m E, 350m N/)).toBeTruthy();
    expect(screen.getByText(/Unset/)).toBeTruthy();
    expect(screen.getByText(/Hidden/)).toBeTruthy();

    const activeDraw = Array.from(activeLayers)[0];
    if (!activeDraw) throw new Error('Expected one active draw callback');
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

    activeDraw({
      ctx,
      width: 400,
      height: 300,
      pxPerCell: 2,
      scaleX: 0.2,
      scaleY: 0.2,
      toPx: (p) => [p.east_m * 0.2, p.north_m * 0.2],
      fromPx: (x, y) => ({ east_m: x / 0.2, north_m: y / 0.2 }),
    });

    expect(ctx.fillText).toHaveBeenCalledWith('S', 50, 70);
    expect(ctx.fillText).not.toHaveBeenCalledWith('D', expect.any(Number), expect.any(Number));
    expect(ctx.fillText).not.toHaveBeenCalledWith('Habitation Alpha', expect.any(Number), expect.any(Number));

    unmount();
    expect(unregisterSpies[1]).toHaveBeenCalledTimes(1);
    expect(activeLayers.size).toBe(0);
  });
});
