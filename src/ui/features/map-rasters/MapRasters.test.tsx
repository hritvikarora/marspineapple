// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXCLUSION, type GridBundle, QUALITY, type RegionManifest } from '../../../contracts';
import type { DisplayState } from '../../../state/store';
import type { CanvasDrawHelpers } from '../../shared/types';
import {
  exclusionLegendItems,
  getElevationColor,
  getExclusionColor,
  getQualityColor,
  getSlopeColor,
  qualityLegendItems,
} from './colorScale';
import { MapRasters } from './MapRasters';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const mockBundle: GridBundle = {
  bundleVersion: '1.0.0',
  width: 4,
  height: 3,
  hashesVerified: true,
  manifest: {
    grid: {
      width: 4,
      height: 3,
      cellSizeEast_m: 10,
      cellSizeNorth_m: 10,
      extent: { west_m: 0, east_m: 40, south_m: 0, north_m: 30 },
      orientation: 'north-up',
      order: 'row-major',
      sampleConvention: 'cell-center',
    },
  } as unknown as RegionManifest,
  elevation: new Float32Array([100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650]),
  slope: new Float32Array([5, 12, 28, 4, 30, 8, 10, 16, 2, 6, 22, 35]),
  roughness: new Float32Array([0.01, 0.2, 0.8, 0, 0.4, 0.1, 0.05, 0.9, 0.02, 0.03, 0.15, 0.5]),
  quality: new Uint8Array([
    QUALITY.GOOD,
    QUALITY.LOW,
    QUALITY.UNKNOWN,
    QUALITY.GOOD,
    QUALITY.NO_ELEVATION,
    QUALITY.GOOD,
    QUALITY.LOW,
    QUALITY.GOOD,
    QUALITY.GOOD,
    QUALITY.UNKNOWN,
    QUALITY.GOOD,
    QUALITY.GOOD,
  ]),
  exclusion: new Uint8Array([
    EXCLUSION.NONE,
    EXCLUSION.MISSING_ELEVATION,
    EXCLUSION.UNSUPPORTED_DERIVATIVE,
    EXCLUSION.NONE,
    EXCLUSION.NONE,
    EXCLUSION.NONE,
    EXCLUSION.OUTSIDE_EXTENT,
    EXCLUSION.NONE,
    EXCLUSION.NONE,
    EXCLUSION.MANUAL,
    EXCLUSION.NONE,
    EXCLUSION.NONE,
  ]),
};

const defaultLayers: DisplayState['layers'] = {
  elevation: { visible: true, opacity: 1.0 },
  slope: { visible: true, opacity: 0.8 },
  roughness: { visible: false, opacity: 0.5 },
  quality: { visible: true, opacity: 0.9 },
  exclusion: { visible: true, opacity: 0.7 },
  route: { visible: true, opacity: 1.0 },
  poi: { visible: true, opacity: 1.0 },
};

describe('TASK-008: Map Rasters', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('map-rasters');
    expect(entry.slot).toBe('map-rasters');
    expect(entry.Component).toBeDefined();
  });

  it('registers canvas layer on mount and cleans up on unmount', () => {
    const unregister = vi.fn();
    const registerLayer = vi.fn().mockReturnValue(unregister);

    const { unmount } = render(
      <MapRasters bundle={mockBundle} layers={defaultLayers} registerLayer={registerLayer} />,
    );

    expect(registerLayer).toHaveBeenCalledTimes(1);
    expect(typeof registerLayer.mock.calls[0]?.[0]).toBe('function');

    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('draws elevation, slope, quality, and exclusion onto canvas', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapRasters bundle={mockBundle} layers={defaultLayers} registerLayer={registerLayer} />,
    );

    const fillRectMock = vi.fn();
    const ctx = {
      fillRect: fillRectMock,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    const helpers: CanvasDrawHelpers = {
      ctx,
      width: 40,
      height: 30,
      pxPerCell: 10,
      scaleX: 1,
      scaleY: 1,
      toPx: (p) => [p.east_m, p.north_m],
      fromPx: (x, y) => ({ east_m: x, north_m: y }),
    };

    capturedDraw!(helpers);

    // 12 cells in grid: each visible layer that qualifies will draw fillRect
    expect(fillRectMock).toHaveBeenCalled();
    expect(fillRectMock.mock.calls.length).toBeGreaterThan(12);
  });

  it('color scale functions map values and codes correctly', () => {
    // Elevation: min 100, max 650
    const cLow = getElevationColor(100, 100, 650);
    const cHigh = getElevationColor(650, 100, 650);
    expect(cLow).toContain('rgba(90,50,35');
    expect(cHigh).toContain('rgba(240,144,90');

    // Slope: >25 is red, 15-25 is amber, <=5 is null
    expect(getSlopeColor(30)).toContain('rgba(239,68,68');
    expect(getSlopeColor(20)).toContain('rgba(245,158,11');
    expect(getSlopeColor(4)).toBeNull();

    // Quality: 0 is near-black, 2 is amber, 3 is purple, 1 is null
    expect(getQualityColor(QUALITY.NO_ELEVATION)).toContain('rgba(15,23,42');
    expect(getQualityColor(QUALITY.LOW)).toContain('rgba(245,158,11');
    expect(getQualityColor(QUALITY.UNKNOWN)).toContain('rgba(168,85,247');
    expect(getQualityColor(QUALITY.GOOD)).toBeNull();

    // Exclusion: 1 is red, 2 is dark red, 3 is grey, 4 is pink, 0 is null
    expect(getExclusionColor(EXCLUSION.MISSING_ELEVATION)).toContain('rgba(220,38,38');
    expect(getExclusionColor(EXCLUSION.OUTSIDE_EXTENT)).toContain('rgba(100,116,139');
    expect(getExclusionColor(EXCLUSION.NONE)).toBeNull();
  });

  it('displays rendered rasters summary in the DOM', () => {
    const registerLayer = vi.fn().mockReturnValue(() => {});

    render(
      <MapRasters bundle={mockBundle} layers={defaultLayers} registerLayer={registerLayer} />,
    );

    const info = screen.getByTestId('map-rasters-info');
    const text = info.textContent ?? '';
    expect(info).toBeTruthy();
    expect(screen.getByText(/Elevation \(100m to 650m\)/)).toBeTruthy();
    expect(screen.getByText(/Slope/)).toBeTruthy();
    expect(screen.getByText(/Quality/)).toBeTruthy();
    expect(screen.getByText(/Exclusion/)).toBeTruthy();
    expect(text).toMatch(/Good,\s*Low,\s*Unknown,\s*No elevation/);
    expect(text).toMatch(/Missing elevation,\s*Unsupported derivative,\s*Outside extent,\s*Manual/);
    expect(text.toLowerCase()).not.toContain('probability');
  });

  it('legend words match quality codes and stay distinct from exclusion', () => {
    const quality = qualityLegendItems();
    expect(quality.map((item) => item.code)).toEqual([
      QUALITY.GOOD,
      QUALITY.LOW,
      QUALITY.UNKNOWN,
      QUALITY.NO_ELEVATION,
    ]);
    expect(quality.map((item) => item.label)).toEqual(['Good', 'Low', 'Unknown', 'No elevation']);
    expect(quality.find((item) => item.code === QUALITY.GOOD)?.color).toBeNull();
    expect(quality.find((item) => item.code === QUALITY.LOW)?.color ?? '').toContain('rgba(245,158,11');
    expect(quality.find((item) => item.code === QUALITY.UNKNOWN)?.color ?? '').toContain('rgba(168,85,247');
    expect(quality.find((item) => item.code === QUALITY.NO_ELEVATION)?.color ?? '').toContain('rgba(15,23,42');

    const exclusion = exclusionLegendItems();
    expect(exclusion.map((item) => item.code)).toEqual([
      EXCLUSION.MISSING_ELEVATION,
      EXCLUSION.UNSUPPORTED_DERIVATIVE,
      EXCLUSION.OUTSIDE_EXTENT,
      EXCLUSION.MANUAL,
    ]);
    expect(exclusion.map((item) => item.label)).toEqual([
      'Missing elevation',
      'Unsupported derivative',
      'Outside extent',
      'Manual',
    ]);
    expect(new Set(exclusion.map((item) => item.pattern)).size).toBe(exclusion.length);
    expect(exclusion.find((item) => item.code === EXCLUSION.MISSING_ELEVATION)?.color ?? '').toContain(
      'rgba(220,38,38',
    );
    expect(exclusion.find((item) => item.code === EXCLUSION.OUTSIDE_EXTENT)?.color ?? '').toContain(
      'rgba(100,116,139',
    );
  });

  it('omits quality legend words when quality is hidden and still fillRects the small grid', () => {
    let capturedDraw: ((helpers: CanvasDrawHelpers) => void) | null = null;
    const registerLayer = vi.fn().mockImplementation((fn: (helpers: CanvasDrawHelpers) => void) => {
      capturedDraw = fn;
      return () => {};
    });

    render(
      <MapRasters
        bundle={mockBundle}
        layers={{ ...defaultLayers, quality: { visible: false, opacity: 0.9 } }}
        registerLayer={registerLayer}
      />,
    );

    const text = screen.getByTestId('map-rasters-info').textContent ?? '';
    expect(text).toContain('Elevation (100m to 650m)');
    expect(text).toContain('Missing elevation');
    expect(text).not.toContain('Quality');
    expect(text).not.toContain('Good');
    expect(text).not.toContain('Low');
    expect(text).not.toContain('Unknown');
    expect(text).not.toContain('No elevation');

    const fillRectMock = vi.fn();
    const ctx = {
      fillRect: fillRectMock,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const helpers: CanvasDrawHelpers = {
      ctx,
      width: 40,
      height: 30,
      pxPerCell: 10,
      scaleX: 1,
      scaleY: 1,
      toPx: (p) => [p.east_m, p.north_m],
      fromPx: (x, y) => ({ east_m: x, north_m: y }),
    };
    if (!capturedDraw) {
      throw new Error('raster layer was not registered');
    }
    capturedDraw(helpers);
    expect(fillRectMock).toHaveBeenCalled();
  });

  it('omits exclusion legend words when exclusion is hidden', () => {
    const registerLayer = vi.fn().mockReturnValue(() => {});

    render(
      <MapRasters
        bundle={mockBundle}
        layers={{ ...defaultLayers, exclusion: { visible: false, opacity: 0.7 } }}
        registerLayer={registerLayer}
      />,
    );

    const text = screen.getByTestId('map-rasters-info').textContent ?? '';
    expect(text).toContain('Good');
    expect(text).toContain('No elevation');
    expect(text).not.toContain('Exclusion');
    expect(text).not.toContain('Missing elevation');
    expect(text).not.toContain('Unsupported derivative');
    expect(text).not.toContain('Outside extent');
    expect(text).not.toContain('Manual');
  });
});
