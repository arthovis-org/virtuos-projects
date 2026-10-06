import { isBlankWindow, layoutWindows } from '@/state/setup';
import { useCurrentWindows, useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { siteUrl } from './siteUrl';
import styles from './WindowMenu.module.css';

/**
 * A window's controls for touch screens, over the viewer at a size fingers can hit: zoom to
 * its screen, move it to another, open it in a new tab, close it. On a phone the monitors are
 * shown small, and the same buttons in the window's title bar would be specks.
 */
export function WindowMenu() {
  const menu = useViewStore((s) => s.menu);
  const active = useViewStore((s) => s.active);
  const { windows, placement, order } = useCurrentWindows();
  const surfaces = useViewStore((s) => s.surfaces);
  const primaryScreen = useViewStore((s) => s.primaryScreen);
  const focus = useViewStore((s) => s.focus);
  const setMenu = useViewStore((s) => s.setMenu);
  const setFocus = useViewStore((s) => s.setFocus);
  const moveWindow = useSetupStore((s) => s.moveWindow);
  const closeWindow = useSetupStore((s) => s.closeWindow);

  if (!menu || !active) return null;
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
  // A blank window has no site to name or open yet.
  const blank = isBlankWindow(win);
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
          {!blank && <span className={styles.host}>{new URL(url).host}</span>}
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
          {!blank && (
            <a className={styles.action} href={url} target="_blank" rel="noreferrer" onClick={done}>
              <span aria-hidden="true">↗</span>
              Open in a new tab
            </a>
          )}
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
