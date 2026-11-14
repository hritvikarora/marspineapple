import type { EquivalenceTopology, PolicyId } from '../contracts/routing.js';
import type { SinglePolicySolveResult } from './types.js';

const CANONICAL_POLICY_ORDER: readonly PolicyId[] = ['shortest', 'terrain', 'uncertainty'];

export interface DeduplicatedPolicyGroup {
  candidateId: string;
  matchedPolicies: PolicyId[];
  primaryPolicy: PolicyId;
  solveResult: SinglePolicySolveResult;
}

export interface DeduplicationResult {
  groups: DeduplicatedPolicyGroup[];
  equivalenceTopology: EquivalenceTopology;
}

export function areCellPathsIdentical(pathA: number[], pathB: number[]): boolean {
  return pathA.length === pathB.length && pathA.every((v, i) => v === pathB[i]);
}

export function deduplicatePolicyPaths(
  requestedPolicies: PolicyId[],
  solvedByPolicy: Partial<Record<PolicyId, SinglePolicySolveResult>>
): DeduplicationResult {
  const requestedSet = new Set<PolicyId>(requestedPolicies);
  const activePolicies = CANONICAL_POLICY_ORDER.filter(
    (p) => requestedSet.has(p) && solvedByPolicy[p]?.status === 'success'
  );

  const groups: DeduplicatedPolicyGroup[] = [];
  for (const policy of activePolicies) {
    const result = solvedByPolicy[policy]!;
    const existing = groups.find((g) =>
      areCellPathsIdentical(g.solveResult.cellIndices, result.cellIndices)
    );
    if (existing) {
      existing.matchedPolicies.push(policy);
    } else {
      groups.push({
        candidateId: policy,
        matchedPolicies: [policy],
        primaryPolicy: policy,
        solveResult: result,
      });
    }
  }

  let equivalenceTopology: EquivalenceTopology = 'subset_request';
  if (
    activePolicies.length === 3 &&
    activePolicies[0] === 'shortest' &&
    activePolicies[1] === 'terrain' &&
    activePolicies[2] === 'uncertainty'
  ) {
    if (groups.length === 1) {
      equivalenceTopology = 'case_1_all_three_merged';
    } else if (groups.length === 3) {
      equivalenceTopology = 'case_5_all_three_distinct';
    } else {
      const mergedGroup = groups.find((g) => g.matchedPolicies.length === 2);
      const mergedKey = mergedGroup?.matchedPolicies.join('+') ?? '';
      if (mergedKey === 'terrain+uncertainty') {
        equivalenceTopology = 'case_2_terrain_uncertainty_merged';
      } else if (mergedKey === 'shortest+terrain') {
        equivalenceTopology = 'case_3_shortest_terrain_merged';
      } else if (mergedKey === 'shortest+uncertainty') {
        equivalenceTopology = 'case_4_shortest_uncertainty_merged';
      }
    }
  }

  return { groups, equivalenceTopology };
}
