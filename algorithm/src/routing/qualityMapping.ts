import {
  QUALITY_CODE,
  SOURCE_FOM_CODE,
  type QualityClass,
  type QualityCode,
} from '../contracts/routing.js';
import { QUALITY_PENALTY_BY_CODE } from './types.js';

export const QUALITY_MAPPING_VERSION = 'fom-mapping-v1';

export function mapSourceFomToQualityCode(fomCode: number): QualityCode {
  switch (fomCode) {
    case SOURCE_FOM_CODE.ACCEPTABLE:
      return QUALITY_CODE.ACCEPTABLE;
    case SOURCE_FOM_CODE.MANUALLY_EDITED:
    case SOURCE_FOM_CODE.MISSING_QUALITY_RASTER:
      return QUALITY_CODE.UNKNOWN;
    case SOURCE_FOM_CODE.LOW_CORRELATION:
      return QUALITY_CODE.LOW;
    case SOURCE_FOM_CODE.NO_DATA:
    case SOURCE_FOM_CODE.INTERPOLATED:
    case SOURCE_FOM_CODE.EXTRAPOLATED:
    case SOURCE_FOM_CODE.SATURATED:
    default:
      return QUALITY_CODE.INVALID;
  }
}

export function decodeFomGridToQualityCode(sourceFom: Uint8Array): Uint8Array {
  const out = new Uint8Array(sourceFom.length);
  for (let i = 0; i < sourceFom.length; i++) {
    out[i] = mapSourceFomToQualityCode(sourceFom[i]);
  }
  return out;
}

export function qualityCodeToClass(code: number): QualityClass {
  if (code === QUALITY_CODE.ACCEPTABLE) return 'acceptable';
  if (code === QUALITY_CODE.UNKNOWN) return 'unknown';
  if (code === QUALITY_CODE.LOW) return 'low';
  return 'invalid';
}

export function qualityCodeToPenaltyU(code: number): number {
  if (code === 0 || code === 1 || code === 2) {
    return QUALITY_PENALTY_BY_CODE[code];
  }
  return Number.POSITIVE_INFINITY;
}
