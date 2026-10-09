import { useEffect } from 'react';
import { useViewStore } from '@/state/viewStore';
import styles from './PresentationMode.module.css';

/** Typing in a field: keys are text there, not shortcuts. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Presentation mode, for recording: only the 3D view (header, options, toolbars and the desk
 * bar hidden; the desks' tags and screens stay). P toggles it, Esc leaves it; a hint says so
 * for a moment, then the view is clean.
 */
export function PresentationMode() {
  const presenting = useViewStore((s) => s.presenting);
  const setPresenting = useViewStore((s) => s.setPresenting);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      if (event.key === 'p' || event.key === 'P')
        setPresenting(!useViewStore.getState().presenting);
      else if (event.key === 'Escape' && useViewStore.getState().presenting) setPresenting(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPresenting]);

  if (!presenting) return null;
  return (
    // Shown each time the mode starts, then fades away by itself (CSS).
    <div className={styles.hint} role="status">
      Presentation mode · <kbd>Esc</kbd> to leave
    </div>
  );
}
