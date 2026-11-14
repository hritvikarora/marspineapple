import { describe, it, expect } from 'vitest';
import {
  QUALITY_MAPPING_VERSION,
  mapSourceFomToQualityCode,
  decodeFomGridToQualityCode,
  qualityCodeToClass,
  qualityCodeToPenaltyU,
} from '../../src/routing/qualityMapping.js';
import { QUALITY_CODE, SOURCE_FOM_CODE } from '../../src/contracts/routing.js';

describe('T05: qualityMapping', () => {
  it('exports fom-mapping-v1 version', () => {
    expect(QUALITY_MAPPING_VERSION).toBe('fom-mapping-v1');
  });

  it('maps INTERPOLATED, EXTRAPOLATED, SATURATED, and NO_DATA to INVALID with +Infinity penalty', () => {
    for (const fom of [
      SOURCE_FOM_CODE.NO_DATA,
      SOURCE_FOM_CODE.INTERPOLATED,
      SOURCE_FOM_CODE.EXTRAPOLATED,
      SOURCE_FOM_CODE.SATURATED,
      99,
    ]) {
      const q = mapSourceFomToQualityCode(fom);
      expect(q).toBe(QUALITY_CODE.INVALID);
      expect(qualityCodeToClass(q)).toBe('invalid');
      expect(qualityCodeToPenaltyU(q)).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('maps MANUALLY_EDITED and MISSING_QUALITY_RASTER to UNKNOWN with U = 0.75', () => {
    for (const fom of [
      SOURCE_FOM_CODE.MANUALLY_EDITED,
      SOURCE_FOM_CODE.MISSING_QUALITY_RASTER,
    ]) {
      const q = mapSourceFomToQualityCode(fom);
      expect(q).toBe(QUALITY_CODE.UNKNOWN);
      expect(qualityCodeToClass(q)).toBe('unknown');
      expect(qualityCodeToPenaltyU(q)).toBe(0.75);
    }
  });

  it('maps LOW_CORRELATION to LOW (U = 1.0) and ACCEPTABLE to ACCEPTABLE (U = 0.0)', () => {
    const low = mapSourceFomToQualityCode(SOURCE_FOM_CODE.LOW_CORRELATION);
    expect(low).toBe(QUALITY_CODE.LOW);
    expect(qualityCodeToClass(low)).toBe('low');
    expect(qualityCodeToPenaltyU(low)).toBe(1.0);

    const acc = mapSourceFomToQualityCode(SOURCE_FOM_CODE.ACCEPTABLE);
    expect(acc).toBe(QUALITY_CODE.ACCEPTABLE);
    expect(qualityCodeToClass(acc)).toBe('acceptable');
    expect(qualityCodeToPenaltyU(acc)).toBe(0.0);
  });

  it('decodes an entire Uint8Array raster in O(N)', () => {
    const input = new Uint8Array([
      SOURCE_FOM_CODE.ACCEPTABLE,
      SOURCE_FOM_CODE.MANUALLY_EDITED,
      SOURCE_FOM_CODE.LOW_CORRELATION,
      SOURCE_FOM_CODE.INTERPOLATED,
    ]);
    const decoded = decodeFomGridToQualityCode(input);
    expect(Array.from(decoded)).toEqual([
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.UNKNOWN,
      QUALITY_CODE.LOW,
      QUALITY_CODE.INVALID,
    ]);
  });
});
