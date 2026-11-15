/**
 * Measurement formatting component. OWNER: Dhani.
 */
import type { HTMLAttributes } from 'react';
import { formatDegrees, formatMeters, formatPercent } from './formatters';

export interface MeasurementProps extends HTMLAttributes<HTMLSpanElement> {
  value: number | null | undefined;
  unit: 'm' | 'deg' | '%' | 's';
  decimals?: number;
}

function formatSeconds(seconds: number | null | undefined, decimals: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  return `${seconds.toFixed(decimals)} s`;
}

const UNIT_FORMATTERS: Record<
  MeasurementProps['unit'],
  (value: number | null | undefined, decimals: number) => string
> = {
  m: formatMeters,
  deg: formatDegrees,
  '%': formatPercent,
  s: formatSeconds,
};

/** Presentational span displaying a formatted measurement with its unit and tabular numerals. */
export function Measurement({ value, unit, decimals, className = '', ...rest }: MeasurementProps) {
  const dec = decimals ?? (unit === 'deg' ? 1 : 0);
  const formatted = UNIT_FORMATTERS[unit](value, dec);
  const classes = ['measurement', `measurement-${unit}`, 'tabular-nums', className.trim()]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {formatted}
    </span>
  );
}
