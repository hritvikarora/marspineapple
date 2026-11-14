/**
 * Accessible Form Field wrapper primitive. OWNER: Dhani.
 */
import { useId, type ReactNode } from 'react';

export interface FieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
  }) => ReactNode;
  className?: string;
}

export function Field({
  label,
  description,
  error,
  required,
  children,
  className = '',
}: FieldProps) {
  const inputId = useId();
  const descId = useId();
  const errorId = useId();

  const describedBy = [
    description ? descId : null,
    error ? errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field-group ${error ? 'has-error' : ''} ${className}`.trim()}>
      <label htmlFor={inputId} className="field-label">
        {label}
        {required && <span className="field-required" aria-hidden="true">*</span>}
      </label>
      {description && (
        <p id={descId} className="field-description muted">
          {description}
        </p>
      )}
      {children({
        id: inputId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}
      {error && (
        <p id={errorId} role="alert" className="field-error error">
          {error}
        </p>
      )}
    </div>
  );
}
