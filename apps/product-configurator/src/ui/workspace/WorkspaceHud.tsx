import { useEffect, useRef } from 'react';
import { useProduct } from '@/state/configuratorStore';
import { useWorkspaceStore, workspaceById } from '@/state/workspaceStore';
import styles from './WorkspaceHud.module.css';

/**
 * The workspace demo's own controls, over the viewer: a card to start it, then a toolbar
 * while it runs (switch workspace, seated view or looking around, reset, close) and the
 * label that follows the pointer while a window is dragged between screens.
 */
export function WorkspaceHud() {
  const product = useProduct();
  const active = useWorkspaceStore((s) => s.active);
  const cameraFree = useWorkspaceStore((s) => s.cameraFree);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const focus = useWorkspaceStore((s) => s.focus);
  const drag = useWorkspaceStore((s) => s.drag);
  const enter = useWorkspaceStore((s) => s.enter);
  const seated = useWorkspaceStore((s) => s.seated);
  const standUp = useWorkspaceStore((s) => s.standUp);
  const sit = useWorkspaceStore((s) => s.sit);
  const close = useWorkspaceStore((s) => s.close);
  const select = useWorkspaceStore((s) => s.select);
  const resetWindows = useWorkspaceStore((s) => s.resetWindows);
  const setFocus = useWorkspaceStore((s) => s.setFocus);
  const setHudInset = useWorkspaceStore((s) => s.setHudInset);
  const top = useRef<HTMLDivElement>(null);

  // The camera keeps the screens below the toolbar, however tall it wraps.
  useEffect(() => {
    const element = top.current;
    if (!active || !element) return;
    const measure = () => setHudInset(element.offsetTop + element.offsetHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, setHudInset]);
  if (product.workspaces.length === 0) return null;

  const workspace = workspaceById(product, workspaceId);

  if (!active) {
    // Hidden while the camera flies back from a workspace.
    if (!cameraFree) return null;
    return (
      <section className={styles.card} aria-labelledby="workspace-demo">
        <span className={styles.eyebrow}>Live demo</span>
        <h2 id="workspace-demo" className={styles.title}>
          Work on these screens
        </h2>
        <p className={styles.description}>
          {product.workspaces.length === 1 && workspace?.description
            ? workspace.description
            : 'Real websites on every monitor. Use them, and drag windows between screens.'}
        </p>
        <div className={styles.actions}>
          {product.workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={() => enter(w.id)}
            >
              {product.workspaces.length === 1
                ? `Try the ${w.label.toLowerCase()} workspace`
                : w.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const target = drag?.over ? product.screens.find((s) => s.id === drag.over?.screen) : undefined;
  const action = drag?.over?.action;

  return (
    <>
      <div ref={top} className={styles.top}>
        <div className={styles.bar} role="toolbar" aria-label="Workspace">
          {product.workspaces.length > 1 ? (
            <div className={styles.tabs} role="radiogroup" aria-label="Workspace">
              {product.workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={w.id === workspace?.id}
                  className={styles.tab}
                  onClick={() => select(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.name}>{workspace?.label} workspace</span>
          )}
          <div className={styles.tabs} role="radiogroup" aria-label="Camera">
            <button
              type="button"
              role="radio"
              aria-checked={seated}
              className={styles.tab}
              onClick={seated && focus ? () => setFocus(null) : sit}
            >
              {seated && focus ? 'All screens' : 'Seated view'}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!seated}
              className={styles.tab}
              onClick={standUp}
            >
              Look around
            </button>
          </div>
          <button type="button" className={styles.button} onClick={resetWindows}>
            Reset windows
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={close}>
            Close
          </button>
        </div>
      </div>
      {drag && (
        <div className={styles.ghost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.title}
          <span className={styles.ghostTarget}>
            {!target
              ? 'Drop on a screen'
              : action === 'swap'
                ? `Swap · ${target.label}`
                : action === 'move'
                  ? `→ ${target.label}`
                  : `Side by side · ${target.label}`}
          </span>
        </div>
      )}
    </>
  );
}
