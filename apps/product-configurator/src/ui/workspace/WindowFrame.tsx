import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { WorkspaceWindow } from '@/catalog/schema';
import { framesAnySite } from '@/desktop';
import {
  currentDesk,
  FIT_WIDTH,
  isBlankWindow,
  MAX_ZOOM,
  MIN_ZOOM,
  sameSite,
  type WindowZoom,
} from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { useSiteZoomStore } from '@/state/siteZoomStore';
import { useViewStore } from '@/state/viewStore';
import { useEmbeddable } from './embeddable';
import { BlankWindowPicker } from './EmptyScreen';
import { agentAppOf } from '@/agents/agentDesk';
import { useAgentStore } from '@/agents/agentStore';
import { AgentAppView } from '@/agents/apps/AgentApps';
import { screenUrl } from './embedUrls';
import { siteUrl, windowTitle } from './siteUrl';
import { ZoomControl } from './ZoomControl';
import { releaseFrame, showFrame, takeFrame, type PooledFrame } from './framePool';
import styles from './WindowFrame.module.css';

interface WindowFrameProps {
  window: WorkspaceWindow;
  screenId: string;
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
 * One website on a screen: a title bar to drag it between screens, set its page zoom, zoom the
 * camera to its screen or close it, and the site itself in an iframe. (On touch screens a
 * menu also moves it to another screen and opens it in a new tab: see WindowMenu.)
 */
export function WindowFrame({ window: win, screenId, grow }: WindowFrameProps) {
  const startDrag = useViewStore((s) => s.startDrag);
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
  // A blank window (a split's other half) has no site yet: a picker instead (isBlankWindow).
  const blank = isBlankWindow(win);
  const title = windowTitle(win.title, win.url);
  // An agent app (agent: address): drawn by the configurator, for the agent at this desk.
  const agentApp = agentAppOf(win.url);
  const deskId = useSetupStore((s) => (currentDesk(s) ?? s.single).id);
  const agent = useAgentStore((s) => (agentApp ? s.agents[deskId] : undefined));
  const host = blank || agentApp ? '' : new URL(url).host;
  const embeddable = useEmbeddable(win.url);
  // A blocked site shown anyway, to see for oneself that it stays blank.
  const [tryAnyway, setTryAnyway] = useState(false);
  // The window's own zoom (saved in layouts; a window opened on a site starts at the zoom last
  // set for it, see `withSiteZoom`): setting one window's zoom changes only that window.
  const zoom = useSetupStore((s) => (currentDesk(s) ?? s.single).windows.zoom?.[win.id]) ?? 1;
  // Where the site opens: the page it was last on, if it is still on the same site (in the
  // desktop app, which sees where sites go: a TinyGnomes task, not its start page, after
  // another desk and back). Read once, as the window appears; the site goes on by itself.
  const startUrl = useMemo(() => {
    const state = useSetupStore.getState();
    const visited = (currentDesk(state) ?? state.single).windows.visited?.[win.id];
    return visited && sameSite(visited, shownUrl) ? visited : shownUrl;
  }, [shownUrl, win.id]);
  const zoomWindow = useSetupStore((s) => s.zoomWindow);
  const rememberZoom = useSiteZoomStore((s) => s.remember);
  const [zoomBox, setZoomBox] = useState<HTMLDivElement | null>(null);
  // While the percentage is dragged, the page follows it; the zoom is set when the drag ends.
  const [preview, setPreview] = useState<number | null>(null);
  const fitted = useZoomFactor(zoom, zoomBox);
  const factor = preview ?? fitted;

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
        {!iconFailed && !blank && !agentApp && (
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
        <span className={styles.title}>{title}</span>
        <span className={styles.host}>{agent ? `${agent.name} · ${agent.role}` : host}</span>
        <div className={styles.zoom}>
          {!blank && !agentApp && (
            <ZoomControl
              title={title}
              zoom={zoom}
              factor={factor}
              onPreview={setPreview}
              onZoom={(next) => {
                zoomWindow(win.id, next);
                rememberZoom(host, next);
              }}
            />
          )}
        </div>
        {/* Touch screens: one big button for the window's menu, instead of the row below. */}
        <button
          type="button"
          className={`${styles.button} ${styles.more}`}
          aria-label={`${title}: window menu`}
          onClick={() => setMenu(win.id)}
        >
          ⋯
        </button>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.focus}`}
            aria-label={focused ? 'Show all screens' : `Zoom to the ${title} screen`}
            title={focused ? 'Show all screens' : 'Zoom to this screen'}
            onClick={() => setFocus(focused ? null : screenId)}
          >
            {focused ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.close}`}
            aria-label={`Close ${title}`}
            title="Close"
            onClick={() => closeWindow(win.id)}
          >
            ×
          </button>
        </div>
      </div>
      {agentApp ? (
        <div className={styles.viewport}>
          <AgentAppView app={agentApp} deskId={deskId} />
        </div>
      ) : blank ? (
        <div className={styles.blankBody}>
          <BlankWindowPicker screenId={screenId} blankId={win.id} />
        </div>
      ) : embeddable || tryAnyway ? (
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
          {/* The page laid out larger or smaller than the window and scaled to fill it, as a
              browser zooms; the frame itself stays (a zoom never reloads the site). */}
          <div ref={setZoomBox} className={styles.viewport}>
            <FrameSlot
              deskId={deskId}
              windowId={win.id}
              url={win.url}
              startUrl={startUrl}
              title={title}
              factor={factor}
            />
          </div>
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

/** A frame laid out larger or smaller than its window and scaled to fill it (`factor`). */
function sizeFrame(frame: HTMLIFrameElement, factor: number) {
  const { style } = frame;
  style.width = factor === 1 ? '' : `${100 / factor}%`;
  style.height = factor === 1 ? '' : `${100 / factor}%`;
  style.transform = factor === 1 ? '' : `scale(${factor})`;
}

/**
 * Where a window's site is shown: its frame, from the frame pool (kept loaded while its desk is
 * away, in the desktop app: see framePool.ts), laid out larger or smaller and scaled (`factor`).
 */
function FrameSlot({
  deskId,
  windowId,
  url,
  startUrl,
  title,
  factor,
}: {
  deskId: string;
  windowId: string;
  url: string;
  startUrl: string;
  title: string;
  factor: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef<PooledFrame | null>(null);
  // `startUrl` and `title` only matter when a frame is made: read as it is made.
  const settings = useRef({ startUrl, title, factor });
  useLayoutEffect(() => {
    settings.current = { startUrl, title, factor };
  });

  useLayoutEffect(() => {
    const box = host.current;
    if (!box) return;
    const taken = takeFrame(deskId, windowId, {
      url,
      startUrl: settings.current.startUrl,
      title: settings.current.title,
      sandbox: SANDBOX,
      allow: 'fullscreen; clipboard-read; clipboard-write',
    });
    taken.frame.className = styles.frame ?? '';
    sizeFrame(taken.frame, settings.current.factor);
    showFrame(taken, box);
    current.current = taken;
    return () => {
      current.current = null;
      const rect = taken.frame.getBoundingClientRect();
      releaseFrame(
        taken,
        taken.frame.offsetWidth || rect.width,
        taken.frame.offsetHeight || rect.height,
      );
    };
  }, [deskId, windowId, url]);

  useLayoutEffect(() => {
    const taken = current.current;
    if (!taken) return;
    taken.frame.title = title;
    sizeFrame(taken.frame, factor);
  }, [title, factor]);

  return <div ref={host} className={styles.frameSlot} />;
}

/**
 * The factor a window's page is scaled by: its zoom, or for 'fit' the width of the box the
 * page fills over the desktop width the page is laid out at.
 */
function useZoomFactor(zoom: WindowZoom, box: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box || zoom !== 'fit') return;
    // The layout width: the 3D transforms that put the screen in place don't change it.
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, [box, zoom]);
  if (zoom !== 'fit') return zoom;
  return width > 0 ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, width / FIT_WIDTH)) : 1;
}
