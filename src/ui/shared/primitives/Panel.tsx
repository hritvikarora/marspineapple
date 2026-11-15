/**
 * Semantic Panel primitive. OWNER: Dhani.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Panel.module.css';

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
  const hasTitle = Boolean(title);
  const hasHeaderAction = Boolean(headerAction);
  const rootClassName = ['panel', styles.panel, className.trim()].filter(Boolean).join(' ');

  return (
    <Component className={rootClassName} {...rest}>
      {(hasTitle || hasHeaderAction) && (
        <header className={['panel-header', styles.header].filter(Boolean).join(' ')}>
          {hasTitle && <h3 className={styles.title}>{title}</h3>}
          {hasHeaderAction && (
            <div className={['panel-header-action', styles.headerAction].filter(Boolean).join(' ')}>
              {headerAction}
            </div>
          )}
        </header>
      )}
      <div className={['panel-body', styles.body].filter(Boolean).join(' ')}>{children}</div>
    </Component>
  );
}
