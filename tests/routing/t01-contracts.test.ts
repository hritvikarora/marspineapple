import { describe, expect, it } from 'vitest';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_CODE,
  QUALITY_PENALTY_BY_CODE,
  SOURCE_FOM_CODE,
} from '../../src/routing/types.js';

describe('T01 Frozen Routing Contracts', () => {
  it('defines 8-neighbor direction lookup tables in clockwise N..NW order', () => {
    expect(DIR_COUNT).toBe(8);
    expect(Array.from(DIR_DR)).toEqual([-1, -1, 0, 1, 1, 1, 0, -1]);
    expect(Array.from(DIR_DC)).toEqual([0, 1, 1, 1, 0, -1, -1, -1]);
    expect(Array.from(DIR_IS_DIAG)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('defines nominal policy weights for shortest, terrain, and uncertainty', () => {
    expect(NOMINAL_POLICY_WEIGHTS.shortest).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(NOMINAL_POLICY_WEIGHTS.terrain).toEqual({ alpha: 2, beta: 1, gamma: 0 });
    expect(NOMINAL_POLICY_WEIGHTS.uncertainty).toEqual({ alpha: 2, beta: 1, gamma: 2 });
  });

  it('defines quality penalty by code and frozen quality/source FOM enums', () => {
    expect(QUALITY_CODE).toEqual({
      ACCEPTABLE: 0,
      UNKNOWN: 1,
      LOW: 2,
      INVALID: 3,
    });

    expect(QUALITY_PENALTY_BY_CODE[QUALITY_CODE.ACCEPTABLE]).toBe(0.0);
    expect(QUALITY_PENALTY_BY_CODE[QUALITY_CODE.UNKNOWN]).toBe(0.75);
    expect(QUALITY_PENALTY_BY_CODE[QUALITY_CODE.LOW]).toBe(1.0);
    expect(QUALITY_PENALTY_BY_CODE[QUALITY_CODE.INVALID]).toBe(Number.POSITIVE_INFINITY);

    expect(SOURCE_FOM_CODE).toEqual({
      NO_DATA: 0,
      ACCEPTABLE: 1,
      LOW_CORRELATION: 2,
      INTERPOLATED: 3,
      EXTRAPOLATED: 4,
      SATURATED: 5,
      MANUALLY_EDITED: 6,
      MISSING_QUALITY_RASTER: 7,
    });
  });
});
