// Canonical re-exports for all 12 verification fixtures (F01-F12) without name collisions.

export {
  createFixtureF01Bundle,
  createFixtureF02Bundle,
  F01_SUBTEST_A_CARDINAL_M,
  F01_SUBTEST_B_DIAGONAL_M,
  F01_SUBTEST_C_OCTILE_M,
  F02_EXPECTED_LENGTH_M,
  F02_GAP_PATH_CELLS,
  solveReferenceShortestPath as solveF01F02ReferenceShortestPath,
} from './f01_f02.js';

export {
  countPassableNeighbors,
  createFixtureF03SubtestABundle,
  createFixtureF03SubtestBBundle,
  createFixtureF04Bundle,
  F03A_EXPECTED_LENGTH_M,
  F03A_PATH_CELLS,
  F04_DEFAULT_MAX_TERRAIN_SLOPE_DEG,
  solveReferenceShortestPath as solveF03F04ReferenceShortestPath,
} from './f03_f04.js';

export {
  createFixtureF05AdmissibleBundle,
  createFixtureF05InterpolatedCenterBundle,
  createFixtureF06Bundle,
  evaluatePathCost as evaluateF05F06PathCost,
  F05_DEFAULT_PROFILE,
  F05_DEST_POINT,
  F05_EXPECTED_CELL_INDEX,
  F05_START_POINT,
  F06_CORNER_CLEAR_DETOUR,
  F06_CORNER_CLIPPING_COST_GAMMA2,
  F06_CORNER_CLIPPING_PATH,
  F06_CROSSOVER_GAMMA,
  F06_DETOUR_LENGTH_M,
  F06_DIRECT_LENGTH_M,
  F06_DIRECT_LOW_QUALITY_M,
  F06_DIRECT_PATH,
  getReferenceCellExclusionReason as getF05F06ReferenceCellExclusionReason,
  normalizePointToGrid as normalizeF05F06PointToGrid,
  solveReferenceRoute as solveF05F06ReferenceRoute,
  type ReferenceEvalResult,
} from './f05_f06.js';

export {
  computeCroppedHaloDerivatives,
  createFixtureF07AInclinedPlane,
  createFixtureF07BDerivedRidgeBundle,
  type FixtureF07AResult,
  type HornAndRoughnessResult,
} from './f07.js';

export {
  createFixtureF08Bundle,
  evaluatePathCost as evaluateF08PathCost,
  F08_CORRIDOR_LENGTH_M,
  F08_DEFAULT_PROFILE,
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
  formatDistanceDeltaClause,
  getReferenceCellExclusionReason as getF08ReferenceCellExclusionReason,
  normalizePointToGrid as normalizeF08PointToGrid,
  solveReferenceRoute as solveF08ReferenceRoute,
} from './f08.js';

export {
  createFixtureF09SubtestACounterexampleBundle,
  createFixtureF09SubtestCMixedUnknownLowBundle,
} from './f09.js';

export {
  applyElevationSupportMaskAndDerivatives,
  createFixtureF10FomSplitBundle,
  createFixtureF10InterpolatedSpikeBundle,
  createFixtureF10LowBarrierBundle,
  F10_DEFAULT_PROFILE,
  getReferenceCellExclusionReason as getF10ReferenceCellExclusionReason,
  normalizePointToGrid as normalizeF10PointToGrid,
  solveReferenceRoute as solveF10ReferenceRoute,
} from './f10.js';

export {
  createFixtureF11Bundle,
  F11_SINGLE_DIAG_M,
  F11_SUBTEST_B_EUCLIDEAN_M,
  F11_SUBTEST_B_PATH_M,
  solveReferenceShortestPath as solveF11ReferenceShortestPath,
} from './f11.js';

export {
  createFixtureF12SaddleQuadBundle,
  createFixtureF12SensitivityBundle,
} from './f12.js';
