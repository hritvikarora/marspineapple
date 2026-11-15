/**
 * Accessible Button primitive. OWNER: Dhani.
 * Callers must include visible text in `children` (icon-only buttons are invalid here).
 */
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import styles from './Button.module.css';

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
  const { 'aria-disabled': ariaDisabledProp, onClick, ...buttonRest } = rest;
  const resolvedAriaDisabled = disabled ? 'true' : ariaDisabledProp;
  const isAriaDisabled = resolvedAriaDisabled === true || resolvedAriaDisabled === 'true';

  const handleClick: MouseEventHandler<HTMLButtonElement> | undefined = onClick
    ? (event) => {
        if (disabled || isAriaDisabled) {
          event.preventDefault();
          return;
        }
        onClick(event);
      }
    : undefined;

  const baseClass = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    styles.button,
    styles[variant],
    styles[size],
    className,
  ]
    .filter((token): token is string => Boolean(token))
    .join(' ');

  return (
    <button
      type={type}
      className={baseClass}
      disabled={disabled}
      aria-disabled={resolvedAriaDisabled}
      onClick={handleClick}
      {...buttonRest}
    >
      {children}
    </button>
  );
}
