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

export function Measurement({ value, unit, decimals, className = '', ...rest }: MeasurementProps) {
  let formatted: string;
  const dec = decimals ?? (unit === 'deg' ? 1 : 0);
  switch (unit) {
    case 'm':
      formatted = formatMeters(value, dec);
      break;
    case 'deg':
      formatted = formatDegrees(value, dec);
      break;
    case '%':
      formatted = formatPercent(value, dec);
      break;
    case 's':
      formatted = value !== null && value !== undefined && Number.isFinite(value) ? `${value.toFixed(dec)} s` : '—';
      break;
  }
  return (
    <span className={`measurement measurement-${unit} ${className}`.trim()} {...rest}>
      {formatted}
    </span>
  );
}
