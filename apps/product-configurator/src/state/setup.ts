/**
 * The set-up: everything the visitor has built, as plain data. The single desk and the room
 * of desks, each desk with its workspace (theme), name, configuration, heights and the
 * windows on its screens. One source of truth: the panel, the 3D view, saved layouts, the
 * command center sheet and shared links all read and write this; how it is being looked at
 * (camera, seated, focus, drags) lives apart, in the view store.
 *
 * Everything here is pure; `setupStore` holds the current set-up.
 */
import type { ProductDefinition, Workspace, WorkspaceWindow } from '@/catalog/schema';
import { defaultSelections, sanitizeSelections, type Selections } from './derive';

export type DeskMode = 'single' | 'desks';

/** Id of the single desk; desks in the room have their own. */
export const SINGLE_DESK = 'single';

/**
 * Beyond this a room gets slow on an ordinary laptop: every desk is a copy of the model.
 * Only the desk the visitor is at runs live sites, so it's the model, not the sites.
 */
export const MAX_DESKS = 36;

/** Workspaces a new room starts with, after the visitor's own desk (missing ones are skipped). */
const STARTER_DESKS = ['finance', 'crypto', 'nba', 'soccer'];

/** The windows on a desk's screens, for the desk's workspace. */
export interface DeskWindows {
  /** Screen each window was put on; windows follow their screen's visibility. */
  placement: Readonly<Record<string, string>>;
  /** Window ids in the order they tile on a screen (left to right, top to bottom). */
  order: readonly string[];
  /** Workspace windows the visitor closed. */
  closed: readonly string[];
  /** Sites the visitor opened. */
  opened: readonly WorkspaceWindow[];
  /**
   * How the visitor shared each screen between its windows, by screen id. It applies only
   * while that screen shows exactly the same windows (see `screenWeights`).
   */
  sizes: Readonly<Record<string, ScreenSizes>>;
}

export interface ScreenSizes {
  /** The windows the sizes were set for, in tiling order. */
  windows: readonly string[];
  weights: readonly number[];
}

export interface DeskSetup {
  id: string;
  workspaceId: string;
  /** The visitor's name for the desk; else the workspace's (see `deskName`). */
  name?: string;
  /**
   * The visitor picked this desk's workspace (at the single desk): it comes along into the
   * room, not just the default one every single desk starts with.
   */
  workspaceChosen?: boolean;
  selections: Selections;
  /** Where each motion (the desk height) is set, by motion id; unset until known. */
  motions: Readonly<Record<string, number>>;
  windows: DeskWindows;
}

export interface Setup {
  productId: string;
  /** The single desk, or unlimited desks mode: the room. */
  mode: DeskMode;
  single: DeskSetup;
  /** The room's desks; kept while the visitor is back at the single desk. */
  room: readonly DeskSetup[];
  /** The desk the visitor is at in the room; null for the overview with no desk chosen. */
  activeDeskId: string | null;
}

/** What dropping a dragged window does (see `dropWindow`). */
export type DropAction = 'move' | 'before' | 'after' | 'swap';

/** Where a dragged window lands: a screen, or next to (or in place of) a window on it. */
export interface DropPlace {
  screen: string;
  action: DropAction;
  /** The window dropped next to or swapped with. */
  windowId?: string | undefined;
}

// --- Workspaces and windows ----------------------------------------------------------------

/** A workspace by id, else the product's first. */
export function workspaceById(
  product: ProductDefinition,
  id: string | null | undefined,
): Workspace | undefined {
  return product.workspaces.find((w) => w.id === id) ?? product.workspaces[0];
}

/** A workspace's windows as it comes: every window on its own screen. */
export function initialWindows(workspace: Workspace | undefined): DeskWindows {
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

/** A desk's open windows. */
export function deskWindows(product: ProductDefinition, desk: DeskSetup): WorkspaceWindow[] {
  const workspace = workspaceById(product, desk.workspaceId);
  return openWindows(workspace, desk.windows.closed, desk.windows.opened);
}

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

/**
 * Flex weights for the windows on a screen: the visitor's, if they were set for exactly these
 * windows, else equal. A window's size means nothing on another screen or next to other
 * windows, so a spec change that moves windows gives an even split, and switching back brings
 * the visitor's sizes back. Scaled to add up to the window count: flex fills a screen only
 * when the weights add up to at least 1.
 */
export function screenWeights(
  sizes: DeskWindows['sizes'],
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

/**
 * Windows after a drop: onto an empty screen the window moves there; onto a window it goes
 * next to it (`before` / `after`) or trades places with it (`swap`).
 */
export function dropWindow(
  windows: DeskWindows,
  windowId: string,
  fromScreen: string,
  place: DropPlace,
): DeskWindows {
  const id = windowId;
  const other = place.windowId;
  const placement = { ...windows.placement, [id]: place.screen };
  if (place.action === 'swap' && other) {
    placement[other] = fromScreen;
    const order = windows.order.map((w) => (w === id ? other : w === other ? id : w));
    return { ...windows, placement, order };
  }
  const rest = windows.order.filter((w) => w !== id);
  const at = other ? rest.indexOf(other) : -1;
  if (at < 0) return { ...windows, placement, order: [...rest, id] };
  rest.splice(place.action === 'after' ? at + 1 : at, 0, id);
  return { ...windows, placement, order: rest };
}

export function moveWindow(windows: DeskWindows, windowId: string, screenId: string): DeskWindows {
  return {
    ...windows,
    placement: { ...windows.placement, [windowId]: screenId },
    order: [...windows.order.filter((w) => w !== windowId), windowId],
  };
}

export function closeWindow(windows: DeskWindows, windowId: string): DeskWindows {
  return {
    ...windows,
    closed: windows.closed.includes(windowId) ? windows.closed : [...windows.closed, windowId],
    opened: windows.opened.filter((w) => w.id !== windowId),
    order: windows.order.filter((w) => w !== windowId),
  };
}

let openedCount = 0;

/** Opens a site on a screen: a closed workspace window by id, or any https link. */
export function openWindow(
  windows: DeskWindows,
  screenId: string,
  site: { id?: string | undefined; title: string; url: string },
): DeskWindows {
  // Unique beyond this page: saved layouts bring opened sites back next to new ones.
  const id = site.id ?? `site-${Date.now().toString(36)}-${++openedCount}`;
  return {
    ...windows,
    closed: windows.closed.filter((w) => w !== id),
    opened: site.id
      ? windows.opened
      : [...windows.opened, { id, title: site.title, url: site.url, screen: screenId }],
    placement: { ...windows.placement, [id]: screenId },
    order: [...windows.order.filter((w) => w !== id), id],
  };
}

// --- Desks -----------------------------------------------------------------------------------

let deskCount = 0;
/** A new id for a desk in the room. */
export const newDeskId = () => `desk-${++deskCount}`;

/** A desk as it comes: the workspace's own windows and the default configuration. */
export function newDesk(
  product: ProductDefinition,
  workspaceId: string | null | undefined,
  id = newDeskId(),
): DeskSetup {
  const workspace = workspaceById(product, workspaceId);
  return {
    id,
    workspaceId: workspace?.id ?? '',
    selections: defaultSelections(product),
    motions: initialMotions(product),
    windows: initialWindows(workspace),
  };
}

/** Motions with an `initial` value start there; the others at the model's height (unset). */
function initialMotions(product: ProductDefinition): Record<string, number> {
  return Object.fromEntries(
    product.motions.flatMap((m) => (m.initial === undefined ? [] : [[m.id, m.initial]])),
  );
}

/** The set-up a product starts with: its single desk, no room. */
export function initialSetup(product: ProductDefinition, selections?: Selections): Setup {
  const single = newDesk(product, null, SINGLE_DESK);
  return {
    productId: product.id,
    mode: 'single',
    single: selections
      ? { ...single, selections: sanitizeSelections(product, selections) }
      : single,
    room: [],
    activeDeskId: null,
  };
}

/**
 * A first room: the single desk comes along as the first desk (with its workspace when it was
 * trying one, its configuration, height and windows), then a few themed desks.
 */
export function starterRoom(
  product: ProductDefinition,
  single: DeskSetup,
  bringWorkspace: boolean,
): DeskSetup[] {
  const firstId = bringWorkspace || single.workspaceChosen ? single.workspaceId : null;
  const ids = [firstId, ...STARTER_DESKS.filter((id) => id !== firstId)];
  const known = (id: string | null) => product.workspaces.find((w) => w.id === id);
  let themes = ids.flatMap((id) => known(id) ?? []);
  if (themes.length === 0) themes = product.workspaces.slice(0, 4);
  const [first, ...others] = themes;
  if (!first) return [];
  const sameWorkspace = first.id === single.workspaceId;
  const desk: DeskSetup = { ...single };
  delete desk.workspaceChosen;
  return [
    {
      ...desk,
      id: newDeskId(),
      workspaceId: first.id,
      windows: sameWorkspace ? single.windows : initialWindows(first),
    },
    ...others.map((w) => newDesk(product, w.id)),
  ];
}

/**
 * The room the visitor comes back to: as they left it, plus the single desk when they picked
 * a workspace there that no desk in the room has (it joins as a new desk and is the one they
 * are at). Returns null when nothing changes.
 */
export function roomWithSingle(setup: Setup): Pick<Setup, 'room' | 'activeDeskId'> | null {
  const { single, room } = setup;
  if (!single.workspaceChosen || room.length >= MAX_DESKS) return null;
  if (room.some((d) => d.workspaceId === single.workspaceId)) return null;
  const joined: DeskSetup = { ...single, id: newDeskId() };
  delete joined.workspaceChosen;
  return { room: [...room, joined], activeDeskId: joined.id };
}

/** The desk the panel and the live sites belong to: the single desk, or the active room desk. */
export function currentDesk(setup: Setup): DeskSetup | undefined {
  if (setup.mode === 'single') return setup.single;
  return setup.room.find((d) => d.id === setup.activeDeskId);
}

/** A desk by id: the single desk or one in the room. */
export function findDesk(setup: Setup, deskId: string): DeskSetup | undefined {
  return deskId === SINGLE_DESK ? setup.single : setup.room.find((d) => d.id === deskId);
}

/** The set-up with one desk changed. */
export function updateDesk(
  setup: Setup,
  deskId: string,
  change: (desk: DeskSetup) => DeskSetup,
): Setup {
  if (deskId === SINGLE_DESK) return { ...setup, single: change(setup.single) };
  return { ...setup, room: setup.room.map((d) => (d.id === deskId ? change(d) : d)) };
}

/** A desk given another workspace: its windows become the new workspace's own. */
export function withWorkspace(
  product: ProductDefinition,
  desk: DeskSetup,
  workspaceId: string,
): DeskSetup {
  const workspace = product.workspaces.find((w) => w.id === workspaceId);
  if (!workspace || workspace.id === desk.workspaceId) return desk;
  return { ...desk, workspaceId: workspace.id, windows: initialWindows(workspace) };
}

/** A desk's name: its own, else its workspace's, numbered when several share one ("Finance 2"). */
export function deskName(
  product: ProductDefinition,
  desks: readonly DeskSetup[],
  desk: DeskSetup,
): string {
  if (desk.name) return desk.name;
  const label = product.workspaces.find((w) => w.id === desk.workspaceId)?.label ?? 'Desk';
  const same = desks.filter((d) => d.workspaceId === desk.workspaceId && !d.name);
  return same.length > 1 ? `${label} ${same.indexOf(desk) + 1}` : label;
}

export const clampMotion = (motion: { min: number; max: number }, value: number): number =>
  Math.min(motion.max, Math.max(motion.min, value));
