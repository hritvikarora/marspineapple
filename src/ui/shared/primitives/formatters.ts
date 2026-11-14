/**
 * Formatting helpers for measurements. OWNER: Dhani.
 */
export function formatMeters(meters: number | null | undefined, decimals = 0): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '—';
  return `${meters.toFixed(decimals)} m`;
}

export function formatDegrees(degrees: number | null | undefined, decimals = 1): string {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return '—';
  return `${degrees.toFixed(decimals)}°`;
}

export function formatPercent(percent: number | null | undefined, decimals = 0): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return '—';
  return `${percent.toFixed(decimals)}%`;
}
