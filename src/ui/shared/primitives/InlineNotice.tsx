/**
 * Accessible Inline Notice primitive. OWNER: Dhani.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './InlineNotice.module.css';

export interface InlineNoticeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
}

type NoticeVariant = NonNullable<InlineNoticeProps['variant']>;

function NoticeIcon({ variant }: { variant: NoticeVariant }) {
  return (
    <span className={styles.icon} aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {variant === 'info' && (
          <>
            <circle cx="8" cy="8" r="6" />
            <path d="M8 7.5v3.5" />
            <path d="M8 5h.01" />
          </>
        )}
        {variant === 'warning' && (
          <>
            <path d="M8 2.5L14 13H2L8 2.5Z" />
            <path d="M8 6.5v3" />
            <path d="M8 11.5h.01" />
          </>
        )}
        {variant === 'error' && (
          <>
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3.5" />
            <path d="M8 11h.01" />
          </>
        )}
        {variant === 'success' && (
          <>
            <circle cx="8" cy="8" r="6" />
            <path d="M5.5 8.2L7.2 9.9L10.8 6.3" />
          </>
        )}
      </svg>
    </span>
  );
}

export function InlineNotice({
  variant = 'info',
  title,
  children,
  className = '',
  ...rest
}: InlineNoticeProps) {
  const role = variant === 'error' ? 'alert' : 'status';
  const hasTitle = typeof title === 'string' && title.trim().length > 0;
  const rootClassName = [
    'notice',
    `notice-${variant}`,
    styles.notice,
    styles[variant],
    className.trim(),
  ]
    .filter(Boolean)
    .join(' ');
  const contentClassName = ['notice-content', styles.content].filter(Boolean).join(' ');
  const titleClassName = ['notice-title', styles.title].filter(Boolean).join(' ');

  return (
    <div role={role} className={rootClassName} {...rest}>
      <NoticeIcon variant={variant} />
      <div className={contentClassName}>
        {hasTitle ? (
          <>
            <strong className={titleClassName}>{title}</strong>{' '}
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}
