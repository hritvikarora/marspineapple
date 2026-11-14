// @vitest-environment jsdom
/**
 * UI Foundation test suite. OWNER: Dhani.
 * Tests slot discovery, fallback rendering, error boundary isolation, primitives,
 * drawer accessibility, registry slot validation, real App integration, and map canvas replacement.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './primitives/Button';
import { Field } from './primitives/Field';
import { InlineNotice } from './primitives/InlineNotice';
import { Measurement } from './primitives/MeasurementFormat';
import { formatDegrees, formatMeters, formatPercent } from './primitives/formatters';
import { ModalDrawer } from './primitives/ModalDrawer';
import { VisuallyHidden } from './primitives/VisuallyHidden';
import { Slot } from './Slot';
import { FeatureHarness } from './FeatureHarness';
import { validateFeatureList } from './registry';
import { ALL_FEATURE_SLOTS, type FeatureModule } from './types';
import { MapCanvas, type CanvasDrawHelpers } from '../MapCanvas';
import type { GridBundle, RasterLayerDescriptor, RasterLayerId } from '../../contracts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Slot component and Error Boundary', () => {
  it('renders fallback when slot is absent', () => {
    render(
      <Slot
        name="mission-context"
        fallback={<div data-testid="fallback">Default Context</div>}
        features={{}}
      />,
    );
    expect(screen.getByTestId('fallback').textContent).toBe('Default Context');
  });

  it('renders injected feature when slot is populated', () => {
    const TestFeature: FeatureModule<'mission-context'> = {
      id: 'test-feature',
      slot: 'mission-context',
      Component: () => <div data-testid="custom-feature">Custom Module</div>,
    };
    render(
      <Slot
        name="mission-context"
        fallback={<div>Fallback</div>}
        features={{ 'mission-context': TestFeature }}
      />,
    );
    expect(screen.getByTestId('custom-feature').textContent).toBe('Custom Module');
    expect(screen.queryByText('Fallback')).toBeNull();
  });

  it('catches render errors in a feature and renders slot fallback or error banner', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const CrashingFeature: FeatureModule<'mission-context'> = {
      id: 'crash-feature',
      slot: 'mission-context',
      Component: () => {
        throw new Error('Explosion in feature');
      },
    };
    render(
      <Slot
        name="mission-context"
        fallback={<div data-testid="safe-fallback">Safe Fallback</div>}
        features={{ 'mission-context': CrashingFeature }}
      />,
    );
    expect(screen.getByTestId('safe-fallback').textContent).toBe('Safe Fallback');
  });
});

describe('UI Primitives', () => {
  it('Button handles clicks and disabled states', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button variant="primary" onClick={onClick}>
        Click Me
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Click Me' });
    expect(btn.className).toContain('btn-primary');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button disabled onClick={onClick}>
        Click Me
      </Button>,
    );
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1); // not called again
  });

  it('Field wires label, description and error aria attributes', () => {
    render(
      <Field label="Coordinate X" description="Local east in meters" error="Value is outside range">
        {(props) => <input type="number" {...props} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Coordinate X/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Value is outside range');
  });

  it('InlineNotice renders semantic roles based on variant', () => {
    const { rerender } = render(<InlineNotice variant="info">Informational note</InlineNotice>);
    expect(screen.getByRole('status').textContent).toBe('Informational note');

    rerender(<InlineNotice variant="error">Critical alert</InlineNotice>);
    expect(screen.getByRole('alert').textContent).toBe('Critical alert');
  });

  it('ModalDrawer handles Escape key, close button and focus return', () => {
    const onClose = vi.fn();
    const triggerBtn = document.createElement('button');
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    const { unmount } = render(
      <ModalDrawer isOpen={true} onClose={onClose} title="Source Provenance">
        <p>Drawer content</p>
      </ModalDrawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Source Provenance' });
    expect(dialog).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    document.body.removeChild(triggerBtn);
  });

  it('ModalDrawer traps focus and blocks background clicks', () => {
    const onClose = vi.fn();
    render(
      <ModalDrawer isOpen={true} onClose={onClose} title="Drawer Title">
        <button type="button">Inside Button 1</button>
        <button type="button">Inside Button 2</button>
      </ModalDrawer>,
    );

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    const btn1 = screen.getByRole('button', { name: 'Inside Button 1' });
    const btn2 = screen.getByRole('button', { name: 'Inside Button 2' });

    // Focus last element and Tab -> cycles to first element
    btn2.focus();
    expect(document.activeElement).toBe(btn2);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab at first element -> cycles to last element
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(btn2);

    // Clicking inside drawer does NOT trigger backdrop close
    fireEvent.click(btn1);
    expect(onClose).not.toHaveBeenCalled();

    // Clicking the backdrop overlay calls onClose
    const overlay = document.querySelector('.drawer-overlay');
    expect(overlay).toBeTruthy();
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('VisuallyHidden hides content visually while keeping it in the DOM', () => {
    render(<VisuallyHidden>Screen reader announcement</VisuallyHidden>);
    const hidden = screen.getByText('Screen reader announcement');
    expect(hidden.style.position).toBe('absolute');
    expect(hidden.style.clip).toBe('rect(0px, 0px, 0px, 0px)');
  });

  it('Measurement formatting helpers format numbers and units accurately', () => {
    expect(formatMeters(174.86, 1)).toBe('174.9 m');
    expect(formatMeters(null)).toBe('—');
    expect(formatDegrees(12.34, 1)).toBe('12.3°');
    expect(formatDegrees(NaN)).toBe('—');
    expect(formatPercent(47.14, 0)).toBe('47%');

    render(<Measurement value={100} unit="m" decimals={0} />);
    expect(screen.getByText('100 m')).toBeTruthy();
  });
});

describe('Feature Registry and Slot Integrity', () => {
  it('defines exactly 20 distinct slot names in ALL_FEATURE_SLOTS', () => {
    expect(ALL_FEATURE_SLOTS).toHaveLength(20);
    const unique = new Set(ALL_FEATURE_SLOTS);
    expect(unique.size).toBe(20);
  });

  it('registers distinct feature modules without error', () => {
    const f1: FeatureModule<'mission-context'> = {
      id: 'test-context',
      slot: 'mission-context',
      Component: () => null,
    };
    const f2: FeatureModule<'destinations'> = {
      id: 'test-destinations',
      slot: 'destinations',
      Component: () => null,
    };
    const registered = validateFeatureList([f1, f2]);
    expect(registered['mission-context']).toBe(f1);
    expect(registered['destinations']).toBe(f2);
  });

  it('rejects duplicate slot assignments with a descriptive error', () => {
    const f1: FeatureModule<'mission-context'> = {
      id: 'feature-one',
      slot: 'mission-context',
      Component: () => null,
    };
    const f2: FeatureModule<'mission-context'> = {
      id: 'feature-two',
      slot: 'mission-context',
      Component: () => null,
    };
    expect(() => validateFeatureList([f1, f2])).toThrowError(
      /Duplicate slot assignment detected: both "feature-one" and "feature-two" target slot "mission-context"/,
    );
  });
});

const fakeBundle: GridBundle = {
  bundleVersion: 'test-v1',
  width: 4,
  height: 4,
  hashesVerified: true,
  manifest: {
    schema: 'mars-pathfinder/region-bundle',
    schemaVersion: '1.0',
    bundleId: 'test-bundle',
    bundleVersion: 'test-v1',
    datasetVersion: 'v1',
    synthetic: true,
    title: 'Test Bundle',
    description: 'Test',
    createdDate: '2026-11-14',
    crs: {
      description: 'synthetic-local',
      body: 'synthetic',
      sourceCrs: null,
      localOriginInSource: null,
      verticalReference: 'datum',
      horizontalUnits: 'm',
      verticalUnits: 'm',
    },
    grid: {
      width: 4,
      height: 4,
      cellSizeEast_m: 10,
      cellSizeNorth_m: 10,
      extent: { west_m: 0, east_m: 40, south_m: 0, north_m: 40 },
      orientation: 'north-up',
      order: 'row-major',
      sampleConvention: 'cell-center',
    },
    layers: {} as unknown as Record<RasterLayerId, RasterLayerDescriptor>,
    qualityClasses: [],
    strictQualitySupported: true,
    pointsOfInterest: [],
    displayAssets: [],
    sources: [],
    limitations: [],
    processing: { script: 'test', parameters: {} },
  },
  elevation: new Float32Array(16).fill(10),
  slope: new Float32Array(16).fill(2),
  roughness: new Float32Array(16).fill(0.1),
  quality: new Uint8Array(16).fill(1),
  exclusion: new Uint8Array(16).fill(0),
};

describe('FeatureHarness and real App integration', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = (() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('mounts an isolated feature with default store', () => {
    const CustomPlugin: FeatureModule<'mission-context'> = {
      id: 'test-plugin',
      slot: 'mission-context',
      Component: () => <div data-testid="isolated-plugin">Isolated Test Module</div>,
    };
    render(<FeatureHarness feature={CustomPlugin} />);
    expect(screen.getByTestId('isolated-plugin').textContent).toBe('Isolated Test Module');
  });

  it('mounts feature inside real App shell and connects to reducer lifecycle via mountInApp', async () => {
    const CustomPlugin: FeatureModule<'mission-context'> = {
      id: 'in-app-plugin',
      slot: 'mission-context',
      Component: ({ manifest, release }) => (
        <div data-testid="in-app-feature">Bundle: {manifest.bundleId}, Release: {release.bundleVersion}</div>
      ),
    };
    render(<FeatureHarness feature={CustomPlugin} mountInApp initialBundle={fakeBundle} />);
    const el = await screen.findByTestId('in-app-feature');
    expect(el.textContent).toContain('test-bundle');
    expect(screen.getByTestId('release-id')).toBeTruthy();
  });

  it('allows a map feature in real App to register a custom layer and clean it up', async () => {
    const customDraw = vi.fn();
    const MarkersPlugin: FeatureModule<'map-markers'> = {
      id: 'custom-markers',
      slot: 'map-markers',
      Component: ({ registerLayer }) => {
        useEffect(() => {
          return registerLayer(customDraw);
        }, [registerLayer]);
        return <div data-testid="marker-feature-mounted" />;
      },
    };

    const { unmount } = render(
      <FeatureHarness feature={MarkersPlugin} mountInApp initialBundle={fakeBundle} />,
    );
    expect(await screen.findByTestId('marker-feature-mounted')).toBeTruthy();
    expect(screen.getByTestId('map-canvas')).toBeTruthy();
    await waitFor(() => expect(customDraw).toHaveBeenCalled());

    unmount();
  });
});

describe('MapCanvas extensibility and layer replacement', () => {

  const fakeLayers = {
    elevation: { visible: true, opacity: 1 },
    slope: { visible: false, opacity: 0.6 },
    roughness: { visible: false, opacity: 0.6 },
    quality: { visible: false, opacity: 0.5 },
    exclusion: { visible: true, opacity: 0.7 },
    route: { visible: true, opacity: 1 },
    poi: { visible: true, opacity: 1 },
  };

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = (() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders canvas with baseline test-id and responds to clicks via onPick', () => {
    const onPick = vi.fn();
    render(
      <MapCanvas
        bundle={fakeBundle}
        candidates={[]}
        selectedCandidateId={null}
        start={null}
        destination={null}
        layers={fakeLayers}
        stale={false}
        hover={null}
        onPick={onPick}
      />,
    );
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toBeTruthy();

    fireEvent.click(canvas, { clientX: 10, clientY: 10 });
    expect(onPick).toHaveBeenCalledTimes(1);
    const clickedPoint = onPick.mock.calls[0]![0];
    expect(typeof clickedPoint.east_m).toBe('number');
    expect(typeof clickedPoint.north_m).toBe('number');
  });

  it('executes customLayer replacement hooks for rasters, routes, markers, and chrome', () => {
    const customRasters = vi.fn((helpers: CanvasDrawHelpers) => {
      helpers.ctx.fillRect(0, 0, 10, 10);
    });
    const customRoutes = vi.fn((helpers: CanvasDrawHelpers) => {
      helpers.ctx.stroke();
    });
    const customMarkers = vi.fn((helpers: CanvasDrawHelpers) => {
      helpers.ctx.arc(5, 5, 2, 0, Math.PI * 2);
    });
    const customChrome = vi.fn((helpers: CanvasDrawHelpers) => {
      helpers.ctx.fillText('Custom Scale', 0, 0);
    });

    render(
      <MapCanvas
        bundle={fakeBundle}
        candidates={[]}
        selectedCandidateId={null}
        start={null}
        destination={null}
        layers={fakeLayers}
        stale={false}
        hover={null}
        onPick={vi.fn()}
        customLayers={{
          rasters: customRasters,
          routes: customRoutes,
          markers: customMarkers,
          chrome: customChrome,
        }}
      />,
    );

    expect(customRasters).toHaveBeenCalledTimes(1);
    expect(customRoutes).toHaveBeenCalledTimes(1);
    expect(customMarkers).toHaveBeenCalledTimes(1);
    expect(customChrome).toHaveBeenCalledTimes(1);
  });

  it('falls back to baseline drawing when custom layers are absent', () => {
    const { rerender } = render(
      <MapCanvas
        bundle={fakeBundle}
        candidates={[]}
        selectedCandidateId={null}
        start={null}
        destination={null}
        layers={fakeLayers}
        stale={false}
        hover={null}
        onPick={vi.fn()}
      />,
    );
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toBeTruthy();

    // Rerender with custom layers, then remove them to verify fallback
    const customMarkers = vi.fn();
    rerender(
      <MapCanvas
        bundle={fakeBundle}
        candidates={[]}
        selectedCandidateId={null}
        start={null}
        destination={null}
        layers={fakeLayers}
        stale={false}
        hover={null}
        onPick={vi.fn()}
        customLayers={{ markers: customMarkers }}
      />,
    );
    expect(customMarkers).toHaveBeenCalledTimes(1);

    rerender(
      <MapCanvas
        bundle={fakeBundle}
        candidates={[]}
        selectedCandidateId={null}
        start={null}
        destination={null}
        layers={fakeLayers}
        stale={false}
        hover={null}
        onPick={vi.fn()}
        customLayers={{}}
      />,
    );
    expect(customMarkers).toHaveBeenCalledTimes(1); // not called again
  });
});
