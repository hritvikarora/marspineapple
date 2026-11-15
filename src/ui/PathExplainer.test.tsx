// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathExplainer } from './PathExplainer';
import type { SearchTraceResult } from '../routing/searchTrace';

afterEach(() => {
  cleanup();
});

const mockTrace: SearchTraceResult = {
  policy: 'shortest-feasible',
  selectedCandidateId: 'c0',
  frames: [
    {
      step: 0,
      policy: 'shortest-feasible',
      closedCells: [1, 2],
      frontierCells: [3, 4],
      currentBestCells: [1, 2],
      currentBestCost: 12,
      exploredCount: 42,
      openSize: 9,
      note: 'Expanding rim bypass frontier',
    },
    {
      step: 1,
      policy: 'shortest-feasible',
      closedCells: [5, 6],
      frontierCells: [7],
      currentBestCells: [1, 5, 6],
      currentBestCost: 24,
      exploredCount: 118,
      openSize: 4,
      note: 'Destination reached',
    },
  ],
  comparison: {
    policy: 'shortest-feasible',
    astar: {
      algorithm: 'astar',
      exploredNodes: 118,
      pathCellCount: 40,
      weightedCost: 48.2,
      horizontalDistance_m: 185,
      computeMs: 1.4,
      skipped: false,
      notice: null,
    },
    dijkstra: {
      algorithm: 'dijkstra',
      exploredNodes: 512,
      pathCellCount: 40,
      weightedCost: 48.2,
      horizontalDistance_m: 185,
      computeMs: 5.1,
      skipped: false,
      notice: null,
    },
    greedyBestFirst: {
      algorithm: 'greedy-best-first',
      exploredNodes: 60,
      pathCellCount: 44,
      weightedCost: 54.0,
      horizontalDistance_m: 192,
      computeMs: 0.9,
      skipped: false,
      notice: null,
    },
    nodeReductionFactor: 4.34,
    optimalCostMatch: true,
  },
  rejectedPaths: [
    {
      id: 'straight-line',
      label: 'Straight line',
      category: 'rough-terrain',
      reason: 'Crosses 34° crater wall slope above suit limit.',
      metricsDelta: {
        distanceDelta_m: -32,
        maxSlope_deg: 34,
        unknownLengthDelta_m: 0,
        costRatio: 1.4,
      },
      path: [
        { east_m: 0, north_m: 0, elevation_m: 0 },
        { east_m: 100, north_m: 0, elevation_m: 0 },
      ],
      colorHex: '#ffb37a',
    },
  ],
  thinkingSteps: [
    {
      index: 0,
      phase: 'endpoints',
      title: 'Lock start and destination',
      formula: '(east_m, north_m)',
      detail: 'Mapped start outpost and science target onto 1m grid.',
    },
    {
      index: 1,
      phase: 'policy-eval',
      title: 'Evaluate A* heuristic',
      formula: 'f(n) = g(n) + h(n)',
      detail: 'Balanced traverse effort against Euclidean goal estimate.',
    },
  ],
  sampledNotice: 'Trace sampled for smooth UI playback.',
};

describe('PathExplainer', () => {
  it('renders idle visual guide before any route is requested', () => {
    render(
      <PathExplainer
        run={{ kind: 'idle' }}
        isStale={false}
        selectedCandidate={null}
        traceResult={null}
        activeFrame={null}
        playhead={1}
        isPlaying={false}
        reducedMotion={false}
        onPlayPause={vi.fn()}
        onReplay={vi.fn()}
        onScrub={vi.fn()}
      />,
    );

    expect(screen.getByTestId('path-explainer')).toBeTruthy();
    expect(screen.getByText(/Sample HiRISE terrain/)).toBeTruthy();
    expect(screen.getByText('f(n) = g(n) + h(n)')).toBeTruthy();
  });

  it('shows live wavefront metrics, animated step cards, straight-line rejection, and controls on success', () => {
    const onPlayPause = vi.fn();
    const onReplay = vi.fn();
    const onScrub = vi.fn();

    render(
      <PathExplainer
        run={{
          kind: 'finished',
          response: {
            status: 'success',
            requestId: 'r1',
            candidates: [],
            computeMs: 2,
          } as never,
        }}
        isStale={false}
        selectedCandidate={null}
        traceResult={mockTrace}
        activeFrame={mockTrace.frames[0]!}
        playhead={0.45}
        isPlaying
        reducedMotion={false}
        onPlayPause={onPlayPause}
        onReplay={onReplay}
        onScrub={onScrub}
      />,
    );

    expect(screen.getByTestId('explainer-explored').textContent).toContain('42');
    expect(screen.getByText('4.3× fewer')).toBeTruthy();
    expect(screen.getByTestId('explainer-wave-note').textContent).toContain('Expanding rim bypass frontier');
    expect(screen.getByTestId('explainer-rejected').textContent).toContain('Crosses 34° crater wall slope');
    expect(screen.getByTestId('explainer-rejected').textContent).toContain('34.0°');
    expect(screen.getByTestId('explainer-rejected').textContent).toContain('Blocked / rough');

    fireEvent.click(screen.getByTestId('explainer-play-pause'));
    expect(onPlayPause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('explainer-replay'));
    expect(onReplay).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Replay A* path calculation'), { target: { value: '80' } });
    expect(onScrub).toHaveBeenCalledWith(0.8);
  });

  it('notes timeout is not proof of no path', () => {
    render(
      <PathExplainer
        run={{
          kind: 'finished',
          response: {
            status: 'timeout',
            requestId: 'r2',
            message: 'Budget reached at 50000 expansions.',
          } as never,
        }}
        isStale={false}
        selectedCandidate={null}
        traceResult={null}
        activeFrame={null}
        playhead={1}
        isPlaying={false}
        reducedMotion
        onPlayPause={vi.fn()}
        onReplay={vi.fn()}
        onScrub={vi.fn()}
      />,
    );

    expect(screen.getByText(/timeout is not proof that no path exists/i)).toBeTruthy();
  });

  it('renders code expressions from trace as clean mathematical formulas', () => {
    const codeTrace: SearchTraceResult = {
      ...mockTrace,
      thinkingSteps: [
        {
          index: 0,
          phase: 'endpoints',
          title: 'Place endpoints',
          formula: 'index = row * width + col',
          detail: 'Mapped grid index.',
        },
        {
          index: 1,
          phase: 'policy-eval',
          title: 'Price each step',
          formula: 'stepLen * (1 + slopeWeight * sNorm + roughnessWeight * rNorm + qualityWeight * qPen)',
          detail: 'Weighted traverse.',
        },
      ],
    };

    const { container } = render(
      <PathExplainer
        run={{
          kind: 'finished',
          response: { status: 'success', requestId: 'r3', candidates: [], computeMs: 1 } as never,
        }}
        isStale={false}
        selectedCandidate={null}
        traceResult={codeTrace}
        activeFrame={codeTrace.frames[0]!}
        playhead={0.2}
        isPlaying={false}
        reducedMotion={false}
        onPlayPause={vi.fn()}
        onReplay={vi.fn()}
        onScrub={vi.fn()}
      />,
    );

    const mathNodes = Array.from(container.querySelectorAll('.pe-formula-math')).map((n) => n.textContent ?? '');
    expect(mathNodes.join(' | ')).toContain('i = r · W + c');
    expect(mathNodes.join(' | ')).toContain('Δg = Δs ·');
    expect(mathNodes.join(' | ')).not.toContain('slopeWeight');
    expect(mathNodes.join(' | ')).not.toContain('row * width');
  });
});
