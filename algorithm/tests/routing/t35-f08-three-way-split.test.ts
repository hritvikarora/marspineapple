import { describe, expect, it } from 'vitest';
import {
  F08_CORRIDOR_LENGTH_M,
  F08_DEST_POINT,
  F08_MIDDLE_LENGTH_M,
  F08_MIDDLE_PATH,
  F08_MIDDLE_TERRAIN_COST,
  F08_NORTH_PATH,
  F08_NORTH_TERRAIN_COST,
  F08_NORTH_UNCERTAINTY_COST,
  F08_SOUTH_PATH,
  F08_SOUTH_TERRAIN_COST,
  F08_SOUTH_UNCERTAINTY_COST,
  F08_START_POINT,
  createFixtureF08Bundle,
  evaluatePathCost,
  formatDistanceDeltaClause,
  solveReferenceRoute,
} from '../fixtures/f08.js';
import { NOMINAL_POLICY_WEIGHTS } from '../../src/routing/types.js';

describe('T35: Fixture F08 Corner-Legal Three-Way Policy Split & Equal-Length Explanation', () => {
  it('selects 3 distinct corner-legal corridors for shortest, terrain, and uncertainty', () => {
    const bundle = createFixtureF08Bundle();

    const shortest = solveReferenceRoute(bundle, F08_START_POINT, F08_DEST_POINT, 'shortest');
    const terrain = solveReferenceRoute(bundle, F08_START_POINT, F08_DEST_POINT, 'terrain');
    const uncertainty = solveReferenceRoute(
      bundle,
      F08_START_POINT,
      F08_DEST_POINT,
      'uncertainty'
    );

    expect(shortest.cellIndices).toEqual([...F08_MIDDLE_PATH]);
    expect(shortest.horizontalDistanceM).toBeCloseTo(F08_MIDDLE_LENGTH_M, 7);
    expect(shortest.totalCost).toBeCloseTo(40.0, 7);
    expect(shortest.maxTerrainSlopeDeg).toBe(15);
    expect(shortest.lowQualityDistanceM).toBe(0);

    expect(terrain.cellIndices).toEqual([...F08_NORTH_PATH]);
    expect(terrain.horizontalDistanceM).toBeCloseTo(F08_CORRIDOR_LENGTH_M, 7);
    expect(terrain.totalCost).toBeCloseTo(F08_NORTH_TERRAIN_COST, 7);
    expect(terrain.totalCost).toBeCloseTo(48.28427125, 7);
    expect(terrain.maxTerrainSlopeDeg).toBe(0);
    expect(terrain.lowQualityDistanceM).toBeCloseTo(20.0, 7);

    expect(uncertainty.cellIndices).toEqual([...F08_SOUTH_PATH]);
    expect(uncertainty.horizontalDistanceM).toBeCloseTo(F08_CORRIDOR_LENGTH_M, 7);
    expect(uncertainty.totalCost).toBeCloseTo(F08_SOUTH_UNCERTAINTY_COST, 7);
    expect(uncertainty.totalCost).toBeCloseTo(58.28427125, 7);
    expect(uncertainty.maxTerrainSlopeDeg).toBe(5);
    expect(uncertainty.lowQualityDistanceM).toBe(0);
  });

  it('verifies wide unambiguous cost margins across all three corridors', () => {
    const bundle = createFixtureF08Bundle();

    const midTerrain = evaluatePathCost(bundle, F08_MIDDLE_PATH, NOMINAL_POLICY_WEIGHTS.terrain);
    const northTerrain = evaluatePathCost(bundle, F08_NORTH_PATH, NOMINAL_POLICY_WEIGHTS.terrain);
    const southTerrain = evaluatePathCost(bundle, F08_SOUTH_PATH, NOMINAL_POLICY_WEIGHTS.terrain);

    expect(midTerrain.totalCost).toBeCloseTo(F08_MIDDLE_TERRAIN_COST, 7);
    expect(northTerrain.totalCost).toBeCloseTo(F08_NORTH_TERRAIN_COST, 7);
    expect(southTerrain.totalCost).toBeCloseTo(F08_SOUTH_TERRAIN_COST, 7);
    expect(southTerrain.totalCost - northTerrain.totalCost).toBeCloseTo(10.0, 7);

    const midUnc = evaluatePathCost(bundle, F08_MIDDLE_PATH, NOMINAL_POLICY_WEIGHTS.uncertainty);
    const northUnc = evaluatePathCost(bundle, F08_NORTH_PATH, NOMINAL_POLICY_WEIGHTS.uncertainty);
    const southUnc = evaluatePathCost(bundle, F08_SOUTH_PATH, NOMINAL_POLICY_WEIGHTS.uncertainty);

    expect(midUnc.totalCost).toBeCloseTo(120.0, 7);
    expect(northUnc.totalCost).toBeCloseTo(F08_NORTH_UNCERTAINTY_COST, 7);
    expect(southUnc.totalCost).toBeCloseTo(F08_SOUTH_UNCERTAINTY_COST, 7);
    expect(northUnc.totalCost - southUnc.totalCost).toBeCloseTo(30.0, 7);
  });

  it('uses the equal-length signed explanation clause for uncertainty vs. terrain (never "adds 0.0 m")', () => {
    const bundle = createFixtureF08Bundle();
    const terrain = solveReferenceRoute(bundle, F08_START_POINT, F08_DEST_POINT, 'terrain');
    const uncertainty = solveReferenceRoute(
      bundle,
      F08_START_POINT,
      F08_DEST_POINT,
      'uncertainty'
    );

    const clause = formatDistanceDeltaClause(
      uncertainty.horizontalDistanceM,
      terrain.horizontalDistanceM
    );

    expect(clause).toBe('follows an equal-length 48.3 m alternative corridor');
    expect(clause).not.toContain('adds 0.0 m');
  });
});
