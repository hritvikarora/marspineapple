/**
 * Formatting helpers for measurements. OWNER: Dhani.
 */
const EM_DASH = '—';

function formatUnit(
  value: number | null | undefined,
  decimals: number,
  suffix: string,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EM_DASH;
  return `${value.toFixed(decimals)}${suffix}`;
}

/** Formats local metres using fixed decimals and a plain space before the unit. */
export function formatMeters(meters: number | null | undefined, decimals = 0): string {
  return formatUnit(meters, decimals, ' m');
}

/** Formats degrees with a trailing degree sign and fixed decimals. */
export function formatDegrees(degrees: number | null | undefined, decimals = 1): string {
  return formatUnit(degrees, decimals, '°');
}

/** Formats a percentage with a trailing percent sign and fixed decimals. */
export function formatPercent(percent: number | null | undefined, decimals = 0): string {
  return formatUnit(percent, decimals, '%');
}
