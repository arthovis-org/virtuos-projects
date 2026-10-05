import { useProduct } from '@/state/configuratorStore';
import {
  layoutWindows,
  openWindows,
  useWorkspaceStore,
  workspaceById,
} from '@/state/workspaceStore';
import { siteUrl } from './siteUrl';
import styles from './WindowMenu.module.css';

/**
 * A window's controls for touch screens, over the viewer at a size fingers can hit: zoom to
 * its screen, move it to another, open it in a new tab, close it. On a phone the monitors are
 * shown small, and the same buttons in the window's title bar would be specks.
 */
export function WindowMenu() {
  const product = useProduct();
  const menu = useWorkspaceStore((s) => s.menu);
  const active = useWorkspaceStore((s) => s.active);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const closed = useWorkspaceStore((s) => s.closed);
  const opened = useWorkspaceStore((s) => s.opened);
  const placement = useWorkspaceStore((s) => s.placement);
  const order = useWorkspaceStore((s) => s.order);
  const surfaces = useWorkspaceStore((s) => s.surfaces);
  const primaryScreen = useWorkspaceStore((s) => s.primaryScreen);
  const focus = useWorkspaceStore((s) => s.focus);
  const setMenu = useWorkspaceStore((s) => s.setMenu);
  const setFocus = useWorkspaceStore((s) => s.setFocus);
  const moveWindow = useWorkspaceStore((s) => s.moveWindow);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);

  if (!menu || !active) return null;
  const windows = openWindows(workspaceById(product, workspaceId), closed, opened);
  const win = windows.find((w) => w.id === menu);
  if (!win) return null;
  const screens = surfaces.map((s) => s.screen);
  const layout = layoutWindows(
    windows,
    placement,
    order,
    screens.map((s) => s.id),
    primaryScreen,
  );
  const screenId = [...layout].find(([, list]) => list.some((w) => w.id === win.id))?.[0];
  const url = siteUrl(win.url);
  const done = () => setMenu(null);
  const zoomed = focus !== null && focus === screenId;

  return (
    <div className={styles.backdrop} onClick={done}>
      <div
        className={styles.menu}
        role="dialog"
        aria-label={`${win.title} window`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>{win.title}</span>
          <span className={styles.host}>{new URL(url).host}</span>
        </div>
        <div className={styles.actions}>
          {screenId && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setFocus(zoomed ? null : screenId);
                done();
              }}
            >
              <span aria-hidden="true">{zoomed ? '⤡' : '⤢'}</span>
              {zoomed ? 'Show all screens' : 'Zoom to this screen'}
            </button>
          )}
          <a className={styles.action} href={url} target="_blank" rel="noreferrer" onClick={done}>
            <span aria-hidden="true">↗</span>
            Open in a new tab
          </a>
          <button
            type="button"
            className={`${styles.action} ${styles.danger}`}
            onClick={() => {
              closeWindow(win.id);
              done();
            }}
          >
            <span aria-hidden="true">✕</span>
            Close window
          </button>
        </div>
        {screens.length > 1 && (
          <div className={styles.move}>
            <span className={styles.moveLabel}>Move to</span>
            <div className={styles.screens}>
              {screens.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  className={styles.screen}
                  aria-pressed={screen.id === screenId}
                  onClick={() => {
                    if (screen.id !== screenId) moveWindow(win.id, screen.id);
                    done();
                  }}
                >
                  {screen.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="button" className={styles.cancel} onClick={done}>
          Cancel
        </button>
      </div>
    </div>
  );
}
