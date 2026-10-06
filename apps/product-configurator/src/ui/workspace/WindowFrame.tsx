import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { Screen, WorkspaceWindow } from '@/catalog/schema';
import { framesAnySite } from '@/desktop';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { useEmbeddable } from './embeddable';
import { screenUrl } from './embedUrls';
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

/** A touch screen: the title bar's buttons are too small to tap; a menu takes their place. */
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

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
  const startDrag = useViewStore((s) => s.startDrag);
  const moveWindow = useSetupStore((s) => s.moveWindow);
  const setFocus = useViewStore((s) => s.setFocus);
  const closeWindow = useSetupStore((s) => s.closeWindow);
  const setMenu = useViewStore((s) => s.setMenu);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const focused = useViewStore((s) => s.focus === screenId);
  const [iconFailed, setIconFailed] = useState(false);
  // What the screen shows: the embeddable version of the page when it has one (a YouTube link
  // as YouTube's player), and in the desktop app the site itself (an embed link as the site).
  // The title bar and "open in a new tab" name the page as given, or in the app what it shows.
  const shownUrl = siteUrl(screenUrl(win.url));
  const url = framesAnySite ? shownUrl : siteUrl(win.url);
  const host = new URL(url).host;
  const embeddable = useEmbeddable(win.url);
  // A blocked site shown anyway, to see for oneself that it stays blank.
  const [tryAnyway, setTryAnyway] = useState(false);

  // Only starts the drag; the move and release are followed on the whole window (see
  // WorkspaceLayer), which keeps working even where pointer capture is unavailable.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('a, button, select')) return;
    event.preventDefault();
    pressedAt.current = { x: event.clientX, y: event.clientY };
    startDrag(win, screenId, event.clientX, event.clientY);
  };

  // On a touch screen a tap on the title bar (not a drag) opens the window's menu.
  const onTitleClick = (event: MouseEvent<HTMLDivElement>) => {
    const at = pressedAt.current;
    pressedAt.current = null;
    if (!isTouch() || !at || (event.target as HTMLElement).closest('a, button, select')) return;
    if (Math.hypot(event.clientX - at.x, event.clientY - at.y) < 10) setMenu(win.id);
  };

  return (
    <div className={styles.window} data-window-id={win.id} style={{ flexGrow: grow }}>
      <div
        className={styles.titleBar}
        onPointerDown={onPointerDown}
        onClick={onTitleClick}
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
        {/* Touch screens: one big button for the window's menu, instead of the row below. */}
        <button
          type="button"
          className={`${styles.button} ${styles.more}`}
          aria-label={`${win.title}: window menu`}
          onClick={() => setMenu(win.id)}
        >
          ⋯
        </button>
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
      {embeddable || tryAnyway ? (
        <>
          {/* Trying a blocked site anyway: it usually stays blank; say why, and go back. */}
          {!embeddable && (
            <div className={styles.tryBar}>
              <span>Trying {host} anyway: its embedding restrictions usually keep it blank.</span>
              <button type="button" onClick={() => setTryAnyway(false)}>
                Back
              </button>
            </div>
          )}
          <iframe
            className={styles.frame}
            src={shownUrl}
            title={win.title}
            sandbox={SANDBOX}
            allow="fullscreen; clipboard-read; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        </>
      ) : (
        // The site refuses to be shown inside another page: say so, instead of the
        // browser's broken-page icon.
        <div className={styles.blocked}>
          <p className={styles.blockedTitle}>{host} is blocked</p>
          <p className={styles.blockedText}>
            Its embedding restrictions don’t allow other pages to show it, so it can’t appear on
            this screen. Open it in its own tab instead.
          </p>
          <div className={styles.blockedActions}>
            <a className={styles.blockedLink} href={url} target="_blank" rel="noreferrer">
              Open {host} ↗
            </a>
            <button type="button" className={styles.blockedTry} onClick={() => setTryAnyway(true)}>
              Try to show it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
