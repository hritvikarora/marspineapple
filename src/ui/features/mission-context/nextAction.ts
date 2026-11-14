/**
 * Mission Next Action Computation. OWNER: Dhani (TASK-002).
 * Determines the next recommended mission planning action based on active inputs and route run state.
 */
import type { MissionInputs, RouteRunState } from '../../../state/store';

export interface NextActionInfo {
  step: number;
  action: string;
  instruction: string;
  status: string;
}

export function computeNextAction(
  mission?: MissionInputs,
  routeRun?: RouteRunState,
  isStale = false,
): NextActionInfo {
  // If actively calculating, surface progress
  if (routeRun?.kind === 'running') {
    return {
      step: 4,
      action: 'Solving Traverse...',
      instruction: `Searching viable traverse paths across terrain grid (${routeRun.exploredNodes} nodes explored)...`,
      status: 'calculating',
    };
  }

  // If a calculation completed and has not been invalidated
  if (routeRun?.kind === 'finished') {
    if (isStale) {
      return {
        step: 4,
        action: 'Update Traverse (Inputs Changed)',
        instruction:
          'Mission inputs have changed since last calculation. Click "Update route" to refresh candidates.',
        status: 'stale',
      };
    }

    const resp = routeRun.response;
    if (resp.status === 'success') {
      return {
        step: 5,
        action: 'Review Candidate Routes',
        instruction: `${resp.candidates.length} candidate path(s) computed. Inspect routes on the 2D/3D map, elevation profile, or compare metrics.`,
        status: 'completed',
      };
    }

    if (resp.status === 'no-path') {
      return {
        step: 4,
        action: 'No Path Found — Adjust Parameters',
        instruction: `No traversable path found (${resp.message || resp.reason}). Try relaxing strict quality or choosing an alternate destination.`,
        status: 'no-path',
      };
    }

    if (resp.status === 'invalid-input') {
      return {
        step: 4,
        action: 'Invalid Input — Verify Coordinates',
        instruction: `Input rejected (${resp.message || resp.reason}). Ensure start and destination locations are inside valid terrain bounds.`,
        status: 'invalid-input',
      };
    }

    if (resp.status === 'timeout') {
      return {
        step: 4,
        action: 'Solver Timeout — Retry Traverse',
        instruction: `Traverse solver exceeded time limit (${resp.limitMs} ms). Retry or select a closer destination.`,
        status: 'timeout',
      };
    }

    if (resp.status === 'cancelled') {
      return {
        step: 4,
        action: 'Traverse Cancelled',
        instruction: 'Previous traverse calculation was cancelled. Click "Calculate route" to start again.',
        status: 'cancelled',
      };
    }

    if (resp.status === 'data-error') {
      return {
        step: 4,
        action: 'Data Error Occurred',
        instruction: `Traverse engine encountered a data error (${resp.message || resp.stage}). Check bundle integrity.`,
        status: 'data-error',
      };
    }

    return {
      step: 4,
      action: 'Calculation Ended',
      instruction: 'Review mission settings and click "Calculate route" to retry.',
      status: 'finished-other',
    };
  }

  // Otherwise, guide through input setup
  if (!mission?.start) {
    return {
      step: 1,
      action: 'Choose Mission Start Location',
      instruction:
        'Select an expedition start point (choose the fictional outpost preset or click on the terrain map).',
      status: 'pending-start',
    };
  }

  if (!mission?.destination) {
    return {
      step: 2,
      action: 'Select Science Destination',
      instruction:
        'Choose a science destination preset or pick target coordinates on the terrain map.',
      status: 'pending-destination',
    };
  }

  if (!mission.policies || mission.policies.length === 0) {
    return {
      step: 3,
      action: 'Select Routing Policies',
      instruction:
        'Select at least one routing policy (e.g. Shortest Feasible, Terrain-Aware, or Uncertainty-Aware).',
      status: 'pending-policies',
    };
  }

  return {
    step: 4,
    action: 'Calculate Traverse',
    instruction:
      'Mission parameters configured. Click "Calculate route" to compute terrain-aware traverse candidates.',
    status: 'ready-to-calculate',
  };
}
