/**
 * Accessible Button primitive. OWNER: Dhani.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const baseClass = `btn btn-${variant} btn-${size} ${className}`.trim();
  return (
    <button
      type={type}
      className={baseClass}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
