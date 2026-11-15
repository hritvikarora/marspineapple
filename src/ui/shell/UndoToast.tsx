import styles from './UndoToast.module.css';

export interface UndoToastProps {
  message: string | null;
  onUndo: () => void;
  onDismiss: () => void;
  className?: string;
}

export function UndoToast({ message, onUndo, onDismiss, className }: UndoToastProps) {
  if (message === null) {
    return null;
  }

  const rootClassName = className ? `${styles.toast} ${className}` : styles.toast;

  return (
    <div role="status" className={rootClassName}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.undoButton} onClick={onUndo}>
          Undo
        </button>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 4L12 12" />
            <path d="M12 4L4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
