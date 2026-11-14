// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoordinateReference, GridSpec, LocalPoint } from '../../../contracts';
import type { CanvasDrawHelpers } from '../../shared/types';
import { MapChrome } from './MapChrome';
import { calculateScaleBar } from './scale';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const mockGrid: GridSpec = {
  width: 200,
  height: 150,
  cellSizeEast_m: 10,
  cellSizeNorth_m: 10,
  extent: {
    west_m: 0,
    east_m: 2000,
    south_m: 0,
    north_m: 1500,
  },
  orientation: 'north-up',
  order: 'row-major',
  sampleConvention: 'cell-center',
};

const mockCrs: CoordinateReference = {
  description: 'Mars Local Tangent Plane',
  body: 'Mars',
  sourceCrs: null,
  localOriginInSource: null,
  verticalReference: 'Mars Areoid',
  horizontalUnits: 'm',
  verticalUnits: 'm',
};

describe('TASK-007: Map Chrome & Scale', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('map-chrome');
    expect(entry.slot).toBe('map-chrome');
    expect(entry.Component).toBeDefined();
  });

  it('registers canvas layer on mount and cleans up on unmount', () => {
    const unregister = vi.fn();
    const registerLayer = vi.fn().mockReturnValue(unregister);

    const { unmount } = render(
      <MapChrome grid={mockGrid} crs={mockCrs} registerLayer={registerLayer} />,
    );

    expect(registerLayer).toHaveBeenCalledTimes(1);
    expect(typeof registerLayer.mock.calls[0]?.[0]).toBe('function');

    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('draws boundary, North arrow, and scale bar via canvas draw callback', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(<MapChrome grid={mockGrid} crs={mockCrs} registerLayer={registerLayer} />);
    expect(capturedDraw).not.toBeNull();

    // Mock canvas context
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
      strokeRect: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const helpers: CanvasDrawHelpers = {
      ctx,
      width: 400,
      height: 300,
      pxPerCell: 2,
      scaleX: 0.2, // 2px per 10m cell = 0.2 px/m
      scaleY: 0.2,
      toPx: (p: LocalPoint) => [p.east_m * 0.2, (1500 - p.north_m) * 0.2],
      fromPx: (px: number, py: number) => ({ east_m: px / 0.2, north_m: 1500 - py / 0.2 }),
    };

    capturedDraw!(helpers);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled(); // North compass base circle
    expect(ctx.fillText).toHaveBeenCalledWith('N', expect.any(Number), expect.any(Number));
    expect(ctx.fillRect).toHaveBeenCalled(); // Scale bar segments
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('calculateScaleBar returns clean round numbers and accurate widths', () => {
    // 0.2 px/m: 80px target is ~400m -> rounds to 500m -> 100px width
    const s1 = calculateScaleBar(0.2, 80);
    expect(s1.meters).toBe(500);
    expect(s1.widthPx).toBe(100);
    expect(s1.label).toBe('500 m');

    // 0.1 px/m: 80px target is ~800m -> rounds to 1000m -> 100px width, 1 km
    const s2 = calculateScaleBar(0.1, 80);
    expect(s2.meters).toBe(1000);
    expect(s2.widthPx).toBe(100);
    expect(s2.label).toBe('1 km');

    // Fallback for zero scale
    const s0 = calculateScaleBar(0, 80);
    expect(s0.meters).toBe(100);
  });

  it('displays CRS and planar extent metadata in the DOM', () => {
    const registerLayer = vi.fn().mockReturnValue(() => {});

    render(<MapChrome grid={mockGrid} crs={mockCrs} registerLayer={registerLayer} />);

    const info = screen.getByTestId('map-chrome-info');
    expect(info).toBeTruthy();
    expect(screen.getByText(/Mars Local Tangent Plane/)).toBeTruthy();
    expect(screen.getByText(/2000m E/)).toBeTruthy();
    expect(screen.getByText(/1500m N/)).toBeTruthy();
    expect(screen.getByText(/10m × 10m\/cell/)).toBeTruthy();
  });
});
