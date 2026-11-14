/**
 * Semantic Panel primitive. OWNER: Dhani.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  as?: 'section' | 'div' | 'aside';
}

export function Panel({
  title,
  headerAction,
  children,
  className = '',
  as: Component = 'section',
  ...rest
}: PanelProps) {
  return (
    <Component className={`panel ${className}`.trim()} {...rest}>
      {title && (
        <header className="panel-header">
          <h3>{title}</h3>
          {headerAction && <div className="panel-header-action">{headerAction}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </Component>
  );
}
