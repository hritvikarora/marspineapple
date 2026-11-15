// @vitest-environment jsdom
/**
 * Test Suite for TASK-002: Mission Context & Initial Guidance. OWNER: Dhani.
 * Verifies title, educational simulation disclaimer, synthetic data warnings,
 * fictional outpost labeling, dynamic next action guidance, long-text wrapping,
 * and isolated mounting via FeatureHarness with all other 19 leaves absent.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RegionManifest, ReleaseId } from '../../../contracts';
import { AppStateProvider } from '../../../state/AppStateProvider';
import { FeatureHarness } from '../../shared/FeatureHarness';
import { MissionContext } from './MissionContext';
import entry from './entry';
import { computeNextAction } from './nextAction';

afterEach(() => {
  cleanup();
});

const sampleRelease: ReleaseId = {
  appVersion: '0.1.0',
  bundleVersion: 'synthetic-v0.1.0',
  modelVersion: 'placeholder-astar-0.1.0',
};

const baseManifest: RegionManifest = {
  schema: 'mars-pathfinder/region-bundle',
  schemaVersion: '1.0',
  bundleId: 'synthetic-v0',
  bundleVersion: 'synthetic-v0.1.0',
  datasetVersion: 'synthetic-fixture-2026-11-14',
  synthetic: true,
  title: 'SYNTHETIC FIXTURE - not Mars data',
  description:
    'Hand-inspectable 20x12 synthetic grid for development and automated tests. Contains a ridge with two gaps.',
  createdDate: '2026-11-14',
  crs: {
    description: 'Synthetic local planar frame',
    body: 'synthetic',
    sourceCrs: null,
    localOriginInSource: null,
    verticalReference: 'synthetic datum (values mimic Jezero-like negative heights)',
    horizontalUnits: 'm',
    verticalUnits: 'm',
  },
  grid: {
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
  },
  layers: {
    elevation: {
      file: 'elevation.f32',
      dtype: 'float32',
      byteOrder: 'little-endian',
      units: 'm',
      nodata: 'NaN',
      definition: 'Synthetic analytic surface.',
      byteLength: 960,
      sha256: 'abc',
    },
    slope: {
      file: 'slope.f32',
      dtype: 'float32',
      byteOrder: 'little-endian',
      units: 'deg',
      nodata: 'NaN',
      definition: 'atan(|grad z|)',
      byteLength: 960,
      sha256: 'def',
    },
    roughness: {
      file: 'roughness.f32',
      dtype: 'float32',
      byteOrder: 'little-endian',
      units: 'm',
      nodata: 'NaN',
      definition: 'RMS residual',
      byteLength: 960,
      sha256: 'ghi',
    },
    quality: {
      file: 'quality.u8',
      dtype: 'uint8',
      byteOrder: 'little-endian',
      units: 'class-code',
      nodata: 0,
      definition: 'Quality codes',
      byteLength: 240,
      sha256: 'jkl',
    },
    exclusion: {
      file: 'exclusion.u8',
      dtype: 'uint8',
      byteOrder: 'little-endian',
      units: 'class-code',
      nodata: null,
      definition: 'Exclusion codes',
      byteLength: 240,
      sha256: 'mno',
    },
  },
  qualityClasses: [
    { code: 0, key: 'no-elevation', label: 'No elevation', sourceCategories: ['synthetic:nodata'] },
    { code: 1, key: 'good', label: 'Good quality', sourceCategories: ['synthetic:good'] },
  ],
  strictQualitySupported: true,
  pointsOfInterest: [
    {
      id: 'syn-outpost',
      name: 'Synthetic outpost',
      kind: 'outpost',
      position: { east_m: 25, north_m: 65 },
      purpose: 'Start point for synthetic missions.',
      officialName: false,
      positionalUncertainty_m: null,
      sourceIds: ['synthetic-generator'],
      synthetic: true,
    },
    {
      id: 'syn-east-bench',
      name: 'East bench',
      kind: 'science-stop',
      position: { east_m: 175, north_m: 65 },
      purpose: 'Destination across the ridge.',
      officialName: false,
      positionalUncertainty_m: null,
      sourceIds: ['synthetic-generator'],
      synthetic: true,
    },
  ],
  displayAssets: [],
  sources: [
    {
      id: 'synthetic-generator',
      mission: 'none',
      instrument: 'none',
      title: 'scripts/make-fixture.mjs',
      creator: 'MARS PATHFINDER team',
      url: '',
      version: '0.1.0',
      rights: 'Team-generated',
      usedFor: 'Development',
    },
  ],
  limitations: ['SYNTHETIC: not derived from NASA observation.'],
  processing: {
    script: 'scripts/make-fixture.mjs',
    parameters: { width: 20, height: 12 },
  },
};

describe('TASK-002: Feature entry module', () => {
  it('exports a valid feature module with required id and slot', () => {
    expect(entry.id).toBe('mission-context');
    expect(entry.slot).toBe('mission-context');
    expect(typeof entry.Component).toBe('function');
  });
});

describe('TASK-002: MissionContext Component — Disclaimers and Labels', () => {
  it('renders region title and educational simulation disclaimer', () => {
    render(<MissionContext manifest={baseManifest} release={sampleRelease} production={false} />);

    expect(screen.getByRole('heading', { level: 2, name: /SYNTHETIC FIXTURE - not Mars data/i })).toBeTruthy();
    const disclaimer = screen.getByTestId('mission-context-simulation-disclaimer');
    expect(disclaimer.textContent).toContain('Educational Simulation:');
    expect(disclaimer.textContent).toContain('Not an operational navigation system');
  });

  it('renders synthetic test warning and badge when manifest.synthetic is true', () => {
    render(<MissionContext manifest={baseManifest} release={sampleRelease} production={false} />);

    expect(screen.getByTestId('mission-context-synthetic-badge').textContent).toContain('Synthetic Fixture');
    const warning = screen.getByTestId('mission-context-synthetic-warning');
    expect(warning.textContent).toContain('Synthetic Test Data:');
    expect(warning.textContent).toContain('artificial test fixture');
  });

  it('does NOT render synthetic warning or badge when manifest.synthetic is false', () => {
    const realManifest: RegionManifest = {
      ...baseManifest,
      synthetic: false,
      title: 'Jezero Crater - Western Delta',
    };
    render(<MissionContext manifest={realManifest} release={sampleRelease} production={false} />);

    expect(screen.queryByTestId('mission-context-synthetic-badge')).toBeNull();
    expect(screen.queryByTestId('mission-context-synthetic-warning')).toBeNull();
  });

  it('renders a prominent production warning when production is true and bundle is synthetic', () => {
    render(<MissionContext manifest={baseManifest} release={sampleRelease} production={true} />);

    const prodAlert = screen.getByTestId('mission-context-production-warning');
    expect(prodAlert.textContent).toContain('Production Warning:');
    expect(prodAlert.textContent).toContain('synthetic test data');
  });

  it('does NOT render production warning if production is false, even if bundle is synthetic', () => {
    render(<MissionContext manifest={baseManifest} release={sampleRelease} production={false} />);
    expect(screen.queryByTestId('mission-context-production-warning')).toBeNull();
  });

  it('does NOT render production warning if bundle is real Mars data even in production', () => {
    const realManifest: RegionManifest = { ...baseManifest, synthetic: false };
    render(<MissionContext manifest={realManifest} release={sampleRelease} production={true} />);
    expect(screen.queryByTestId('mission-context-production-warning')).toBeNull();
  });

  it('clearly identifies and labels fictional outposts', () => {
    render(<MissionContext manifest={baseManifest} release={sampleRelease} production={false} />);

    const outpostNotice = screen.getByTestId('mission-context-fictional-outpost');
    expect(outpostNotice.textContent).toContain('Fictional Outpost:');
    expect(outpostNotice.textContent).toContain('Synthetic outpost');
    expect(outpostNotice.textContent).toContain('Start point for synthetic missions');
  });

  it('provides generic fictional base notice when no explicit outpost POIs exist in manifest', () => {
    const noOutpostManifest: RegionManifest = {
      ...baseManifest,
      pointsOfInterest: baseManifest.pointsOfInterest.filter((p) => p.kind !== 'outpost'),
    };
    render(<MissionContext manifest={noOutpostManifest} release={sampleRelease} production={false} />);

    const outpostNotice = screen.getByTestId('mission-context-fictional-outpost');
    expect(outpostNotice.textContent).toContain('Fictional Outpost:');
    expect(outpostNotice.textContent).toContain('Mission Start Point');
  });
});

describe('TASK-002: Dynamic Next Action & Guidance Workflow', () => {
  it('computes Step 1 next action when mission start is unset', () => {
    const next = computeNextAction(
      {
        start: null,
        destination: null,
        policies: ['shortest-feasible'],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      { kind: 'idle' },
    );
    expect(next.step).toBe(1);
    expect(next.action).toContain('Choose Mission Start Location');
    expect(next.instruction).toContain('fictional outpost');
  });

  it('computes Step 2 next action when start is set but destination is unset', () => {
    const next = computeNextAction(
      {
        start: { point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' },
        destination: null,
        policies: ['shortest-feasible'],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      { kind: 'idle' },
    );
    expect(next.step).toBe(2);
    expect(next.action).toContain('Select Science Destination');
    expect(next.instruction).toContain('science destination preset');
  });

  it('computes Step 3 next action when endpoints are set but policies are empty', () => {
    const next = computeNextAction(
      {
        start: { point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' },
        destination: { point: { east_m: 175, north_m: 65 }, poiId: 'syn-east-bench' },
        policies: [],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      { kind: 'idle' },
    );
    expect(next.step).toBe(3);
    expect(next.action).toContain('Select Routing Policies');
  });

  it('computes Step 4 ready-to-calculate action when mission inputs are fully configured', () => {
    const next = computeNextAction(
      {
        start: { point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' },
        destination: { point: { east_m: 175, north_m: 65 }, poiId: 'syn-east-bench' },
        policies: ['shortest-feasible', 'uncertainty-aware'],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      { kind: 'idle' },
    );
    expect(next.step).toBe(4);
    expect(next.action).toContain('Calculate Traverse');
    expect(next.instruction).toContain('Click "Calculate route"');
  });

  it('reflects active running state during traverse computation', () => {
    const next = computeNextAction(
      {
        start: { point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' },
        destination: { point: { east_m: 175, north_m: 65 }, poiId: 'syn-east-bench' },
        policies: ['shortest-feasible'],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      { kind: 'running', requestId: 'req-1', exploredNodes: 42 },
    );
    expect(next.step).toBe(4);
    expect(next.action).toContain('Solving Traverse...');
    expect(next.instruction).toContain('42 nodes explored');
  });

  it('computes Step 5 review action upon route run success', () => {
    const next = computeNextAction(
      {
        start: { point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' },
        destination: { point: { east_m: 175, north_m: 65 }, poiId: 'syn-east-bench' },
        policies: ['shortest-feasible'],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      {
        kind: 'finished',
        response: {
          requestId: 'req-1',
          bundleVersion: 'synthetic-v0.1.0',
          modelVersion: 'placeholder-astar-0.1.0',
          status: 'success',
          start: { requested: { east_m: 25, north_m: 65 }, cell: { row: 5, col: 2, index: 102 }, accepted: { east_m: 25, north_m: 65 } },
          destination: { requested: { east_m: 175, north_m: 65 }, cell: { row: 5, col: 17, index: 117 }, accepted: { east_m: 175, north_m: 65 } },
          candidates: [
            {
              candidateId: 'cand-1',
              policies: ['shortest-feasible'],
              outbound: {
                cells: [],
                path: [],
                metrics: {
                  horizontalDistance_m: 150,
                  surfaceDistance_m: 151,
                  ascent_m: 10,
                  descent_m: 5,
                  maxTerrainSlope_deg: 8,
                  maxAbsEdgeGrade_deg: 7,
                  lowQualityLength_m: 0,
                  lowQualityPct: 0,
                  unknownQualityLength_m: 0,
                  unknownQualityPct: 0,
                  cellCount: 16,
                },
                qualityIntervals: [],
                profile: { distance_m: [], elevation_m: [], pathIndex: [] },
                weightedCost: { value: 150, units: 'weighted-cost' },
              },
              returnLeg: null,
              missionStatus: 'one-way',
              explanation: ['Shortest route'],
            },
          ],
          computeMs: 12,
        },
      },
      false,
    );
    expect(next.step).toBe(5);
    expect(next.action).toContain('Review Candidate Routes');
    expect(next.instruction).toContain('1 candidate path(s) computed');
  });

  it('indicates stale inputs when settings change after computation', () => {
    const next = computeNextAction(
      {
        start: { point: { east_m: 25, north_m: 65 }, poiId: 'syn-outpost' },
        destination: { point: { east_m: 175, north_m: 65 }, poiId: 'syn-east-bench' },
        policies: ['shortest-feasible'],
        weightOverrides: {},
        strictQuality: false,
        roundTrip: false,
        modelVersion: 'placeholder-astar-0.1.0',
      },
      {
        kind: 'finished',
        response: {
          requestId: 'req-1',
          bundleVersion: 'synthetic-v0.1.0',
          modelVersion: 'placeholder-astar-0.1.0',
          status: 'success',
          start: { requested: { east_m: 25, north_m: 65 }, cell: { row: 5, col: 2, index: 102 }, accepted: { east_m: 25, north_m: 65 } },
          destination: { requested: { east_m: 175, north_m: 65 }, cell: { row: 5, col: 17, index: 117 }, accepted: { east_m: 175, north_m: 65 } },
          candidates: [],
          computeMs: 10,
        },
      },
      true, // isStale
    );
    expect(next.step).toBe(4);
    expect(next.action).toContain('Update Traverse');
    expect(next.instruction).toContain('Mission inputs have changed');
  });

  it('handles no-path, timeout, and invalid-input responses with actionable instructions', () => {
    const noPath = computeNextAction(
      undefined,
      {
        kind: 'finished',
        response: {
          requestId: 'req-1',
          bundleVersion: 'synthetic-v0.1.0',
          modelVersion: 'placeholder-astar-0.1.0',
          status: 'no-path',
          reason: 'disconnected-under-limits',
          message: 'Sealed basin prevents traversal',
          start: { requested: { east_m: 25, north_m: 65 }, cell: { row: 5, col: 2, index: 102 }, accepted: { east_m: 25, north_m: 65 } },
          destination: { requested: { east_m: 175, north_m: 15 }, cell: { row: 10, col: 17, index: 217 }, accepted: { east_m: 175, north_m: 15 } },
          policies: ['shortest-feasible'],
        },
      },
    );
    expect(noPath.action).toContain('No Path Found');
    expect(noPath.instruction).toContain('Sealed basin prevents traversal');

    const timeout = computeNextAction(
      undefined,
      {
        kind: 'finished',
        response: {
          requestId: 'req-2',
          bundleVersion: 'synthetic-v0.1.0',
          modelVersion: 'placeholder-astar-0.1.0',
          status: 'timeout',
          limitMs: 5000,
          message: 'Time limit reached',
        },
      },
    );
    expect(timeout.action).toContain('Solver Timeout');
    expect(timeout.instruction).toContain('5000 ms');

    const invalid = computeNextAction(
      undefined,
      {
        kind: 'finished',
        response: {
          requestId: 'req-3',
          bundleVersion: 'synthetic-v0.1.0',
          modelVersion: 'placeholder-astar-0.1.0',
          status: 'invalid-input',
          reason: 'endpoint-outside-region',
          field: 'destination',
          message: 'Coordinate outside grid',
        },
      },
    );
    expect(invalid.action).toContain('Invalid Input');
    expect(invalid.instruction).toContain('Coordinate outside grid');
  });
});

describe('TASK-002: Text wrapping, accessibility and details disclosure', () => {
  it('wraps long text cleanly and renders without errors', () => {
    const longTitle = 'ExtremelyLongUnbrokenTitleIdentifierForMarsMissionSimulationTestingPurpose_'.repeat(3);
    const longDesc = 'A'.repeat(300) + ' ' + 'B'.repeat(300);
    const longManifest: RegionManifest = {
      ...baseManifest,
      title: longTitle,
      description: longDesc,
    };

    render(<MissionContext manifest={longManifest} release={sampleRelease} production={false} />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe(longTitle);
    expect(heading.className).toContain('mission-context-title');

    const desc = screen.getByText(longDesc);
    expect(desc.className).toContain('mission-context-desc');
  });

  it('renders region specs table inside details disclosure', () => {
    render(<MissionContext manifest={baseManifest} release={sampleRelease} production={false} />);

    expect(screen.getByText('Region & Terrain Context')).toBeTruthy();
    expect(screen.getByText('20 × 12 cells')).toBeTruthy();
    expect(screen.getByText('10 m × 10 m')).toBeTruthy();
    expect(screen.getByText(/East: \[0 m, 200 m\]/)).toBeTruthy();
    expect(screen.getByText(/North: \[0 m, 120 m\]/)).toBeTruthy();
    expect(screen.getByText('SYNTHETIC: not derived from NASA observation.')).toBeTruthy();
  });

  it('handles null/missing manifest gracefully without throwing', () => {
    render(
      <MissionContext
        manifest={null as unknown as RegionManifest}
        release={sampleRelease}
        production={false}
      />,
    );
    expect(screen.getByText(/No region data loaded/i)).toBeTruthy();
  });
});

describe('TASK-002: Mounting in FeatureHarness with all other leaves absent', () => {
  it('mounts cleanly in FeatureHarness direct mode', () => {
    render(
      <FeatureHarness
        feature={entry}
        props={{ manifest: baseManifest, release: sampleRelease, production: false }}
      />,
    );
    expect(screen.getByTestId('mission-context-panel')).toBeTruthy();
    expect(screen.getByTestId('mission-context-next-step')).toBeTruthy();
  });

  it('mounts in FeatureHarness mountInApp shell with all other 19 leaves absent', async () => {
    render(
      <AppStateProvider modelVersion="placeholder-astar-0.1.0">
        <FeatureHarness
          feature={entry}
          mountInApp={true}
          appDeps={{
            production: false,
            skipRegionLoader: true,
          }}
          initialBundle={{
            manifestUrl: '/bundles/test/manifest.json',
            manifest: baseManifest,
            bundleVersion: baseManifest.bundleVersion,
            width: baseManifest.grid.width,
            height: baseManifest.grid.height,
            elevation: new Float32Array(240),
            slope: new Float32Array(240),
            roughness: new Float32Array(240),
            quality: new Uint8Array(240),
            exclusion: new Uint8Array(240),
            hashesVerified: true,
          }}
        />
      </AppStateProvider>,
    );

    // The registered feature replaces the fallback in App
    expect(screen.getByTestId('mission-context-panel')).toBeTruthy();
    expect(screen.getByTestId('mission-context-next-step')).toBeTruthy();
    expect(screen.getByTestId('mission-context-simulation-disclaimer')).toBeTruthy();
    // Header testids preserved
    expect(screen.getByTestId('synthetic-badge')).toBeTruthy();
    expect(screen.getByTestId('release-id')).toBeTruthy();
  });
});
