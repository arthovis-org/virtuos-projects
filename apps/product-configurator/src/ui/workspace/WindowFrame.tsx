import { useState, type PointerEvent } from 'react';
import type { Screen, WorkspaceWindow } from '@/catalog/schema';
import { useWorkspaceStore } from '@/state/workspaceStore';
import { siteUrl } from './siteUrl';
import styles from './WindowFrame.module.css';

interface WindowFrameProps {
  window: WorkspaceWindow;
  screenId: string;
  /** Screens the window can move to (the visible ones). */
  screens: readonly Screen[];
  /** Share of the screen, as a flex weight against the other windows on it. */
  grow: number;
}

// Keeps sites that need scripts, forms and their own storage working, while a sandbox still
// stops them from navigating the configurator itself.
const SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';

/**
 * One website on a screen: a title bar to drag it between screens, move it from a menu, zoom
 * the camera to its screen, open the site in a new tab (for sites that refuse to be shown
 * inside another page) or close it, and the site itself in an iframe.
 */
export function WindowFrame({ window: win, screenId, screens, grow }: WindowFrameProps) {
  const startDrag = useWorkspaceStore((s) => s.startDrag);
  const moveWindow = useWorkspaceStore((s) => s.moveWindow);
  const setFocus = useWorkspaceStore((s) => s.setFocus);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);
  const focused = useWorkspaceStore((s) => s.focus === screenId);
  const [iconFailed, setIconFailed] = useState(false);
  const url = siteUrl(win.url);
  const host = new URL(url).host;

  // Only starts the drag; the move and release are followed on the whole window (see
  // WorkspaceLayer), which keeps working even where pointer capture is unavailable.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('a, button, select')) return;
    event.preventDefault();
    startDrag(win, screenId, event.clientX, event.clientY);
  };

  return (
    <div className={styles.window} data-window-id={win.id} style={{ flexGrow: grow }}>
      <div
        className={styles.titleBar}
        onPointerDown={onPointerDown}
        title="Drag onto another screen"
      >
        {!iconFailed && (
          <img
            className={styles.icon}
            src={`https://${host}/favicon.ico`}
            alt=""
            width={24}
            height={24}
            referrerPolicy="no-referrer"
            onError={() => setIconFailed(true)}
          />
        )}
        <span className={styles.title}>{win.title}</span>
        <span className={styles.host}>{host}</span>
        <div className={styles.actions}>
          <select
            className={styles.move}
            aria-label={`Move ${win.title} to another screen`}
            value={screenId}
            onChange={(event) => moveWindow(win.id, event.target.value)}
          >
            {screens.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.button} ${styles.focus}`}
            aria-label={focused ? 'Show all screens' : `Zoom to the ${win.title} screen`}
            title={focused ? 'Show all screens' : 'Zoom to this screen'}
            onClick={() => setFocus(focused ? null : screenId)}
          >
            {focused ? '⤡' : '⤢'}
          </button>
          <a
            className={`${styles.button} ${styles.external}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${win.title} in a new tab`}
            title="Open in a new tab (if the site stays blank here)"
          >
            ↗
          </a>
          <button
            type="button"
            className={`${styles.button} ${styles.close}`}
            aria-label={`Close ${win.title}`}
            title="Close"
            onClick={() => closeWindow(win.id)}
          >
            ×
          </button>
        </div>
      </div>
      <iframe
        className={styles.frame}
        src={url}
        title={win.title}
        sandbox={SANDBOX}
        allow="fullscreen; clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
