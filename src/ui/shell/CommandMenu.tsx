import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import styles from './CommandMenu.module.css';

export interface CommandMenuProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCalculate: () => void;
  onCancel: () => void;
  onSetMode: (mode: '2d' | '3d') => void;
  onExport: () => void;
  onToggleStrict: () => void;
  canCalculate: boolean;
  canCancel: boolean;
  canExport: boolean;
  strictQuality: boolean;
  strictSupported: boolean;
  canStrict?: boolean;
  className?: string;
}

interface MenuItemDef {
  id: 'calculate' | 'cancel' | 'mode-2d' | 'mode-3d' | 'export' | 'strict';
  label: string;
  hint: string;
  ariaKeyShortcut: string;
  disabled: boolean;
  role: 'menuitem' | 'menuitemcheckbox';
  checked?: boolean;
  separatorBefore?: boolean;
  action: () => void;
}

type FocusOnOpenMode = 'first' | 'last' | 'none';

const VIEWPORT_INSET_PX = 16;

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

function detectMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform ?? '';
  const userAgent = navigator.userAgent ?? '';
  return /mac/i.test(platform) || /mac/i.test(userAgent);
}

function hasOtherOpenDialog(menuEl: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const dialogs = document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]');
  for (const el of dialogs) {
    if (menuEl && menuEl.contains(el)) continue;
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') continue;
    return true;
  }
  return false;
}

function CheckIcon() {
  return (
    <svg
      className={styles.checkIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  );
}

export function CommandMenu({
  open,
  defaultOpen = false,
  onOpenChange,
  onCalculate,
  onCancel,
  onSetMode,
  onExport,
  onToggleStrict,
  canCalculate,
  canCancel,
  canExport,
  strictQuality,
  strictSupported,
  canStrict,
  className,
}: CommandMenuProps): JSX.Element {
  const triggerId = useId();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusOnOpenRef = useRef<FocusOnOpenMode>('none');
  const shouldRestoreFocusRef = useRef(false);
  const pointerDownOnTriggerRef = useRef(false);
  const wasOpenRef = useRef(false);

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => readPrefersReducedMotion());

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const strictEnabled = canStrict ?? strictSupported;
  const isMac = useMemo(() => detectMacPlatform(), []);

  const items = useMemo<MenuItemDef[]>(
    () => [
      {
        id: 'calculate',
        label: 'Calculate',
        hint: 'C',
        ariaKeyShortcut: 'c',
        disabled: !canCalculate,
        role: 'menuitem',
        action: onCalculate,
      },
      {
        id: 'cancel',
        label: 'Cancel',
        hint: 'Esc',
        ariaKeyShortcut: 'Escape',
        disabled: !canCancel,
        role: 'menuitem',
        action: onCancel,
      },
      {
        id: 'mode-2d',
        label: '2D',
        hint: '2',
        ariaKeyShortcut: '2',
        disabled: false,
        role: 'menuitem',
        separatorBefore: true,
        action: () => onSetMode('2d'),
      },
      {
        id: 'mode-3d',
        label: '3D',
        hint: '3',
        ariaKeyShortcut: '3',
        disabled: false,
        role: 'menuitem',
        action: () => onSetMode('3d'),
      },
      {
        id: 'export',
        label: 'Export JSON',
        hint: 'E',
        ariaKeyShortcut: 'e',
        disabled: !canExport,
        role: 'menuitem',
        separatorBefore: true,
        action: onExport,
      },
      {
        id: 'strict',
        label: 'Strict quality',
        hint: 'S',
        ariaKeyShortcut: 's',
        disabled: !strictEnabled,
        role: 'menuitemcheckbox',
        checked: strictQuality,
        action: onToggleStrict,
      },
    ],
    [
      canCalculate,
      canCancel,
      canExport,
      onCalculate,
      onCancel,
      onExport,
      onSetMode,
      onToggleStrict,
      strictEnabled,
      strictQuality,
    ],
  );

  const commitOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const openMenu = useCallback(
    (focusMode: FocusOnOpenMode) => {
      focusOnOpenRef.current = focusMode;
      shouldRestoreFocusRef.current = false;
      setActiveIndex(focusMode === 'first' ? 0 : focusMode === 'last' ? items.length - 1 : -1);
      commitOpen(true);
    },
    [commitOpen, items.length],
  );

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      focusOnOpenRef.current = 'none';
      shouldRestoreFocusRef.current = restoreFocus;
      setActiveIndex(-1);
      commitOpen(false);
    },
    [commitOpen],
  );

  const focusItem = useCallback((index: number) => {
    setActiveIndex(index);
    const el = itemRefs.current[index];
    el?.focus({ preventScroll: true });
  }, []);

  const activateItem = useCallback(
    (item: MenuItemDef, keepOpen = false) => {
      if (item.disabled) return;
      item.action();
      if (!keepOpen) {
        closeMenu(true);
      }
    },
    [closeMenu],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    let mql: MediaQueryList | undefined;
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    if (!mql || typeof mql.addEventListener !== 'function') {
      return undefined;
    }
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    mql.addEventListener('change', handleChange);
    return () => {
      mql?.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    if (!wasOpen && isOpen) {
      const mode = focusOnOpenRef.current;
      focusOnOpenRef.current = 'none';
      if (mode === 'first') {
        focusItem(0);
      } else if (mode === 'last') {
        focusItem(items.length - 1);
      }
    } else if (wasOpen && !isOpen) {
      if (shouldRestoreFocusRef.current) {
        shouldRestoreFocusRef.current = false;
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
  }, [focusItem, isOpen, items.length]);

  useLayoutEffect(() => {
    const panelEl = panelRef.current;
    if (!isOpen || !panelEl) return;
    panelEl.style.setProperty('--menu-shift-x', '0px');
    const rect = panelEl.getBoundingClientRect();
    if (rect.width === 0 || typeof window === 'undefined') return;
    const maxRight = window.innerWidth - VIEWPORT_INSET_PX;
    let shiftX = 0;
    if (rect.left < VIEWPORT_INSET_PX) {
      shiftX = VIEWPORT_INSET_PX - rect.left;
    } else if (rect.right > maxRight) {
      shiftX = maxRight - rect.right;
    }
    if (shiftX !== 0) {
      panelEl.style.setProperty('--menu-shift-x', `${Math.round(shiftX)}px`);
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      // Intercept Ctrl/Meta+K even inside inputs unless another dialog is open so the app shortcut stays reachable.
      if (hasOtherOpenDialog(panelRef.current)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (isOpen) {
        closeMenu(true);
      } else {
        openMenu('first');
      }
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [closeMenu, isOpen, openMenu]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // While open, Escape closes the menu, restores trigger focus, and cancels only when canCancel is true.
        if (canCancel) {
          onCancel();
        }
        closeMenu(true);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;

      const target = event.target;
      const targetEl = target instanceof Element ? target : null;
      const isTextTargetOutsideMenu =
        targetEl !== null &&
        !panelRef.current?.contains(targetEl) &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.tagName === 'SELECT' ||
          (targetEl instanceof HTMLElement && targetEl.isContentEditable));

      if (isTextTargetOutsideMenu) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length;
        focusItem(nextIndex);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
        focusItem(nextIndex);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusItem(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusItem(items.length - 1);
        return;
      }

      const keyLower = event.key.toLowerCase();
      const shortcutMap: Record<string, MenuItemDef | undefined> = {
        c: items[0],
        '2': items[2],
        '3': items[3],
        e: items[4],
        s: items[5],
      };
      const matched = shortcutMap[keyLower];
      if (matched) {
        event.preventDefault();
        activateItem(matched);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      closeMenu(false);
    };

    const handleDocumentFocusIn = (event: globalThis.FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      closeMenu(false);
    };

    const handlePointerUp = () => {
      pointerDownOnTriggerRef.current = false;
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleDocumentFocusIn);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleDocumentFocusIn);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [activateItem, activeIndex, canCancel, closeMenu, focusItem, isOpen, items, onCancel]);

  const handleTriggerPointerDown = () => {
    pointerDownOnTriggerRef.current = true;
  };

  const handleTriggerClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const isPointerClick = pointerDownOnTriggerRef.current || event.detail > 0;
    pointerDownOnTriggerRef.current = false;
    if (isOpen) {
      closeMenu(!isPointerClick);
      return;
    }
    openMenu(isPointerClick ? 'none' : 'first');
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        openMenu('first');
      } else {
        focusItem(0);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        openMenu('last');
      } else {
        focusItem(items.length - 1);
      }
    } else if (event.key === 'Enter' && !event.repeat) {
      event.preventDefault();
      if (isOpen) {
        closeMenu(true);
      } else {
        openMenu('first');
      }
    }
  };

  const handlePanelMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && !target.closest('button')) {
      event.preventDefault();
    }
  };

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.repeat && activeIndex >= 0) {
      const activeItem = items[activeIndex];
      if (activeItem) {
        event.preventDefault();
        event.stopPropagation();
        activateItem(activeItem);
      }
    }
  };

  const handlePanelBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    if (pointerDownOnTriggerRef.current && nextTarget === triggerRef.current) {
      return;
    }
    closeMenu(false);
  };

  const handleItemKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, item: MenuItemDef) => {
    if (event.key === 'Enter' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      activateItem(item);
    } else if (event.key === ' ' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      activateItem(item, item.role === 'menuitemcheckbox');
    }
  };

  const rootClassName = className ? `${styles.root} ${className}` : styles.root;
  const panelClassName = reducedMotion ? styles.panel : `${styles.panel} ${styles.panelAnimated}`;
  const visibleActiveIndex = isOpen ? activeIndex : -1;

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-keyshortcuts="Control+K Meta+K"
        onPointerDown={handleTriggerPointerDown}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>Commands</span>
        <kbd className={styles.kbd} aria-hidden="true">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={panelClassName}
          onMouseDown={handlePanelMouseDown}
          onKeyDown={handlePanelKeyDown}
          onBlur={handlePanelBlur}
        >
          {items.map((item, index) => (
            <div key={item.id} role="none">
              {item.separatorBefore ? <hr className={styles.separator} /> : null}
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role={item.role}
                tabIndex={-1}
                aria-disabled={item.disabled ? 'true' : undefined}
                aria-checked={item.role === 'menuitemcheckbox' ? item.checked : undefined}
                aria-keyshortcuts={item.ariaKeyShortcut}
                data-active={visibleActiveIndex === index ? 'true' : undefined}
                className={styles.item}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={(event) => {
                  if (item.disabled) {
                    event.preventDefault();
                    return;
                  }
                  activateItem(item);
                }}
                onKeyDown={(event) => handleItemKeyDown(event, item)}
              >
                <span className={styles.itemLabel}>{item.label}</span>
                <span className={styles.itemTrailing}>
                  {item.role === 'menuitemcheckbox' && item.checked ? <CheckIcon /> : null}
                  <kbd className={styles.kbd} aria-hidden="true">
                    {item.hint}
                  </kbd>
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
