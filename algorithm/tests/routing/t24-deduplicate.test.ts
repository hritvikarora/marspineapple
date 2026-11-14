import { describe, it, expect } from 'vitest';
import {
  areCellPathsIdentical,
  deduplicatePolicyPaths,
} from '../../src/routing/deduplicate.js';
import type { SinglePolicySolveResult } from '../../src/routing/types.js';

function makeResult(cellIndices: number[]): SinglePolicySolveResult {
  return {
    status: 'success',
    cellIndices,
    totalCost: cellIndices.length,
    exploredNodes: cellIndices.length,
  };
}

describe('T24: deduplicatePolicyPaths', () => {
  it('checks cell path equality accurately', () => {
    expect(areCellPathsIdentical([0, 1, 2], [0, 1, 2])).toBe(true);
    expect(areCellPathsIdentical([0, 1, 2], [0, 2, 1])).toBe(false);
    expect(areCellPathsIdentical([0, 1], [0, 1, 2])).toBe(false);
  });

  it('classifies all 5 three-policy equivalence topologies', () => {
    const all3 = ['shortest', 'terrain', 'uncertainty'] as const;

    // case 1: all three merged
    const c1 = deduplicatePolicyPaths([...all3], {
      shortest: makeResult([0, 1, 2]),
      terrain: makeResult([0, 1, 2]),
      uncertainty: makeResult([0, 1, 2]),
    });
    expect(c1.equivalenceTopology).toBe('case_1_all_three_merged');
    expect(c1.groups).toHaveLength(1);
    expect(c1.groups[0].matchedPolicies).toEqual(['shortest', 'terrain', 'uncertainty']);

    // case 2: terrain + uncertainty merged
    const c2 = deduplicatePolicyPaths([...all3], {
      shortest: makeResult([0, 1, 2]),
      terrain: makeResult([0, 3, 2]),
      uncertainty: makeResult([0, 3, 2]),
    });
    expect(c2.equivalenceTopology).toBe('case_2_terrain_uncertainty_merged');
    expect(c2.groups).toHaveLength(2);

    // case 3: shortest + terrain merged
    const c3 = deduplicatePolicyPaths([...all3], {
      shortest: makeResult([0, 1, 2]),
      terrain: makeResult([0, 1, 2]),
      uncertainty: makeResult([0, 4, 2]),
    });
    expect(c3.equivalenceTopology).toBe('case_3_shortest_terrain_merged');
    expect(c3.groups).toHaveLength(2);

    // case 4: shortest + uncertainty merged
    const c4 = deduplicatePolicyPaths([...all3], {
      shortest: makeResult([0, 1, 2]),
      terrain: makeResult([0, 5, 2]),
      uncertainty: makeResult([0, 1, 2]),
    });
    expect(c4.equivalenceTopology).toBe('case_4_shortest_uncertainty_merged');
    expect(c4.groups).toHaveLength(2);

    // case 5: all three distinct
    const c5 = deduplicatePolicyPaths([...all3], {
      shortest: makeResult([0, 1, 2]),
      terrain: makeResult([0, 3, 2]),
      uncertainty: makeResult([0, 4, 2]),
    });
    expect(c5.equivalenceTopology).toBe('case_5_all_three_distinct');
    expect(c5.groups).toHaveLength(3);
  });

  it('Finding 7: returns subset_request and only requested policies for subset requests', () => {
    const res = deduplicatePolicyPaths(['uncertainty'], {
      uncertainty: makeResult([0, 4, 2]),
      terrain: makeResult([0, 4, 2]), // unrequested, must not be injected
    });
    expect(res.equivalenceTopology).toBe('subset_request');
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].matchedPolicies).toEqual(['uncertainty']);
    expect(res.groups[0].primaryPolicy).toBe('uncertainty');
  });
});
