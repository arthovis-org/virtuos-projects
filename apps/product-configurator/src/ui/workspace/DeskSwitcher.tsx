import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProduct } from '@/state/configuratorStore';
import { deskName, MAX_DESKS, useDesksStore } from '@/state/desksStore';
import { useWorkspaceStore } from '@/state/workspaceStore';
import styles from './DeskSwitcher.module.css';

/** True when typing would go to this element (so arrow keys are not ours to take). */
function isEditable(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'),
  );
}

/**
 * The desks of unlimited desks mode along the bottom of the viewer, like virtual desktops:
 * one button per desk, a way to remove one, and "Add desk" with a workspace picker.
 * Ctrl + ← / → steps between desks.
 */
export function DeskSwitcher() {
  const product = useProduct();
  const desks = useDesksStore((s) => s.desks);
  const activeDeskId = useDesksStore((s) => s.activeDeskId);
  const selectDesk = useDesksStore((s) => s.selectDesk);
  const removeDesk = useDesksStore((s) => s.removeDesk);
  const addDesk = useDesksStore((s) => s.addDesk);
  const stepDesk = useDesksStore((s) => s.stepDesk);
  const seated = useWorkspaceStore((s) => s.seated);
  const setHudInsetBottom = useWorkspaceStore((s) => s.setHudInsetBottom);
  const [picking, setPicking] = useState(false);
  const bar = useRef<HTMLElement>(null);

  // The seated camera keeps the screens above the switcher.
  useEffect(() => {
    // The bar, not the picker that opens above it: picking a desk should not move the camera.
    const element = bar.current;
    // The switcher sits in the viewer, the area the camera frames.
    const parent = element?.parentElement?.parentElement;
    if (!element || !parent) return;
    const measure = () =>
      setHudInsetBottom(
        parent.getBoundingClientRect().bottom - element.getBoundingClientRect().top + 8,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      setHudInsetBottom(0);
    };
  }, [setHudInsetBottom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(false);
      if (!event.ctrlKey || event.altKey || event.metaKey || isEditable(event.target)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      stepDesk(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepDesk]);

  const full = desks.length >= MAX_DESKS;

  return (
    <div className={styles.switcher}>
      {picking && (
        <div className={styles.picker} role="dialog" aria-label="Add a desk">
          <div className={styles.pickerHeader}>
            <h3 className={styles.pickerTitle}>Add a desk</h3>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close"
              onClick={() => setPicking(false)}
            >
              ×
            </button>
          </div>
          <div className={styles.themes}>
            {product.workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                className={styles.theme}
                style={{ '--desk-accent': w.accent ?? 'var(--border-strong)' } as CSSProperties}
                onClick={() => {
                  addDesk(w.id);
                  setPicking(false);
                }}
              >
                <span className={styles.themeIcon} aria-hidden="true">
                  {w.icon ?? '🖥️'}
                </span>
                <span className={styles.themeText}>
                  <span className={styles.themeLabel}>{w.label}</span>
                  {w.description && (
                    <span className={styles.themeDescription}>{w.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <nav ref={bar} className={styles.bar} aria-label="Desks">
        <div className={styles.desks}>
          {desks.map((desk, i) => {
            const workspace = product.workspaces.find((w) => w.id === desk.workspaceId);
            const name = deskName(product, desks, desk);
            const current = desk.id === activeDeskId;
            return (
              <div
                key={desk.id}
                className={styles.desk}
                data-active={current || undefined}
                style={
                  { '--desk-accent': workspace?.accent ?? 'var(--text-muted)' } as CSSProperties
                }
              >
                <button
                  type="button"
                  className={styles.deskButton}
                  aria-current={current ? 'true' : undefined}
                  title={`Desk ${i + 1}: ${workspace?.description ?? name}`}
                  onClick={() => selectDesk(desk.id, current ? !seated : true)}
                >
                  <span aria-hidden="true">{workspace?.icon ?? '🖥️'}</span>
                  <span className={styles.deskName}>{name}</span>
                </button>
                {desks.length > 1 && (
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove the ${name} desk`}
                    title="Remove desk"
                    onClick={() => removeDesk(desk.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.add}
          aria-expanded={picking}
          disabled={full}
          title={full ? `Up to ${MAX_DESKS} desks in this demo` : 'Add a desk'}
          onClick={() => setPicking((open) => !open)}
        >
          + Add desk
        </button>
      </nav>
      <p className={styles.hint}>
        {desks.length} {desks.length === 1 ? 'desk' : 'desks'} · Ctrl + ← → to switch
      </p>
    </div>
  );
}
