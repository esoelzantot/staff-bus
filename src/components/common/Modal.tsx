import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Closing is requested by Escape and by a click on the backdrop. */
  onClose: () => void;
  /** Set to false while something is being saved, so the dialog cannot be dismissed half-way. */
  dismissable?: boolean;
  /** The dialog itself (an element with className="dialog", role="dialog" and aria-labelledby). */
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell: rendered in a portal (never trapped inside a parent's stacking context), closes on
 * Escape / backdrop click, keeps Tab inside the dialog, locks page scrolling behind it and puts the focus
 * back where it was when it closes.
 */
export function Modal({ onClose, dismissable = true, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, dismissable });
  latest.current = { onClose, dismissable };

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () => Array.from(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Respect an autoFocus inside the dialog; otherwise start on the first control.
    if (!root.current?.contains(document.activeElement)) focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (latest.current.dismissable) latest.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      ref={root}
      className="modalBackdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && latest.current.dismissable) latest.current.onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
