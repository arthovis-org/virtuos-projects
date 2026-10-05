import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProduct } from '@/state/setupStore';
import { addDesk, addPlannedDesk, removeDesk, selectDesk, stepDesk } from '@/state/actions';
import { deskName, MAX_DESKS } from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { deskTrashAttribute } from './deskDrag';
import { canPlanWithAI, planOneDesk } from '@/sheet/sheetSources';
import styles from './DeskSwitcher.module.css';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';

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
  const desks = useSetupStore((s) => s.room);
  const activeDeskId = useSetupStore((s) => s.activeDeskId);
  const seated = useViewStore((s) => s.seated);
  const deskDrag = useViewStore((s) => s.deskDrag);
  const setHudInsetBottom = useViewStore((s) => s.setHudInsetBottom);
  const [picking, setPicking] = useState(false);
  // "Create with AI" in the picker: what the desk is for, and the request under way.
  const [idea, setIdea] = useState('');
  const [creating, setCreating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const createWithAI = async () => {
    if (!idea.trim() || creating) return;
    setCreating(true);
    setAiError(null);
    try {
      const desk = await planOneDesk(product, idea);
      if (addPlannedDesk(desk)) {
        setIdea('');
        setPicking(false);
      } else {
        setAiError('The room is full.');
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Something went wrong; try again');
    } finally {
      setCreating(false);
    }
  };
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
  }, []);

  const full = desks.length >= MAX_DESKS;
  const nameOf = (id: string | null | undefined) => {
    const desk = desks.find((d) => d.id === id);
    return desk ? deskName(product, desks, desk) : '';
  };

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
          {canPlanWithAI && (
            <form
              className={styles.ai}
              onSubmit={(event) => {
                event.preventDefault();
                void createWithAI();
              }}
            >
              <label className={styles.aiLabel} htmlFor="desk-idea">
                <Sparkles size={14} aria-hidden="true" /> Create a desk with AI
              </label>
              <div className={styles.aiRow}>
                <input
                  id="desk-idea"
                  className={styles.aiInput}
                  value={idea}
                  maxLength={300}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="What is it for? e.g. Following Formula 1 race weekends"
                  disabled={creating}
                />
                <button
                  type="submit"
                  className={styles.aiButton}
                  disabled={creating || !idea.trim()}
                >
                  {creating ? (
                    <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                  ) : (
                    <Sparkles size={14} aria-hidden="true" />
                  )}
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
              {aiError && (
                <p className={styles.aiError} role="status">
                  {aiError}
                </p>
              )}
              <p className={styles.aiOr}>or pick a theme</p>
            </form>
          )}
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
                  <WorkspaceIcon name={w.icon} size={22} />
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
                  <WorkspaceIcon name={workspace?.icon} size={15} />
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
        {!seated && desks.length > 1 && ' · drag a desk onto another to swap, or to the trash'}
      </p>
      {/* The trash shows only while a desk is dragged, and never for the last desk. */}
      {deskDrag && desks.length > 1 && (
        <div
          className={styles.trash}
          data-over={deskDrag.trash || undefined}
          {...deskTrashAttribute}
          aria-hidden="true"
        >
          <Trash2 size={22} />
          <span>{deskDrag.trash ? 'Release to remove' : 'Drop here to remove'}</span>
        </div>
      )}
      {deskDrag && (
        <div
          className={styles.ghost}
          data-trash={deskDrag.trash || undefined}
          style={{ left: deskDrag.x, top: deskDrag.y }}
          aria-hidden="true"
        >
          {nameOf(deskDrag.deskId)}
          <span className={styles.ghostTarget}>
            {deskDrag.trash
              ? 'Remove this desk'
              : deskDrag.over
                ? `⇄ Swap with ${nameOf(deskDrag.over)}`
                : desks.length > 1
                  ? 'Drop on another desk, or on the trash'
                  : 'Drop on another desk'}
          </span>
        </div>
      )}
    </div>
  );
}
