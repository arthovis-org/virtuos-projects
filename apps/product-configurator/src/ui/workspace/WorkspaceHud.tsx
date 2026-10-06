import { useEffect, useState, type CSSProperties } from 'react';
import { enterRoom, enterWorkspace, exitRoom, switchWorkspace } from '@/state/actions';
import { currentDesk, deskName, workspaceById } from '@/state/setup';
import { useCurrentWindows, useProduct, useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { DeskArrows } from './DeskArrows';
import { DeskSwitcher } from './DeskSwitcher';
import { WindowMenu } from './WindowMenu';
import styles from './WorkspaceHud.module.css';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';

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
  const active = useViewStore((s) => s.active);
  const cameraFree = useViewStore((s) => s.cameraFree);
  const { workspaceId } = useCurrentWindows();
  const focus = useViewStore((s) => s.focus);
  const drag = useViewStore((s) => s.drag);
  const seated = useViewStore((s) => s.seated);
  const aroundDesk = useViewStore((s) => s.aroundDesk);
  const standUp = useViewStore((s) => s.standUp);
  const sit = useViewStore((s) => s.sit);
  const close = useViewStore((s) => s.close);
  const resetWindows = useSetupStore((s) => s.resetWindows);
  const setFocus = useViewStore((s) => s.setFocus);
  const setHudInset = useViewStore((s) => s.setHudInset);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  const desks = useSetupStore((s) => s.room);
  const desk = useSetupStore((s) => (s.mode === 'desks' ? currentDesk(s) : undefined));
  const setDeskWorkspace = useSetupStore((s) => s.setDeskWorkspace);
  // Whatever is over the top of the viewer: the card, its pill or the toolbar.
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  // On a phone the card would cover the desk: it starts folded into a pill.
  const [cardOpen, setCardOpen] = useState(
    () =>
      !window.matchMedia('(max-width: 640px), (orientation: landscape) and (max-height: 500px)')
        .matches,
  );

  // The camera keeps the desks (and, seated, the screens) below whatever is over the top of
  // the viewer, however tall it wraps.
  useEffect(() => {
    if (!overlay) {
      setHudInset(0);
      return;
    }
    const measure = () => setHudInset(overlay.offsetTop + overlay.offsetHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, [overlay, setHudInset]);
  if (product.workspaces.length === 0) return null;

  const workspace = workspaceById(product, workspaceId);
  const [first, ...others] = product.workspaces;

  // The room always has its toolbar, even before a desk is chosen.
  if (!active && !desksMode) {
    // Hidden while the camera flies back from a workspace.
    if (!cameraFree || !first) return null;
    if (!cardOpen) {
      return (
        <button
          ref={setOverlay}
          type="button"
          className={styles.pill}
          onClick={() => setCardOpen(true)}
        >
          <span className={styles.pillDot} aria-hidden="true" />
          Live demo · try the screens
        </button>
      );
    }
    return (
      <section ref={setOverlay} className={styles.card} aria-labelledby="workspace-demo">
        <button
          type="button"
          className={styles.hide}
          aria-label="Hide the live demo card"
          title="Hide"
          onClick={() => setCardOpen(false)}
        >
          ×
        </button>
        <div className={styles.cardBody}>
          {others.length === 0 ? (
            <div className={styles.intro}>
              <span className={styles.eyebrow}>Live demo</span>
              <h2 id="workspace-demo" className={styles.title}>
                Work on these screens
              </h2>
              <p className={styles.description}>
                {first.description ??
                  'Real websites on every monitor. Use them, and drag windows between screens.'}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.primary}`}
                  onClick={() => enterWorkspace(first.id)}
                >
                  Try the {first.label.toLowerCase()} workspace
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.intro}>
                <span className={styles.eyebrow}>Live demo</span>
                <h2 id="workspace-demo" className={styles.title}>
                  Work on these screens
                </h2>
                <p className={styles.description}>
                  Real websites on every monitor. Pick a workspace to sit down at it.
                </p>
              </div>
              <div className={styles.tiles} aria-label="Workspaces">
                {product.workspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={styles.tile}
                    style={{ '--desk-accent': w.accent ?? 'var(--border-strong)' } as CSSProperties}
                    onClick={() => enterWorkspace(w.id)}
                    title={w.description}
                  >
                    <span className={styles.tileIcon} aria-hidden="true">
                      <WorkspaceIcon name={w.icon} size={15} />
                    </span>
                    {w.label}
                  </button>
                ))}
              </div>
              <div className={styles.more}>
                <h3 className={styles.moreTitle}>Unlimited desks</h3>
                <p className={styles.description}>
                  Every workspace on its own desk, around you. Add as many as you like.
                </p>
                <button
                  type="button"
                  className={`${styles.button} ${styles.primary}`}
                  onClick={enterRoom}
                >
                  Try unlimited desks →
                </button>
              </div>
            </>
          )}
        </div>
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
          {w.label}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div ref={setOverlay} className={styles.top}>
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
              {workspacePicker(switchWorkspace, 'Workspace')}
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
                  onClick={() => switchWorkspace(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.name}>{workspace?.label} workspace</span>
          )}
          {(!desksMode || desk) && (
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
          )}
          {!desksMode && others.length > 0 && (
            // The way into the room once the demo card has given way to this toolbar (on a
            // phone the header has no room for the switch).
            <button
              type="button"
              className={styles.button}
              onClick={enterRoom}
              aria-label="Unlimited desks"
              title="A desk for every workspace"
            >
              <span className={styles.long}>Unlimited desks</span>
              <span className={styles.short} aria-hidden="true">
                ∞ Desks
              </span>
            </button>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={desksMode ? exitRoom : close}
            aria-label={desksMode ? 'Back to one desk' : 'Close'}
          >
            <span className={styles.long}>{desksMode ? 'Back to one desk' : 'Close'}</span>
            <span className={styles.short} aria-hidden="true">
              {desksMode ? '1 desk' : '✕'}
            </span>
          </button>
        </div>
        {/* How the desk is seen, in a row of its own under the toolbar. */}
        {(!desksMode || desk) && (
          <div className={styles.views}>
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
              {/* Orbiting the desk; in the room, the desk the visitor is at. */}
              <button
                type="button"
                role="radio"
                aria-checked={!seated && (!desksMode || aroundDesk)}
                className={styles.tab}
                onClick={() => standUp(desksMode)}
              >
                <span className={styles.long}>Look around</span>
                <span className={styles.short}>Orbit</span>
              </button>
              {desksMode && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={!seated && !aroundDesk}
                  className={styles.tab}
                  onClick={() => standUp(false)}
                >
                  <span className={styles.long}>All desks</span>
                  <span className={styles.short}>Desks</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {desksMode && <DeskSwitcher />}
      {desksMode && <DeskArrows />}
      <WindowMenu />
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
