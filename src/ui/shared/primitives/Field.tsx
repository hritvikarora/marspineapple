/**
 * Accessible Form Field wrapper primitive. OWNER: Dhani.
 */
import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

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

  const hasDescription = Boolean(description && description.trim().length > 0);
  const hasError = Boolean(error && error.trim().length > 0);

  const describedBy =
    [hasDescription ? descId : null, hasError ? errorId : null].filter(Boolean).join(' ') || undefined;

  const rootClassName = [styles.field, className.trim()].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      <div className={styles.labelRow}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {required && (
          <span className={styles.required} aria-hidden="true">
            (required)
          </span>
        )}
      </div>
      <div className={styles.control}>
        {children({
          id: inputId,
          'aria-describedby': describedBy,
          'aria-invalid': hasError ? true : undefined,
          'aria-required': required ? true : undefined,
        })}
      </div>
      {hasDescription && (
        <p id={descId} className={styles.description}>
          {description}
        </p>
      )}
      {hasError && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
