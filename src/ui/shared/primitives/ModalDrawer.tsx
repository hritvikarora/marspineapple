/**
 * Accessible Modal Drawer primitive. OWNER: Dhani.
 * Handles focus trapping, Escape key dismissal, backdrop clicks, and focus restoration.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  position?: 'left' | 'right';
  className?: string;
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

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      // Focus drawer or first focusable
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable && focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        drawerRef.current?.focus();
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'Tab' && drawerRef.current) {
          const focusables = Array.from(
            drawerRef.current.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute('disabled'));

          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previousFocus.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`drawer drawer-${position} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </header>
        <div className="drawer-content">{children}</div>
      </div>
    </div>
  );
}
