/**
 * Scale calculation helpers for Map Chrome (TASK-007).
 */
export function calculateScaleBar(scaleX: number, targetPx = 80): { meters: number; widthPx: number; label: string } {
  if (scaleX <= 0) return { meters: 100, widthPx: 80, label: '100 m' };
  const rawMeters = targetPx / scaleX;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMeters)));
  const residual = rawMeters / magnitude;

  let factor = 1;
  if (residual >= 7.5) factor = 10;
  else if (residual >= 3.5) factor = 5;
  else if (residual >= 1.5) factor = 2;

  const meters = factor * magnitude;
  const widthPx = meters * scaleX;
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;

  return { meters, widthPx, label };
}
