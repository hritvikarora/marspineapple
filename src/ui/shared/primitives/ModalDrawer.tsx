/**
 * Accessible Modal Drawer primitive. OWNER: Dhani.
 * Handles focus trapping, Escape key dismissal, backdrop clicks, and focus restoration.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './ModalDrawer.module.css';

export interface ModalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  position?: 'left' | 'right';
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      !el.hasAttribute('hidden') &&
      el.getAttribute('aria-hidden') !== 'true',
  );
}

export function ModalDrawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
  className = '',
}: ModalDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const headingId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const drawerEl = drawerRef.current;
    if (drawerEl) {
      const focusable = getFocusableElements(drawerEl);
      if (focusable.length > 0) {
        focusable[0]?.focus({ preventScroll: true });
      } else {
        drawerEl.focus({ preventScroll: true });
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab' && drawerRef.current) {
        const focusables = getFocusableElements(drawerRef.current);

        if (focusables.length === 0) {
          e.preventDefault();
          drawerRef.current.focus({ preventScroll: true });
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (!active || !drawerRef.current.contains(active) || active === drawerRef.current) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus({ preventScroll: true });
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const toRestore = previousFocus.current;
      previousFocus.current = null;
      if (toRestore?.isConnected) {
        toRestore.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isLeft = position === 'left';
  const overlayClass = [
    'drawer-overlay',
    styles.overlay,
    isLeft ? styles.overlayLeft : styles.overlayRight,
  ]
    .filter(Boolean)
    .join(' ');
  const panelClass = [
    'drawer',
    `drawer-${position}`,
    styles.panel,
    isLeft ? styles.panelLeft : styles.panelRight,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const headerClass = ['drawer-header', styles.header].filter(Boolean).join(' ');
  const closeClass = ['drawer-close', styles.closeButton].filter(Boolean).join(' ');
  const contentClass = ['drawer-content', styles.content].filter(Boolean).join(' ');

  return (
    <div
      className={overlayClass}
      data-position={position}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={headerClass}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={closeClass}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
              focusable="false"
              className={styles.closeIcon}
            >
              <path
                d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className={contentClass}>{children}</div>
      </div>
    </div>
  );
}
