/**
 * State for workspace mode: live websites on the product's screens. Kept apart from the
 * configurator store because it is a demo, never priced and never part of a shared link.
 */
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import type { ProductDefinition, Screen, Workspace, WorkspaceWindow } from '@/catalog/schema';
import { useConfiguratorStore } from './configuratorStore';

/**
 * What dropping a dragged window does: onto an empty screen it moves there; onto a window it
 * goes next to it (`before` / `after`: left or right, above or below on a portrait screen) or
 * trades places with it (`swap`).
 */
export type DropAction = 'move' | 'before' | 'after' | 'swap';

export interface DropTarget {
  screen: string;
  action: DropAction;
  /** The window dropped next to or swapped with. */
  windowId?: string | undefined;
  /** Area the window would take, in the screen's CSS pixels, for the preview. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface WindowDrag {
  windowId: string;
  title: string;
  /** Screen the window is on while it is dragged. */
  fromScreen: string;
  /** Pointer position in viewport pixels. */
  x: number;
  y: number;
  /** Where the window would land. */
  over: DropTarget | null;
}

export interface ScreenSizes {
  /** The windows the sizes were set for, in tiling order. */
  windows: readonly string[];
  weights: readonly number[];
}

/**
 * Flex weights for the windows on a screen: the visitor's, if they were set for exactly these
 * windows, else equal. A window's size means nothing on another screen or next to other
 * windows, so a spec change that moves windows gives an even split, and switching back brings
 * the visitor's sizes back. Scaled to add up to the window count: flex fills a screen only
 * when the weights add up to at least 1.
 */
export function screenWeights(
  sizes: WorkspaceState['sizes'],
  screenId: string,
  windows: readonly string[],
): number[] {
  const stored = sizes[screenId];
  const same =
    stored?.windows.length === windows.length && stored.windows.every((w, i) => w === windows[i]);
  const weights = same ? [...stored.weights] : windows.map(() => 1);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return total > 0 ? weights.map((w) => (w * windows.length) / total) : windows.map(() => 1);
}

/** A switched-on screen as the page lays it out: its size in CSS pixels. */
export interface ScreenSurfaceInfo {
  screen: Screen;
  widthPx: number;
  heightPx: number;
}

/** A viewport position on a screen's plane, in that screen's CSS pixels; from the viewer. */
export type ScreenLocator = (
  screenId: string,
  clientX: number,
  clientY: number,
) => { x: number; y: number } | null;

/** Finds the drop target under a viewport position; provided by the viewer while mounted. */
export type ScreenPicker = (
  clientX: number,
  clientY: number,
  windowId: string,
) => DropTarget | null;

/** One desk's windows, kept while the visitor is at another desk. */
export interface DeskWindows {
  workspaceId: string | null;
  placement: Readonly<Record<string, string>>;
  order: readonly string[];
  closed: readonly string[];
  opened: readonly WorkspaceWindow[];
  sizes: Readonly<Record<string, ScreenSizes>>;
}

/** The desk of the single-desk configurator; unlimited desks mode adds others. */
export const SINGLE_DESK = 'single';

interface WorkspaceState {
  productId: string | null;
  /** Desk whose windows are on show (the other desks' are in `saved`). */
  deskId: string;
  /** Windows of the desks the visitor is not at, by desk id. */
  saved: Readonly<Record<string, DeskWindows>>;
  /** The workspace is on: the sites are live on the screens. */
  active: boolean;
  /** The camera sits in front of the screens with orbiting off; otherwise it moves freely. */
  seated: boolean;
  /** The camera is back under the orbit controls (false from sitting down until the move back ends). */
  cameraFree: boolean;
  workspaceId: string | null;
  /** Screen each window was put on; windows follow their screen's visibility. */
  placement: Readonly<Record<string, string>>;
  /** Window ids in the order they tile on a screen (left to right, top to bottom). */
  order: readonly string[];
  /** Workspace windows the visitor closed. */
  closed: readonly string[];
  /** Sites the visitor opened on an empty screen. */
  opened: readonly WorkspaceWindow[];
  /**
   * How the visitor shared each screen between its windows, by screen id. It applies only
   * while that screen shows exactly the same windows (see `screenWeights`).
   */
  sizes: Readonly<Record<string, ScreenSizes>>;
  /** Screen the camera zooms to, or null for the overview of all screens. */
  focus: string | null;
  drag: WindowDrag | null;
  pickScreen: ScreenPicker | null;
  locateOnScreen: ScreenLocator | null;
  /** Screens that are switched on, and the one that takes the windows of the others. */
  surfaces: readonly ScreenSurfaceInfo[];
  primaryScreen: string | undefined;
  /** Height at the top of the viewer covered by the workspace toolbar, in CSS pixels. */
  hudInset: number;
  /** Height at the bottom of the viewer covered by the desk switcher, in CSS pixels. */
  hudInsetBottom: number;

  resetFor: (product: ProductDefinition) => void;
  /** Turns the workspace on and takes the seat in front of the screens. */
  enter: (workspaceId?: string) => void;
  /** Leaves the seat and hands the camera back; the sites stay on. */
  standUp: () => void;
  sit: () => void;
  /** Turns the workspace off. */
  close: () => void;
  select: (workspaceId: string) => void;
  resetWindows: () => void;
  moveWindow: (windowId: string, screenId: string) => void;
  closeWindow: (windowId: string) => void;
  /** Stores how a screen's windows (ids in tiling order) share it, as one weight each. */
  resizeWindows: (screenId: string, windows: readonly string[], weights: readonly number[]) => void;
  /** Opens a site on a screen: a closed workspace window by id, or any https link. */
  openWindow: (screenId: string, site: { id?: string; title: string; url: string }) => void;
  setFocus: (screenId: string | null) => void;
  setCameraFree: (free: boolean) => void;
  setPicker: (picker: ScreenPicker | null) => void;
  setLocator: (locator: ScreenLocator | null) => void;
  setSurfaces: (surfaces: readonly ScreenSurfaceInfo[], primaryScreen: string | undefined) => void;
  setHudInset: (inset: number) => void;
  setHudInsetBottom: (inset: number) => void;
  /**
   * Moves to a desk: keeps the current desk's windows, brings back the new desk's (or its
   * workspace's own when it has none or changed workspace), and turns the sites on, seated
   * or looking around.
   */
  showDesk: (deskId: string, workspaceId: string, seat: boolean) => void;
  /** Forgets a desk's windows (the desk was removed or given another workspace). */
  forgetDesk: (deskId: string) => void;
  /** Back to the single desk, with the windows it had, and the sites off. */
  leaveDesks: () => void;
  startDrag: (window: WorkspaceWindow, fromScreen: string, x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  /** Ends a drag, placing the window as its drop target says. */
  endDrag: () => void;
}

function currentProduct(state: Pick<WorkspaceState, 'productId'>) {
  return getProduct(state.productId);
}

export function workspaceById(
  product: ProductDefinition,
  id: string | null,
): Workspace | undefined {
  return product.workspaces.find((w) => w.id === id) ?? product.workspaces[0];
}

function initialWindows(workspace: Workspace | undefined) {
  const windows = workspace?.windows ?? [];
  return {
    placement: Object.fromEntries(windows.map((w) => [w.id, w.screen])),
    order: windows.map((w) => w.id),
    closed: [],
    opened: [],
    sizes: {},
  };
}

/** The windows on show: the workspace's own that are still open, and the visitor's. */
export function openWindows(
  workspace: Workspace | undefined,
  closed: readonly string[],
  opened: readonly WorkspaceWindow[],
): WorkspaceWindow[] {
  return [...(workspace?.windows ?? []).filter((w) => !closed.includes(w.id)), ...opened];
}

function snapshot(state: WorkspaceState): DeskWindows {
  const { workspaceId, placement, order, closed, opened, sizes } = state;
  return { workspaceId, placement, order, closed, opened, sizes };
}

let openedCount = 0;

/** Placement and order after dropping `drag` on its target. */
function dropped(
  drag: WindowDrag,
  target: DropTarget,
  placement: Readonly<Record<string, string>>,
  order: readonly string[],
): { placement: Record<string, string>; order: string[] } {
  const id = drag.windowId;
  const other = target.windowId;
  const next = { ...placement, [id]: target.screen };
  if (target.action === 'swap' && other) {
    next[other] = drag.fromScreen;
    return { placement: next, order: order.map((w) => (w === id ? other : w === other ? id : w)) };
  }
  const rest = order.filter((w) => w !== id);
  const at = other ? rest.indexOf(other) : -1;
  if (at < 0) return { placement: next, order: [...rest, id] };
  rest.splice(target.action === 'after' ? at + 1 : at, 0, id);
  return { placement: next, order: rest };
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  productId: null,
  deskId: SINGLE_DESK,
  saved: {},
  active: false,
  seated: false,
  cameraFree: true,
  workspaceId: null,
  placement: {},
  order: [],
  closed: [],
  opened: [],
  sizes: {},
  focus: null,
  drag: null,
  pickScreen: null,
  locateOnScreen: null,
  surfaces: [],
  primaryScreen: undefined,
  hudInset: 0,
  hudInsetBottom: 0,

  resetFor: (product) => {
    if (get().productId === product.id) return;
    const workspace = product.workspaces[0];
    set({
      productId: product.id,
      deskId: SINGLE_DESK,
      saved: {},
      active: false,
      seated: false,
      cameraFree: true,
      workspaceId: workspace?.id ?? null,
      ...initialWindows(workspace),
      focus: null,
      drag: null,
    });
  },

  enter: (workspaceId) => {
    const workspace = workspaceById(currentProduct(get()), workspaceId ?? get().workspaceId);
    if (!workspace) return;
    const switching = workspace.id !== get().workspaceId;
    set({
      active: true,
      seated: true,
      cameraFree: false,
      workspaceId: workspace.id,
      focus: null,
      ...(switching && initialWindows(workspace)),
    });
  },

  standUp: () => set({ seated: false, focus: null }),
  sit: () => set({ seated: true, cameraFree: false }),
  close: () => set({ active: false, seated: false, focus: null, drag: null }),

  select: (workspaceId) => {
    const workspace = workspaceById(currentProduct(get()), workspaceId);
    if (!workspace) return;
    set({ workspaceId: workspace.id, ...initialWindows(workspace), focus: null });
  },

  resetWindows: () => {
    const workspace = workspaceById(currentProduct(get()), get().workspaceId);
    set({ ...initialWindows(workspace), focus: null });
  },

  moveWindow: (windowId, screenId) =>
    set((state) => ({
      placement: { ...state.placement, [windowId]: screenId },
      order: [...state.order.filter((w) => w !== windowId), windowId],
    })),

  closeWindow: (windowId) =>
    set((state) => ({
      closed: state.closed.includes(windowId) ? state.closed : [...state.closed, windowId],
      opened: state.opened.filter((w) => w.id !== windowId),
      order: state.order.filter((w) => w !== windowId),
    })),

  resizeWindows: (screenId, windows, weights) =>
    set((state) => ({ sizes: { ...state.sizes, [screenId]: { windows, weights } } })),

  openWindow: (screenId, site) => {
    const id = site.id ?? `site-${++openedCount}`;
    set((state) => ({
      closed: state.closed.filter((w) => w !== id),
      opened: site.id
        ? state.opened
        : [...state.opened, { id, title: site.title, url: site.url, screen: screenId }],
      placement: { ...state.placement, [id]: screenId },
      order: [...state.order.filter((w) => w !== id), id],
    }));
  },

  // Zooming to one screen takes the seat again.
  setFocus: (focus) => set(focus ? { focus, seated: true, cameraFree: false } : { focus }),
  setCameraFree: (cameraFree) => set({ cameraFree }),
  setPicker: (pickScreen) => set({ pickScreen }),
  setLocator: (locateOnScreen) => set({ locateOnScreen }),
  setSurfaces: (surfaces, primaryScreen) => set({ surfaces, primaryScreen }),
  setHudInset: (hudInset) => set({ hudInset }),
  setHudInsetBottom: (hudInsetBottom) => set({ hudInsetBottom }),

  showDesk: (deskId, workspaceId, seat) => {
    const state = get();
    const workspace = workspaceById(currentProduct(state), workspaceId);
    if (!workspace) return;
    const saved = { ...state.saved, [state.deskId]: snapshot(state) };
    const kept = deskId === state.deskId ? snapshot(state) : saved[deskId];
    const windows = kept?.workspaceId === workspace.id ? { ...kept } : initialWindows(workspace);
    set({
      saved,
      deskId,
      ...windows,
      workspaceId: workspace.id,
      active: true,
      focus: null,
      drag: null,
      ...(seat ? { seated: true, cameraFree: false } : { seated: false }),
    });
  },

  forgetDesk: (deskId) =>
    set((state) => ({
      saved: Object.fromEntries(Object.entries(state.saved).filter(([id]) => id !== deskId)),
    })),

  leaveDesks: () => {
    const state = get();
    const single = state.deskId === SINGLE_DESK ? snapshot(state) : state.saved[SINGLE_DESK];
    const workspace = workspaceById(currentProduct(state), single?.workspaceId ?? null);
    set({
      deskId: SINGLE_DESK,
      saved: {},
      ...(single ?? { workspaceId: workspace?.id ?? null, ...initialWindows(workspace) }),
      active: false,
      seated: false,
      focus: null,
      drag: null,
    });
  },

  startDrag: (window, fromScreen, x, y) =>
    set({ drag: { windowId: window.id, title: window.title, fromScreen, x, y, over: null } }),

  updateDrag: (x, y) => {
    const { drag, pickScreen } = get();
    if (!drag) return;
    set({ drag: { ...drag, x, y, over: pickScreen?.(x, y, drag.windowId) ?? null } });
  },

  endDrag: () => {
    const { drag, placement, order } = get();
    if (!drag) return;
    set({ drag: null, ...(drag.over && dropped(drag, drag.over, placement, order)) });
  },
}));

/**
 * Windows per screen, in tiling order, for the current placement. A window whose screen is
 * hidden (its monitor switched off) moves to the primary screen until its own screen is back.
 */
export function layoutWindows(
  windows: readonly WorkspaceWindow[],
  placement: Readonly<Record<string, string>>,
  order: readonly string[],
  visibleScreens: readonly string[],
  primaryScreen: string | undefined,
): Map<string, WorkspaceWindow[]> {
  const rank = (w: WorkspaceWindow) => {
    const at = order.indexOf(w.id);
    return at < 0 ? Infinity : at;
  };
  const layout = new Map<string, WorkspaceWindow[]>();
  for (const window of [...windows].sort((a, b) => rank(a) - rank(b))) {
    const wanted = placement[window.id] ?? window.screen;
    const screen = visibleScreens.includes(wanted) ? wanted : primaryScreen;
    if (!screen) continue;
    layout.set(screen, [...(layout.get(screen) ?? []), window]);
  }
  return layout;
}

// Follow the configurator's product: reset on every switch.
const syncProduct = () => {
  useWorkspaceStore.getState().resetFor(getProduct(useConfiguratorStore.getState().productId));
};
syncProduct();
useConfiguratorStore.subscribe(syncProduct);
