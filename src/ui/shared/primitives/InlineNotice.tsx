/**
 * Accessible Inline Notice primitive. OWNER: Dhani.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export interface InlineNoticeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
}

export function InlineNotice({
  variant = 'info',
  title,
  children,
  className = '',
  ...rest
}: InlineNoticeProps) {
  const role = variant === 'error' ? 'alert' : 'status';
  return (
    <div
      role={role}
      className={`notice notice-${variant} ${className}`.trim()}
      {...rest}
    >
      {title && <strong className="notice-title">{title}</strong>}
      <div className="notice-content">{children}</div>
    </div>
  );
}
