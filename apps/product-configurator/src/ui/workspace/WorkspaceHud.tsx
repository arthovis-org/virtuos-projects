import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProduct } from '@/state/configuratorStore';
import { activeDesk, deskName, useDesksStore } from '@/state/desksStore';
import { useWorkspaceStore, workspaceById } from '@/state/workspaceStore';
import { DeskSwitcher } from './DeskSwitcher';
import styles from './WorkspaceHud.module.css';

/** More workspaces than this are picked from a menu instead of tabs. */
const MAX_TABS = 4;

/**
 * The workspace demo's own controls, over the viewer: a card to start it (one desk, or the
 * room of unlimited desks), then a toolbar while it runs (switch workspace, seated view or
 * looking around, reset, close) and the label that follows the pointer while a window is
 * dragged between screens. In the room, the desk switcher runs along the bottom.
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
  const desksMode = useDesksStore((s) => s.mode === 'desks');
  const desks = useDesksStore((s) => s.desks);
  const desk = useDesksStore(activeDesk);
  const enterDesks = useDesksStore((s) => s.enterDesks);
  const exitDesks = useDesksStore((s) => s.exitDesks);
  const setDeskWorkspace = useDesksStore((s) => s.setDeskWorkspace);
  const top = useRef<HTMLDivElement>(null);
  // On a phone the card would cover the desk: it starts folded into a pill.
  const [cardOpen, setCardOpen] = useState(() => !window.matchMedia('(max-width: 640px)').matches);

  // The camera keeps the screens below the toolbar, however tall it wraps.
  useEffect(() => {
    const element = top.current;
    if (!(active || desksMode) || !element) return;
    const measure = () => setHudInset(element.offsetTop + element.offsetHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, desksMode, setHudInset]);
  if (product.workspaces.length === 0) return null;

  const workspace = workspaceById(product, workspaceId);
  const [first, ...others] = product.workspaces;

  // The room always has its toolbar, even before a desk is chosen.
  if (!active && !desksMode) {
    // Hidden while the camera flies back from a workspace.
    if (!cameraFree || !first) return null;
    if (!cardOpen) {
      return (
        <button type="button" className={styles.pill} onClick={() => setCardOpen(true)}>
          <span className={styles.pillDot} aria-hidden="true" />
          Live demo · try the screens
        </button>
      );
    }
    return (
      <section className={styles.card} aria-labelledby="workspace-demo">
        <button
          type="button"
          className={styles.hide}
          aria-label="Hide the live demo card"
          title="Hide"
          onClick={() => setCardOpen(false)}
        >
          ×
        </button>
        <span className={styles.eyebrow}>Live demo</span>
        <h2 id="workspace-demo" className={styles.title}>
          Work on these screens
        </h2>
        {others.length === 0 ? (
          <>
            <p className={styles.description}>
              {first.description ??
                'Real websites on every monitor. Use them, and drag windows between screens.'}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={() => enter(first.id)}
              >
                Try the {first.label.toLowerCase()} workspace
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.description}>
              Real websites on every monitor. Pick a workspace to sit down at it.
            </p>
            <div className={styles.tiles} aria-label="Workspaces">
              {product.workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={styles.tile}
                  style={{ '--desk-accent': w.accent ?? 'var(--border-strong)' } as CSSProperties}
                  onClick={() => enter(w.id)}
                  title={w.description}
                >
                  <span className={styles.tileIcon} aria-hidden="true">
                    {w.icon ?? '🖥️'}
                  </span>
                  {w.label}
                </button>
              ))}
            </div>
            <div className={styles.more}>
              <h3 className={styles.moreTitle}>Unlimited desks</h3>
              <p className={styles.description}>
                Every workspace on its own desk, side by side around you, each with its own setup.
                Add as many as you like.
              </p>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={enterDesks}
              >
                Try unlimited desks →
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  const target = drag?.over ? product.screens.find((s) => s.id === drag.over?.screen) : undefined;
  const action = drag?.over?.action;

  const workspacePicker = (onPick: (id: string) => void, label: string) => (
    <select
      className={styles.select}
      value={workspace?.id ?? ''}
      aria-label={label}
      onChange={(event) => onPick(event.target.value)}
    >
      {product.workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.icon ? `${w.icon} ${w.label}` : w.label}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div ref={top} className={styles.top}>
        <div className={styles.bar} role="toolbar" aria-label="Workspace">
          {desksMode && !desk ? (
            <span className={`${styles.name} ${styles.prompt}`}>Pick a desk</span>
          ) : desksMode && desk ? (
            <>
              <span className={styles.name}>
                Desk {desks.indexOf(desk) + 1} · {deskName(product, desks, desk)}
              </span>
              {workspacePicker((id) => setDeskWorkspace(desk.id, id), 'Workspace of this desk')}
            </>
          ) : product.workspaces.length > MAX_TABS ? (
            <>
              <span className={styles.name}>Workspace</span>
              {workspacePicker(select, 'Workspace')}
            </>
          ) : product.workspaces.length > 1 ? (
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
          {(!desksMode || desk) && (
            <>
              <div className={styles.tabs} role="radiogroup" aria-label="Camera">
                <button
                  type="button"
                  role="radio"
                  aria-checked={seated}
                  className={styles.tab}
                  onClick={seated && focus ? () => setFocus(null) : sit}
                >
                  <span className={styles.long}>
                    {seated && focus ? 'All screens' : 'Seated view'}
                  </span>
                  <span className={styles.short}>{seated && focus ? 'All' : 'Seat'}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!seated}
                  className={styles.tab}
                  onClick={standUp}
                >
                  <span className={styles.long}>{desksMode ? 'All desks' : 'Look around'}</span>
                  <span className={styles.short}>{desksMode ? 'Desks' : 'Orbit'}</span>
                </button>
              </div>
              <button
                type="button"
                className={styles.button}
                onClick={resetWindows}
                aria-label="Reset windows"
                title="Reset windows"
              >
                <span className={styles.long}>Reset windows</span>
                <span className={styles.short} aria-hidden="true">
                  ↺
                </span>
              </button>
            </>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={desksMode ? exitDesks : close}
            aria-label={desksMode ? 'Back to one desk' : 'Close'}
          >
            <span className={styles.long}>{desksMode ? 'Back to one desk' : 'Close'}</span>
            <span className={styles.short} aria-hidden="true">
              {desksMode ? '1 desk' : '✕'}
            </span>
          </button>
        </div>
      </div>
      {desksMode && <DeskSwitcher />}
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
