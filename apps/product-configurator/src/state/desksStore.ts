/**
 * Unlimited desks mode: a room of desks, each with its own configuration and workspace, to
 * show what having a desk for every kind of work is like.
 *
 * The configurator store always holds the selections of the desk the visitor is at, so the
 * option panel works unchanged; this store keeps every desk's copy and swaps them as the
 * visitor moves between desks. Desks are never priced: they are virtual.
 */
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import type { ProductDefinition, Workspace } from '@/catalog/schema';
import { useConfiguratorStore } from './configuratorStore';
import { defaultSelections, sanitizeSelections, type Selections } from './derive';
import type { LayoutData } from '@/layouts/layoutData';
import { motionKey, SINGLE_DESK_KEY, useMotionStore } from './motionStore';
import { SINGLE_DESK, useWorkspaceStore, type DeskWindows } from './workspaceStore';

export type DeskMode = 'single' | 'desks';

export interface Desk {
  id: string;
  workspaceId: string;
  selections: Selections;
  /** A name of the visitor's (from a layout or the command center sheet); else the workspace's. */
  name?: string;
}

/** A desk being dragged onto another in the room overview, to swap places with it. */
export interface DeskDrag {
  deskId: string;
  /** Pointer position in viewport pixels. */
  x: number;
  y: number;
  /** The desk it would swap with. */
  over: string | null;
}

/** Floor area the desks take, in metres; the viewer sizes the floor shadow and camera to it. */
export interface Room {
  width: number;
  depth: number;
}

/** Workspaces the room starts with when the link names none (missing ones are skipped). */
const STARTER_DESKS = ['finance', 'crypto', 'nba', 'soccer'];
/**
 * Beyond this a room gets slow on an ordinary laptop: every desk is a copy of the model.
 * Only the desk the visitor is at runs live sites, so it's the model, not the sites.
 */
export const MAX_DESKS = 36;

const DESKS_PARAM = 'desks';
const AT_PARAM = 'desk';

interface DesksState {
  productId: string;
  mode: DeskMode;
  desks: readonly Desk[];
  /**
   * The desk the visitor is at; the panel and the live sites belong to it. None until they
   * pick one: the room opens on the overview with every desk showing its poster.
   */
  activeDeskId: string | null;
  /** The single desk's configuration while the room is open, restored when it closes. */
  singleSelections: Selections | null;
  /** The room as the visitor left it for the single desk, brought back when they return. */
  parked: { desks: readonly Desk[]; activeDeskId: string | null } | null;
  room: Room;
  deskDrag: DeskDrag | null;

  /**
   * Opens the room: as the visitor left it, or the first time with the current desk as the
   * first one and a few themed desks next to it.
   */
  enterDesks: () => void;
  /** Back to the single desk as it was; the room is kept for coming back. */
  exitDesks: () => void;
  /** Adds a desk with a workspace and sits down at it. */
  addDesk: (workspaceId: string) => void;
  removeDesk: (deskId: string) => void;
  /** Moves to a desk: its configuration goes to the panel and its sites go live. */
  selectDesk: (deskId: string, seat?: boolean) => void;
  /** Steps to the next (1) or previous (-1) desk, like switching virtual desktops. */
  stepDesk: (step: number) => void;
  setDeskWorkspace: (deskId: string, workspaceId: string) => void;
  setRoom: (room: Room) => void;
  /**
   * Brings a saved layout back: the single desk and the room of desks (new desk ids), their
   * configurations, heights and windows, in the mode it was saved in.
   */
  loadLayout: (layout: LayoutData) => void;
  setDeskDrag: (drag: DeskDrag | null) => void;
  /** Two desks trade places in the room (and in the switcher). */
  swapDesks: (a: string, b: string) => void;
}

let deskCount = 0;
const newDeskId = () => `desk-${++deskCount}`;

const currentProduct = () => getProduct(useConfiguratorStore.getState().productId);

function knownWorkspace(product: ProductDefinition, id: string | undefined) {
  return product.workspaces.find((w) => w.id === id);
}

function starterWorkspaces(product: ProductDefinition, first: string | null): Workspace[] {
  const ids = [first, ...STARTER_DESKS.filter((id) => id !== first)];
  const starters = ids.flatMap((id) => knownWorkspace(product, id ?? undefined) ?? []);
  return starters.length > 0 ? starters : product.workspaces.slice(0, 4);
}

/**
 * The room as a query string: `desks=finance,crypto~side-monitors:off+desk-top:walnut&desk=2`,
 * each desk's workspace and the selections that differ from the defaults; `desk` is the
 * desk the visitor is at, counted from 1. Empty when the room is closed.
 */
export function encodeDesks(state: Pick<DesksState, 'mode' | 'desks' | 'activeDeskId'>) {
  if (state.mode !== 'desks' || state.desks.length === 0) return '';
  const defaults = defaultSelections(currentProduct());
  const desks = state.desks.map((desk) => {
    const changed = Object.entries(desk.selections).filter(([g, o]) => defaults[g] !== o);
    const config = changed.map(([g, o]) => `${g}:${o}`).join('+');
    return config ? `${desk.workspaceId}~${config}` : desk.workspaceId;
  });
  const at = state.desks.findIndex((d) => d.id === state.activeDeskId) + 1;
  return `&${DESKS_PARAM}=${desks.join(',')}${at >= 1 ? `&${AT_PARAM}=${at}` : ''}`;
}

function decodeDesks(product: ProductDefinition, search: string) {
  const params = new URLSearchParams(search);
  const list = params.get(DESKS_PARAM);
  if (list === null) return null;
  const desks: Desk[] = [];
  for (const entry of list.split(',').slice(0, MAX_DESKS)) {
    const [workspaceId = '', config = ''] = entry.split('~');
    const workspace = knownWorkspace(product, workspaceId);
    if (!workspace) continue;
    const selections: Record<string, string> = {};
    for (const pair of config.split('+')) {
      const [groupId, optionId] = pair.split(':');
      if (groupId && optionId) selections[groupId] = optionId;
    }
    desks.push({
      id: newDeskId(),
      workspaceId: workspace.id,
      selections: sanitizeSelections(product, selections),
    });
  }
  if (desks.length === 0) return null;
  // Without `desk`, no desk is chosen: the overview.
  const at = Number(params.get(AT_PARAM) ?? 0);
  const active = Number.isInteger(at) && at >= 1 ? desks[at - 1] : undefined;
  return { desks, activeDeskId: active?.id ?? null };
}

export const useDesksStore = create<DesksState>()((set, get) => {
  const product = currentProduct();
  const linked = decodeDesks(product, window.location.search);

  /** Puts a desk's configuration in the panel and its windows on the screens. */
  const goTo = (desk: Desk, seat: boolean) => {
    set({ activeDeskId: desk.id });
    useMotionStore.getState().setDesk(desk.id);
    useConfiguratorStore.getState().setSelections(desk.selections);
    useWorkspaceStore.getState().showDesk(desk.id, desk.workspaceId, seat);
  };

  return {
    productId: product.id,
    mode: linked ? 'desks' : 'single',
    desks: linked?.desks ?? [],
    activeDeskId: linked?.activeDeskId ?? null,
    singleSelections: null,
    parked: null,
    room: { width: 0, depth: 0 },

    enterDesks: () => {
      if (get().mode === 'desks') return;
      const product = currentProduct();
      const selections = useConfiguratorStore.getState().selections;
      const { parked } = get();
      if (parked && parked.desks.length > 0) {
        const back = parked.desks.find((d) => d.id === parked.activeDeskId);
        set({ mode: 'desks', desks: parked.desks, singleSelections: selections, parked: null });
        if (back) goTo(back, false);
        else useWorkspaceStore.getState().close();
        return;
      }
      const workspace = useWorkspaceStore.getState();
      // The desk the visitor configured comes along as the first desk, with the workspace
      // they were trying, if any.
      const [first, ...others] = starterWorkspaces(
        product,
        workspace.active ? workspace.workspaceId : null,
      );
      if (!first) return;
      const firstDesk: Desk = { id: newDeskId(), workspaceId: first.id, selections };
      const desks: Desk[] = [
        firstDesk,
        ...others.map((w) => ({
          id: newDeskId(),
          workspaceId: w.id,
          selections: defaultSelections(product),
        })),
      ];
      set({ mode: 'desks', desks, activeDeskId: null, singleSelections: selections });
      // The desk the visitor had stays at its height; the new desks start at the default.
      useMotionStore.getState().copyDesk(SINGLE_DESK_KEY, firstDesk.id);
      // The overview, with no desk chosen: the single desk's sites go off.
      useWorkspaceStore.getState().close();
    },

    exitDesks: () => {
      const { mode, singleSelections, desks, activeDeskId } = get();
      if (mode !== 'desks') return;
      set({
        mode: 'single',
        desks: [],
        activeDeskId: null,
        singleSelections: null,
        parked: { desks, activeDeskId },
      });
      useMotionStore.getState().setDesk(SINGLE_DESK_KEY);
      useWorkspaceStore.getState().leaveDesks();
      if (singleSelections) useConfiguratorStore.getState().setSelections(singleSelections);
    },

    addDesk: (workspaceId) => {
      const product = currentProduct();
      const workspace = knownWorkspace(product, workspaceId);
      if (!workspace || get().mode !== 'desks' || get().desks.length >= MAX_DESKS) return;
      const desk: Desk = {
        id: newDeskId(),
        workspaceId: workspace.id,
        selections: defaultSelections(product),
      };
      set((state) => ({ desks: [...state.desks, desk] }));
      goTo(desk, true);
    },

    removeDesk: (deskId) => {
      const { desks, activeDeskId } = get();
      if (desks.length <= 1) return;
      const index = desks.findIndex((d) => d.id === deskId);
      if (index < 0) return;
      const rest = desks.filter((d) => d.id !== deskId);
      if (deskId === activeDeskId) {
        const next = rest[Math.min(index, rest.length - 1)];
        if (next) goTo(next, useWorkspaceStore.getState().seated);
      }
      set({ desks: rest });
      useWorkspaceStore.getState().forgetDesk(deskId);
    },

    selectDesk: (deskId, seat = true) => {
      const desk = get().desks.find((d) => d.id === deskId);
      if (!desk) return;
      const workspace = useWorkspaceStore.getState();
      if (deskId === get().activeDeskId && workspace.seated === seat && !workspace.focus) return;
      goTo(desk, seat);
    },

    stepDesk: (step) => {
      const { desks, activeDeskId } = get();
      const index = desks.findIndex((d) => d.id === activeDeskId);
      // From the overview with no desk chosen, the first or the last desk.
      const next =
        index < 0
          ? desks[step > 0 ? 0 : desks.length - 1]
          : desks[(index + step + desks.length) % desks.length];
      if (!next || next.id === activeDeskId) return;
      goTo(next, true);
    },

    setDeskWorkspace: (deskId, workspaceId) => {
      if (!knownWorkspace(currentProduct(), workspaceId)) return;
      set((state) => ({
        desks: state.desks.map((d) => (d.id === deskId ? { ...d, workspaceId } : d)),
      }));
      const workspace = useWorkspaceStore.getState();
      if (deskId === get().activeDeskId) {
        workspace.showDesk(deskId, workspaceId, workspace.seated);
      } else {
        workspace.forgetDesk(deskId);
      }
    },

    deskDrag: null,
    setDeskDrag: (deskDrag) => set({ deskDrag }),

    swapDesks: (a, b) => {
      const { desks } = get();
      const first = desks.find((d) => d.id === a);
      const second = desks.find((d) => d.id === b);
      if (!first || !second || first === second) return;
      set({ desks: desks.map((d) => (d === first ? second : d === second ? first : d)) });
    },

    loadLayout: (layout) => {
      const product = currentProduct();
      const motion = product.motions[0];
      const windows: Record<string, DeskWindows> = {};
      const heights: Record<string, number> = {};
      const keep = (deskKey: string, windowKey: string, saved: LayoutData['single']) => {
        if (saved.windows) windows[windowKey] = saved.windows;
        if (motion && typeof saved.height === 'number') {
          heights[motionKey(deskKey, motion.id)] = saved.height;
        }
      };

      // Desks whose workspace this product no longer has are left out.
      const saved = layout.room?.desks ?? [];
      const desks: Desk[] = [];
      let active: Desk | undefined;
      saved.forEach((entry, i) => {
        if (!knownWorkspace(product, entry.workspaceId)) return;
        const desk: Desk = {
          id: newDeskId(),
          workspaceId: entry.workspaceId,
          selections: sanitizeSelections(product, entry.selections),
          ...(entry.name && { name: entry.name }),
        };
        desks.push(desk);
        keep(desk.id, desk.id, entry);
        if (i === layout.room?.active) active = desk;
      });
      keep(SINGLE_DESK_KEY, SINGLE_DESK, layout.single);
      const single = sanitizeSelections(product, layout.single.selections);

      useMotionStore.getState().setValues(heights);
      useWorkspaceStore.getState().importWindows(windows);
      if (layout.mode === 'desks' && desks.length > 0) {
        set({ mode: 'desks', desks, activeDeskId: null, singleSelections: single, parked: null });
        if (active) goTo(active, false);
      } else {
        set({
          mode: 'single',
          desks: [],
          activeDeskId: null,
          singleSelections: null,
          // The room comes back behind the switch, as the visitor left it.
          parked: desks.length > 0 ? { desks, activeDeskId: active?.id ?? null } : null,
        });
        useMotionStore.getState().setDesk(SINGLE_DESK_KEY);
        useConfiguratorStore.getState().setSelections(single);
      }
    },

    setRoom: (room) => {
      const current = get().room;
      if (current.width !== room.width || current.depth !== room.depth) set({ room });
    },
  };
});

/** The desk the visitor is at, in unlimited desks mode. */
export function activeDesk(state: Pick<DesksState, 'desks' | 'activeDeskId'>) {
  return state.desks.find((d) => d.id === state.activeDeskId);
}

/** A desk's name: its workspace, numbered when several desks share one ("Finance 2"). */
export function deskName(product: ProductDefinition, desks: readonly Desk[], desk: Desk) {
  if (desk.name) return desk.name;
  const label = knownWorkspace(product, desk.workspaceId)?.label ?? 'Desk';
  const same = desks.filter((d) => d.workspaceId === desk.workspaceId);
  return same.length > 1 ? `${label} ${same.indexOf(desk) + 1}` : label;
}

// A room from the link: the panel shows the active desk (if the link names one) and its
// sites go live.
{
  const { mode, desks, activeDeskId } = useDesksStore.getState();
  if (mode === 'desks') {
    useDesksStore.setState({ singleSelections: useConfiguratorStore.getState().selections });
  }
  const desk = mode === 'desks' ? desks.find((d) => d.id === activeDeskId) : undefined;
  if (desk) {
    useMotionStore.getState().setDesk(desk.id);
    useConfiguratorStore.getState().setSelections(desk.selections);
    useWorkspaceStore.getState().showDesk(desk.id, desk.workspaceId, false);
  }
}

// The panel edits the active desk; a product switch closes the room.
useConfiguratorStore.subscribe((state) => {
  const desks = useDesksStore.getState();
  if (state.productId !== desks.productId) {
    desks.exitDesks();
    // The room belongs to the product it was made with.
    useDesksStore.setState({ productId: state.productId, parked: null });
    return;
  }
  if (desks.mode !== 'desks') return;
  const desk = activeDesk(desks);
  if (!desk || desk.selections === state.selections) return;
  useDesksStore.setState({
    desks: desks.desks.map((d) => (d.id === desk.id ? { ...d, selections: state.selections } : d)),
  });
});
