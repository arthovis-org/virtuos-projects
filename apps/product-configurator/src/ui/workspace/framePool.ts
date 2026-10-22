import { getProduct } from '@/catalog';
import { desktopWindows, isDesktop, registerWindowFrame, windowFrameName } from '@/desktop';
import { deskWindows, findDesk } from '@/state/setup';
import { currentSetup } from '@/state/setupStore';

/**
 * The windows' frames, kept loaded while their desk is away (desktop app). Leaving a desk
 * used to take its windows' frames out of the page, so coming back loaded every site afresh
 * (TinyGnomes through its welcome page). Now a frame is moved, without a reload
 * (`moveBefore`), into a hidden parking place off the page, which the browser doesn't draw,
 * and back into its window when the desk returns: as it was, open dialogs and all. The
 * frames of the last few desks left are kept, and TinyGnomes' on every desk; older ones are let
 * go (and load afresh, at the page they were on). Moving a window to another screen keeps its frame too.
 *
 * On the website, or a browser without `moveBefore`, a window's frame is made and let go
 * with the window, as before (video on a parked desk couldn't be paused there).
 */

/** Desks left whose frames are kept loaded, besides the one the visitor is at. */
const KEPT_DESKS = 3;

/**
 * Sites kept loaded on every desk left, however many: the ones worked in across desks
 * (TinyGnomes), so going back to one carries on where it was, never from its welcome page.
 */
const ALWAYS_KEPT = /(^|\.)tinygnomes\.com$/i;

const alwaysKept = (url: string) => {
  try {
    return ALWAYS_KEPT.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

export interface PooledFrame {
  key: string;
  frame: HTMLIFrameElement;
  deskId: string;
  windowId: string;
  /** The address the window was opened at (its identity with its window). */
  url: string;
  /** When it was parked; null while in a window. */
  parkedAt: number | null;
  unregister: () => void;
}

/** A frame can be moved without reloading it. */
const canMove =
  typeof Element !== 'undefined' &&
  typeof (Element.prototype as { moveBefore?: unknown }).moveBefore === 'function';

/** Frames are kept while their desk is away: in the desktop app, which can pause their media. */
export const keepsFrames = isDesktop && canMove && !!desktopWindows;

const pool = new Map<string, PooledFrame>();
let parking: HTMLDivElement | null = null;

const keyOf = (deskId: string, windowId: string, url: string) =>
  JSON.stringify([deskId, windowId, url]);

/**
 * Moves `node` into `parent` without reloading it (a frame stays as it is). A new frame, not in
 * the page yet, is simply added (`moveBefore` only moves what is in the page already).
 */
function moveInto(parent: Element, node: Element) {
  if (node.parentElement === parent) return;
  if (canMove && node.isConnected && parent.isConnected) {
    (parent as Element & { moveBefore: (n: Node, c: Node | null) => void }).moveBefore(node, null);
  } else {
    parent.appendChild(node);
  }
}

/** The hidden place parked frames wait in: off the page, not drawn, not in the way. */
function parkingPlace(): HTMLDivElement {
  if (parking?.isConnected) return parking;
  parking = document.createElement('div');
  parking.setAttribute('aria-hidden', 'true');
  parking.style.cssText =
    'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
  document.body.appendChild(parking);
  return parking;
}

/** Frame attributes that keep sites working while stopping them from navigating the page. */
export interface FrameSettings {
  url: string;
  startUrl: string;
  title: string;
  sandbox: string;
  allow: string;
}

/**
 * The frame for a window: the one kept for it if any (parked while its desk was away, or as it
 * moved to another screen), else a new one loading `startUrl`.
 */
export function takeFrame(deskId: string, windowId: string, settings: FrameSettings): PooledFrame {
  const key = keyOf(deskId, windowId, settings.url);
  const kept = pool.get(key);
  if (kept?.frame.isConnected) {
    kept.parkedAt = null;
    return kept;
  }
  const frame = document.createElement('iframe');
  const name = windowFrameName();
  frame.name = name;
  frame.title = settings.title;
  frame.setAttribute('sandbox', settings.sandbox);
  frame.setAttribute('allow', settings.allow);
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.loading = 'lazy';
  frame.src = settings.startUrl;
  const entry: PooledFrame = {
    key,
    frame,
    deskId,
    windowId,
    url: settings.url,
    parkedAt: null,
    unregister: registerWindowFrame(name, deskId, windowId),
  };
  pool.set(key, entry);
  return entry;
}

/** How many windows' frames are on screens, and how many are parked (performance panel). */
export function frameCounts() {
  let parked = 0;
  for (const entry of pool.values()) if (entry.parkedAt !== null) parked++;
  return { live: pool.size - parked, parked };
}

/** Puts a window's frame into it. */
export function showFrame(entry: PooledFrame, host: HTMLElement) {
  moveInto(host, entry.frame);
}

function dropFrame(entry: PooledFrame) {
  entry.unregister();
  entry.frame.remove();
  if (pool.get(entry.key) === entry) pool.delete(entry.key);
}

/**
 * A window's frame as its window goes (another desk, view or screen): parked at the size it
 * had, its media paused, when frames are kept; else let go.
 */
export function releaseFrame(entry: PooledFrame, width: number, height: number) {
  if (!keepsFrames) {
    dropFrame(entry);
    return;
  }
  // Laid out at the size it had, so the site doesn't lay itself out again when it comes back.
  if (width > 0 && height > 0) {
    entry.frame.style.width = `${width}px`;
    entry.frame.style.height = `${height}px`;
  }
  moveInto(parkingPlace(), entry.frame);
  entry.parkedAt = Date.now();
  // A window moving to another screen takes its frame back at once: nothing to do then.
  setTimeout(() => {
    if (entry.parkedAt === null || pool.get(entry.key) !== entry) return;
    desktopWindows?.pauseMedia?.(entry.frame.name);
    tidy();
  }, 0);
}

/**
 * Lets go of parked frames no longer wanted: their window closed or its desk gone, and those
 * of all but the last few desks left (but TinyGnomes').
 */
function tidy() {
  const setup = currentSetup();
  const product = getProduct(setup.productId);
  const parked = [...pool.values()].filter((e) => e.parkedAt !== null);
  for (const entry of parked) {
    const desk = findDesk(setup, entry.deskId);
    const open =
      desk &&
      deskWindows(product, desk).some((w) => w.id === entry.windowId && w.url === entry.url);
    if (!open) dropFrame(entry);
  }
  const desks = new Map<string, number>();
  for (const entry of pool.values()) {
    if (entry.parkedAt === null) continue;
    desks.set(entry.deskId, Math.max(desks.get(entry.deskId) ?? 0, entry.parkedAt));
  }
  const showing = new Set(
    [...pool.values()].filter((e) => e.parkedAt === null).map((e) => e.deskId),
  );
  const away = [...desks.entries()]
    .filter(([deskId]) => !showing.has(deskId))
    .sort((a, b) => b[1] - a[1])
    .slice(KEPT_DESKS)
    .map(([deskId]) => deskId);
  for (const entry of [...pool.values()]) {
    if (entry.parkedAt !== null && away.includes(entry.deskId) && !alwaysKept(entry.url)) {
      dropFrame(entry);
    }
  }
}
