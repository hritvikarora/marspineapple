/**
 * Color mapping and legend metadata utilities for registered terrain rasters (TASK-008 / UI-018).
 * Complies with frozen contracts: QUALITY (0..3) and EXCLUSION (0..4).
 * Quality words name class codes. They are not probabilities.
 */
import { EXCLUSION, QUALITY, type ExclusionCode, type QualityCode } from '../../../contracts';

export type QualityLegendWord = 'Good' | 'Low' | 'Unknown' | 'No elevation';
export type ExclusionLegendWord =
  | 'Missing elevation'
  | 'Unsupported derivative'
  | 'Outside extent'
  | 'Manual';
export type ExclusionPattern = 'crosshatch' | 'diagonal' | 'horizontal' | 'frame';

export interface QualityLegendItem {
  readonly code: QualityCode;
  readonly label: QualityLegendWord;
  readonly color: string | null;
}

export interface ExclusionLegendItem {
  readonly code: Exclude<ExclusionCode, typeof EXCLUSION.NONE>;
  readonly label: ExclusionLegendWord;
  readonly color: string;
  readonly pattern: ExclusionPattern;
}

export function getElevationColor(z: number, minZ: number, maxZ: number, opacity = 1.0): string {
  if (!Number.isFinite(z)) return `rgba(0,0,0,${opacity})`;
  const t = maxZ > minZ ? Math.max(0, Math.min(1, (z - minZ) / (maxZ - minZ))) : 0.5;

  // Martian ochre to sandy rust palette
  const r = Math.round(90 + 150 * t);
  const g = Math.round(50 + 110 * t * 0.85);
  const b = Math.round(35 + 85 * t * 0.65);
  return `rgba(${r},${g},${b},${opacity})`;
}

export function getSlopeColor(slopeDeg: number, opacity = 1.0): string | null {
  if (!Number.isFinite(slopeDeg) || slopeDeg <= 5) return null;
  // Green/yellow/red traffic light slope grading
  if (slopeDeg > 25) {
    return `rgba(239,68,68,${opacity})`; // Critical steep slope (>25 deg)
  }
  if (slopeDeg > 15) {
    return `rgba(245,158,11,${opacity})`; // Moderate slope (15-25 deg)
  }
  return `rgba(234,179,8,${opacity * 0.6})`; // Minor grade (5-15 deg)
}

export function getQualityColor(qualityCode: number, opacity = 1.0): string | null {
  switch (qualityCode) {
    case QUALITY.NO_ELEVATION:
      return `rgba(15,23,42,${opacity})`; // Near-black for no data
    case QUALITY.LOW:
      return `rgba(245,158,11,${opacity})`; // Amber for low quality
    case QUALITY.UNKNOWN:
      return `rgba(168,85,247,${opacity})`; // Purple for unknown quality
    case QUALITY.GOOD:
    default:
      return null; // Good quality remains transparent or unshaded
  }
}

export function getExclusionColor(exclusionCode: number, opacity = 1.0): string | null {
  switch (exclusionCode) {
    case EXCLUSION.MISSING_ELEVATION:
      return `rgba(220,38,38,${opacity})`; // Red
    case EXCLUSION.UNSUPPORTED_DERIVATIVE:
      return `rgba(185,28,28,${opacity})`; // Dark red
    case EXCLUSION.OUTSIDE_EXTENT:
      return `rgba(100,116,139,${opacity})`; // Slate grey
    case EXCLUSION.MANUAL:
      return `rgba(236,72,153,${opacity})`; // Pinkish red
    case EXCLUSION.NONE:
    default:
      return null;
  }
}

/** Quality class words for codes 1, 2, 3, and 0. */
export function qualityLegendItems(opacity = 1): readonly QualityLegendItem[] {
  return [
    { code: QUALITY.GOOD, label: 'Good', color: getQualityColor(QUALITY.GOOD, opacity) },
    { code: QUALITY.LOW, label: 'Low', color: getQualityColor(QUALITY.LOW, opacity) },
    { code: QUALITY.UNKNOWN, label: 'Unknown', color: getQualityColor(QUALITY.UNKNOWN, opacity) },
    {
      code: QUALITY.NO_ELEVATION,
      label: 'No elevation',
      color: getQualityColor(QUALITY.NO_ELEVATION, opacity),
    },
  ];
}

function exclusionSwatch(code: ExclusionCode, opacity: number): string {
  const color = getExclusionColor(code, opacity);
  if (color === null) return 'rgba(0,0,0,0)';
  return color;
}

/** Exclusion words stay distinct from the quality class labels. */
export function exclusionLegendItems(opacity = 1): readonly ExclusionLegendItem[] {
  return [
    {
      code: EXCLUSION.MISSING_ELEVATION,
      label: 'Missing elevation',
      color: exclusionSwatch(EXCLUSION.MISSING_ELEVATION, opacity),
      pattern: 'crosshatch',
    },
    {
      code: EXCLUSION.UNSUPPORTED_DERIVATIVE,
      label: 'Unsupported derivative',
      color: exclusionSwatch(EXCLUSION.UNSUPPORTED_DERIVATIVE, opacity),
      pattern: 'diagonal',
    },
    {
      code: EXCLUSION.OUTSIDE_EXTENT,
      label: 'Outside extent',
      color: exclusionSwatch(EXCLUSION.OUTSIDE_EXTENT, opacity),
      pattern: 'horizontal',
    },
    {
      code: EXCLUSION.MANUAL,
      label: 'Manual',
      color: exclusionSwatch(EXCLUSION.MANUAL, opacity),
      pattern: 'frame',
    },
  ];
}
