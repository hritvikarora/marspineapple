// @vitest-environment jsdom
/**
 * Test suite for TASK-004 Endpoints Feature. OWNER: Dhani (UI Role).
 * Validates coordinate forms, pick mode toggle, cell snapping feedback,
 * extent boundary checks, graceful rejection, and App harness integration.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridSpec, LocalPoint, RasterLayerDescriptor, RasterLayerId } from '../../shared';
import { FeatureHarness } from '../../shared/FeatureHarness';
import type { EndpointsSlotProps } from '../../shared/types';
import { EndpointsFeature } from './EndpointsFeature';
import entry from './entry';

const mockGrid: GridSpec = {
  width: 20,
  height: 12,
  cellSizeEast_m: 10,
  cellSizeNorth_m: 10,
  extent: {
    west_m: 0,
    east_m: 200,
    south_m: 0,
    north_m: 120,
  },
  orientation: 'north-up',
  order: 'row-major',
  sampleConvention: 'cell-center',
};

describe('EndpointsFeature (TASK-004)', () => {
  let defaultProps: EndpointsSlotProps;
  let setPickModeMock = vi.fn<(mode: 'start' | 'destination') => void>();
  let setEndpointMock = vi.fn<(which: 'start' | 'destination', point: LocalPoint | null, poiId: string | null) => void>();

  beforeEach(() => {
    setPickModeMock = vi.fn<(mode: 'start' | 'destination') => void>();
    setEndpointMock = vi.fn<(which: 'start' | 'destination', point: LocalPoint | null, poiId: string | null) => void>();
    defaultProps = {
      pickMode: 'destination',
      setPickMode: setPickModeMock,
      start: null,
      destination: null,
      grid: mockGrid,
      setEndpoint: setEndpointMock,
    };
  });

  afterEach(() => {
    cleanup();
  });

  describe('Initial rendering & empty state', () => {
    it('renders pick mode toggle, swap button, start/destination cards, and grid info', () => {
      render(<EndpointsFeature {...defaultProps} />);

      expect(screen.getByTestId('pick-mode-toggle')).toBeTruthy();
      expect(screen.getByTestId('swap-endpoints')).toBeTruthy();
      expect(screen.getByTestId('endpoint-card-start')).toBeTruthy();
      expect(screen.getByTestId('endpoint-card-destination')).toBeTruthy();
      expect(screen.getByTestId('grid-info-card')).toBeTruthy();

      expect(screen.getByTestId('endpoint-start-empty').textContent).toContain('Endpoint not set');
      expect(screen.getByTestId('endpoint-destination-empty').textContent).toContain('Endpoint not set');
      expect((screen.getByTestId('swap-endpoints') as HTMLButtonElement).disabled).toBe(true);
    });

    it('displays the regional grid extent honestly', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const gridInfo = screen.getByTestId('grid-info-card');
      expect(gridInfo.textContent).toContain('East: [0 m, 200 m)');
      expect(gridInfo.textContent).toContain('North: (0 m, 120 m]');
      expect(gridInfo.textContent).toContain('20 × 12 cells');
      expect(gridInfo.textContent).toContain('10 m × 10 m');
    });
  });

  describe('Pick mode toggle (map click selection)', () => {
    it('reflects active pickMode on radio buttons and cards', () => {
      render(<EndpointsFeature {...defaultProps} pickMode="start" />);

      const startRadio = screen.getByRole('radio', { name: /start/i }) as HTMLInputElement;
      const destRadio = screen.getByRole('radio', { name: /destination/i }) as HTMLInputElement;

      expect(startRadio.checked).toBe(true);
      expect(destRadio.checked).toBe(false);
      expect(screen.getByTestId('endpoint-start-active-target')).toBeTruthy();
      expect(screen.queryByTestId('endpoint-destination-active-target')).toBeNull();
    });

    it('changes pickMode when selecting a different radio option', () => {
      render(<EndpointsFeature {...defaultProps} pickMode="start" />);

      const destRadio = screen.getByRole('radio', { name: /destination/i });
      fireEvent.click(destRadio);

      expect(setPickModeMock).toHaveBeenCalledWith('destination');
    });

    it('changes pickMode when clicking "Set as Map Target" button on an inactive card', () => {
      render(<EndpointsFeature {...defaultProps} pickMode="destination" />);

      const setStartTargetBtn = screen.getByRole('button', { name: /Set start as map click target/i });
      fireEvent.click(setStartTargetBtn);

      expect(setPickModeMock).toHaveBeenCalledWith('start');
    });
  });

  describe('Coordinate input & validation', () => {
    it('applies valid start coordinates within extent', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(eastInput, { target: { value: '25.0' } });
      fireEvent.change(northInput, { target: { value: '65.0' } });
      fireEvent.click(applyBtn);

      expect(setEndpointMock).toHaveBeenCalledWith('start', { east_m: 25, north_m: 65 }, null);
      expect(screen.queryByTestId('endpoint-start-error')).toBeNull();
    });

    it('allows submission via Enter key inside input', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');

      fireEvent.change(eastInput, { target: { value: '30' } });
      fireEvent.change(northInput, { target: { value: '70' } });
      fireEvent.submit(eastInput.closest('form')!);

      expect(setEndpointMock).toHaveBeenCalledWith('start', { east_m: 30, north_m: 70 }, null);
    });

    it('rejects empty coordinate inputs gracefully', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const applyBtn = screen.getByTestId('endpoint-start-apply');
      fireEvent.click(applyBtn);

      expect(setEndpointMock).not.toHaveBeenCalled();
      const error = screen.getByTestId('endpoint-start-error');
      expect(error.textContent).toContain('Both East and North coordinates are required');
    });

    it('rejects non-numeric inputs', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(eastInput, { target: { value: 'abc' } });
      fireEvent.change(northInput, { target: { value: '65.0' } });
      fireEvent.click(applyBtn);

      expect(setEndpointMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('endpoint-start-error').textContent).toContain('valid finite numbers');
    });

    it('rejects coordinates west of grid extent (< 0)', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(eastInput, { target: { value: '-5' } });
      fireEvent.change(northInput, { target: { value: '65' } });
      fireEvent.click(applyBtn);

      expect(setEndpointMock).not.toHaveBeenCalled();
      const err = screen.getByTestId('endpoint-start-error');
      expect(err.textContent).toContain('outside extent (west limit is 0 m)');
    });

    it('rejects coordinates on or beyond eastern boundary (>= 200 m)', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(eastInput, { target: { value: '200' } });
      fireEvent.change(northInput, { target: { value: '65' } });
      fireEvent.click(applyBtn);

      expect(setEndpointMock).not.toHaveBeenCalled();
      const err = screen.getByTestId('endpoint-start-error');
      expect(err.textContent).toContain('outside extent (east limit is 200 m; outer boundary is excluded)');
    });

    it('rejects coordinates on or beyond southern boundary (<= 0 m)', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(eastInput, { target: { value: '50' } });
      fireEvent.change(northInput, { target: { value: '0' } });
      fireEvent.click(applyBtn);

      expect(setEndpointMock).not.toHaveBeenCalled();
      const err = screen.getByTestId('endpoint-start-error');
      expect(err.textContent).toContain('outside extent (south limit is 0 m; outer boundary is excluded)');
    });

    it('rejects coordinates north of grid extent (> 120 m)', () => {
      render(<EndpointsFeature {...defaultProps} />);

      const eastInput = screen.getByTestId('endpoint-start-east');
      const northInput = screen.getByTestId('endpoint-start-north');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(eastInput, { target: { value: '50' } });
      fireEvent.change(northInput, { target: { value: '125' } });
      fireEvent.click(applyBtn);

      expect(setEndpointMock).not.toHaveBeenCalled();
      const err = screen.getByTestId('endpoint-start-error');
      expect(err.textContent).toContain('outside extent (north limit is 120 m)');
    });

    it('preserves previous endpoint when invalid input is submitted', () => {
      render(
        <EndpointsFeature
          {...defaultProps}
          start={{ point: { east_m: 25, north_m: 65 }, poiId: null }}
        />,
      );

      const eastInput = screen.getByTestId('endpoint-start-east');
      const applyBtn = screen.getByTestId('endpoint-start-apply');

      // Attempt invalid change
      fireEvent.change(eastInput, { target: { value: '999' } });
      fireEvent.click(applyBtn);

      // setEndpoint is NOT called with invalid point
      expect(setEndpointMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('endpoint-start-error')).toBeTruthy();
      // Current endpoint feedback is preserved
      expect(screen.getByTestId('endpoint-start-requested-pos').textContent).toContain('25.00');
    });
  });

  describe('Snapped cell-center resolution feedback', () => {
    it('shows requested position, accepted cell center, cell row/col, and offset', () => {
      // Requested point: East 27.5 m, North 62.0 m
      // Row = Math.floor((120 - 62) / 10) = 5
      // Col = Math.floor((27.5 - 0) / 10) = 2
      // Center = (0 + 2.5 * 10, 120 - 5.5 * 10) = (25, 65)
      // Offset = hypot(2.5, -3) = ~3.91 m
      render(
        <EndpointsFeature
          {...defaultProps}
          start={{ point: { east_m: 27.5, north_m: 62.0 }, poiId: null }}
        />,
      );

      const feedback = screen.getByTestId('endpoint-start-feedback');
      expect(screen.getByTestId('endpoint-start-requested-pos').textContent).toContain('East 27.50 m, North 62.00 m');
      expect(screen.getByTestId('endpoint-start-cell-center').textContent).toContain('East 25.00 m, North 65.00 m');
      expect(screen.getByTestId('endpoint-start-cell-indices').textContent).toContain('Row 5, Col 2 (Index 102)');
      expect(feedback.textContent).toContain('3.91 m offset from center');

      // Snap button should be visible
      const snapBtn = screen.getByTestId('endpoint-start-snap');
      expect(snapBtn).toBeTruthy();

      fireEvent.click(snapBtn);
      expect(setEndpointMock).toHaveBeenCalledWith('start', { east_m: 25, north_m: 65 }, null);
    });

    it('indicates exact alignment when point is already at cell center', () => {
      render(
        <EndpointsFeature
          {...defaultProps}
          start={{ point: { east_m: 25, north_m: 65 }, poiId: null }}
        />,
      );

      const feedback = screen.getByTestId('endpoint-start-feedback');
      expect(feedback.textContent).toContain('Aligned with cell center (0.00 m offset)');
      // Snap button not needed when already aligned
      expect(screen.queryByTestId('endpoint-start-snap')).toBeNull();
    });
  });

  describe('Preset indicators and clearing', () => {
    it('displays preset badge when poiId is present', () => {
      render(
        <EndpointsFeature
          {...defaultProps}
          start={{ point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' }}
        />,
      );

      const presetBadge = screen.getByTestId('endpoint-start-preset-badge');
      expect(presetBadge.textContent).toBe('Preset: syn-outpost');
    });

    it('clears an endpoint when clicking Clear', () => {
      render(
        <EndpointsFeature
          {...defaultProps}
          start={{ point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' }}
        />,
      );

      const clearBtn = screen.getByTestId('endpoint-start-clear');
      fireEvent.click(clearBtn);

      expect(setEndpointMock).toHaveBeenCalledWith('start', null, null);
    });
  });

  describe('Swapping endpoints', () => {
    it('swaps start and destination when swap button is clicked', () => {
      render(
        <EndpointsFeature
          {...defaultProps}
          start={{ point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' }}
          destination={{ point: { east_m: 175, north_m: 65 }, poiId: 'syn-east-bench' }}
        />,
      );

      const swapBtn = screen.getByTestId('swap-endpoints');
      expect((swapBtn as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(swapBtn);

      expect(setEndpointMock).toHaveBeenCalledWith('start', { east_m: 175, north_m: 65 }, 'syn-east-bench');
      expect(setEndpointMock).toHaveBeenCalledWith('destination', { east_m: 25, north_m: 65 }, 'syn-outpost');
    });
  });

  describe('Entry module specification & FeatureHarness isolation', () => {
    it('entry satisfies FeatureModule contract', () => {
      expect(entry.id).toBe('endpoints');
      expect(entry.slot).toBe('endpoints');
      expect(typeof entry.Component).toBe('function');
    });

    it('mounts in isolation inside FeatureHarness with default props', () => {
      render(
        <FeatureHarness
          feature={entry}
          props={defaultProps}
        />,
      );

      expect(screen.getByTestId('feature-harness')).toBeTruthy();
      expect(screen.getByTestId('pick-mode-toggle')).toBeTruthy();
      expect(screen.getByTestId('endpoint-card-start')).toBeTruthy();
      expect(screen.getByTestId('endpoint-card-destination')).toBeTruthy();
    });

    it('mounts inside the full App shell replacing slot fallback without regressions', async () => {
      const syntheticBundle = {
        manifestUrl: '/bundles/test/manifest.json',
        manifest: {
          schema: 'mars-pathfinder/region-bundle' as const,
          schemaVersion: '1.0',
          bundleId: 'synthetic-v0',
          bundleVersion: 'synthetic-v0.1.0',
          datasetVersion: 'synthetic-fixture',
          synthetic: true,
          title: 'SYNTHETIC FIXTURE',
          description: 'Synthetic test grid',
          createdDate: '2026-11-14',
          crs: {
            description: 'Synthetic frame',
            body: 'synthetic' as const,
            sourceCrs: null,
            localOriginInSource: null,
            verticalReference: 'datum',
            horizontalUnits: 'm' as const,
            verticalUnits: 'm' as const,
          },
          grid: mockGrid,
          layers: {} as Record<RasterLayerId, RasterLayerDescriptor>,
          pointsOfInterest: [],
          sources: [],
          qualityClasses: [],
          displayAssets: [],
          strictQualitySupported: true,
          limitations: [],
          processing: { script: 'make-fixture.mjs', parameters: {} },
        },
        bundleVersion: 'synthetic-v0.1.0',
        width: 20,
        height: 12,
        hashesVerified: true,
        elevation: new Float32Array(240),
        slope: new Float32Array(240),
        roughness: new Float32Array(240),
        quality: new Uint8Array(240),
        exclusion: new Uint8Array(240),
      };

      render(
        <FeatureHarness
          feature={entry}
          mountInApp={true}
          initialBundle={syntheticBundle}
        />,
      );

      // Verify that the custom endpoints feature is mounted in the App shell
      expect(screen.getByTestId('endpoint-card-start')).toBeTruthy();
      expect(screen.getByTestId('endpoint-card-destination')).toBeTruthy();
      expect(screen.getByTestId('swap-endpoints')).toBeTruthy();

      // Enter start coordinates via the form in the live app
      const startEast = screen.getByTestId('endpoint-start-east');
      const startNorth = screen.getByTestId('endpoint-start-north');
      const startApply = screen.getByTestId('endpoint-start-apply');

      fireEvent.change(startEast, { target: { value: '25' } });
      fireEvent.change(startNorth, { target: { value: '65' } });
      fireEvent.click(startApply);

      // Feedback confirms state update
      expect(screen.getByTestId('endpoint-start-requested-pos').textContent).toContain('25.00');
      expect(screen.getByTestId('endpoint-start-cell-center').textContent).toContain('25.00');
    });
  });
});
