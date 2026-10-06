/**
 * The current set-up (see `setup.ts`) and the changes the visitor can make to it. Changes to
 * "the current desk" go to the single desk, or in the room to the desk the visitor is at.
 * Starts from the page's link.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import type { Motion, ProductDefinition, WorkspaceWindow } from '@/catalog/schema';
import {
  defaultSelections,
  resolveConfiguration,
  sanitizeSelections,
  type ResolvedConfiguration,
  type Selections,
} from './derive';
import {
  clampMotion,
  closeWindow,
  currentDesk,
  dropWindow,
  initialSetup,
  initialWindows,
  MAX_DESKS,
  moveWindow,
  newDesk,
  newDeskId,
  openWindow,
  roomWithSingle,
  starterRoom,
  updateDesk,
  withWorkspace,
  workspaceById,
  type DeskSetup,
  type DeskWindows,
  type DropPlace,
  type Setup,
} from './setup';
import { setupFromSearch } from './setupUrl';

interface SetupState extends Setup {
  /** Replaces the whole set-up (a saved layout, the command center sheet). */
  replace: (setup: Setup) => void;
  /** Switches product: its single desk as it comes, and no room. */
  selectProduct: (productId: string) => void;

  // The current desk's configuration.
  selectOption: (groupId: string, optionId: string) => void;
  setSelections: (selections: Selections) => void;
  resetSelections: () => void;

  // Heights.
  /** Moves a desk's motion (clamped). */
  setMotion: (deskId: string, motion: Motion, value: number) => void;
  /** Sets where a desk's motion is when the viewer first knows it; ignored once set. */
  startMotion: (deskId: string, motionId: string, value: number) => void;

  // The current desk's windows.
  moveWindow: (windowId: string, screenId: string) => void;
  closeWindow: (windowId: string) => void;
  openWindow: (screenId: string, site: { id?: string; title: string; url: string }) => void;
  /** Stores how a screen's windows (ids in tiling order) share it, as one weight each. */
  resizeWindows: (screenId: string, windows: readonly string[], weights: readonly number[]) => void;
  dropWindow: (windowId: string, fromScreen: string, place: DropPlace) => void;
  /** The current desk's windows back to its workspace's own. */
  resetWindows: () => void;

  // Desks.
  /** Gives a desk another workspace (and that workspace's windows). */
  setDeskWorkspace: (deskId: string, workspaceId: string) => void;
  /** The visitor picks a desk's workspace: as `setDeskWorkspace`, and it is remembered as theirs. */
  chooseWorkspace: (deskId: string, workspaceId: string) => void;
  renameDesk: (deskId: string, name: string) => void;

  // The room.
  /** Opens the room: as the visitor left it, or a first room from the single desk. */
  enterRoom: (bringWorkspace: boolean) => void;
  /** Back to the single desk; the room is kept for coming back. */
  exitRoom: () => void;
  /** Adds a desk with a workspace; returns its id (null when the room is full). */
  addDesk: (workspaceId: string) => string | null;
  /**
   * Adds a desk made elsewhere (the AI's), under a name no other desk has; returns its id
   * (null when the room is full).
   */
  insertDesk: (desk: DeskSetup) => string | null;
  /** Removes a desk (never the last); returns the desk to move to if it was the active one. */
  removeDesk: (deskId: string) => string | null;
  setActiveDesk: (deskId: string | null) => void;
  /** Two desks trade places in the room. */
  swapDesks: (a: string, b: string) => void;
}

const productOf = (setup: Pick<Setup, 'productId'>) => getProduct(setup.productId);

export const useSetupStore = create<SetupState>()((set, get) => {
  /** Changes the current desk, if there is one. */
  const changeCurrent = (change: (desk: DeskSetup, product: ProductDefinition) => DeskSetup) => {
    const setup = get();
    const desk = currentDesk(setup);
    if (desk) set(updateDesk(setup, desk.id, (d) => change(d, productOf(setup))));
  };
  const changeWindows = (change: (windows: DeskWindows) => DeskWindows) =>
    changeCurrent((desk) => ({ ...desk, windows: change(desk.windows) }));

  return {
    ...setupFromSearch(window.location.search),

    replace: (setup) => set(setup),
    selectProduct: (productId) => set(initialSetup(getProduct(productId))),

    selectOption: (groupId, optionId) =>
      changeCurrent((desk, product) => ({
        ...desk,
        selections: sanitizeSelections(product, { ...desk.selections, [groupId]: optionId }),
      })),
    setSelections: (selections) =>
      changeCurrent((desk, product) => ({
        ...desk,
        selections: sanitizeSelections(product, selections),
      })),
    resetSelections: () =>
      changeCurrent((desk, product) => ({ ...desk, selections: defaultSelections(product) })),

    setMotion: (deskId, motion, value) =>
      set((setup) =>
        updateDesk(setup, deskId, (desk) => ({
          ...desk,
          motions: { ...desk.motions, [motion.id]: clampMotion(motion, value) },
        })),
      ),
    startMotion: (deskId, motionId, value) =>
      set((setup) =>
        updateDesk(setup, deskId, (desk) =>
          desk.motions[motionId] === undefined
            ? { ...desk, motions: { ...desk.motions, [motionId]: value } }
            : desk,
        ),
      ),

    moveWindow: (windowId, screenId) => changeWindows((w) => moveWindow(w, windowId, screenId)),
    closeWindow: (windowId) => changeWindows((w) => closeWindow(w, windowId)),
    openWindow: (screenId, site) => changeWindows((w) => openWindow(w, screenId, site)),
    resizeWindows: (screenId, windows, weights) =>
      changeWindows((w) => ({ ...w, sizes: { ...w.sizes, [screenId]: { windows, weights } } })),
    dropWindow: (windowId, fromScreen, place) =>
      changeWindows((w) => dropWindow(w, windowId, fromScreen, place)),
    resetWindows: () =>
      changeCurrent((desk, product) => ({
        ...desk,
        windows: initialWindows(workspaceById(product, desk.workspaceId)),
      })),

    setDeskWorkspace: (deskId, workspaceId) =>
      set((setup) =>
        updateDesk(setup, deskId, (desk) => withWorkspace(productOf(setup), desk, workspaceId)),
      ),
    chooseWorkspace: (deskId, workspaceId) =>
      set((setup) =>
        updateDesk(setup, deskId, (desk) => ({
          ...withWorkspace(productOf(setup), desk, workspaceId),
          workspaceChosen: true,
        })),
      ),
    renameDesk: (deskId, name) =>
      set((setup) =>
        updateDesk(setup, deskId, (desk) => {
          const renamed: DeskSetup = { ...desk, name: name.trim() };
          if (!renamed.name) delete renamed.name;
          return renamed;
        }),
      ),

    enterRoom: (bringWorkspace) => {
      const setup = get();
      if (setup.mode === 'desks') return;
      // The single desk's picked workspace comes along once; picking again brings it again.
      const single = { ...setup.single, workspaceChosen: false };
      if (setup.room.length > 0) {
        set({ mode: 'desks', single, ...roomWithSingle(setup) });
        return;
      }
      const room = starterRoom(productOf(setup), setup.single, bringWorkspace);
      if (room.length > 0) set({ mode: 'desks', single, room, activeDeskId: null });
    },
    exitRoom: () => set({ mode: 'single' }),

    addDesk: (workspaceId) => {
      const setup = get();
      const product = productOf(setup);
      if (!product.workspaces.some((w) => w.id === workspaceId)) return null;
      if (setup.mode !== 'desks' || setup.room.length >= MAX_DESKS) return null;
      const desk = newDesk(product, workspaceId);
      set({ room: [...setup.room, desk] });
      return desk.id;
    },
    insertDesk: (desk) => {
      const { mode, room } = get();
      if (mode !== 'desks' || room.length >= MAX_DESKS) return null;
      const taken = new Set(room.flatMap((d) => (d.name ? [d.name.toLowerCase()] : [])));
      let name = desk.name;
      for (let n = 2; name && taken.has(name.toLowerCase()); n++) name = `${desk.name} ${n}`;
      const added: DeskSetup = { ...desk, id: newDeskId(), ...(name && { name }) };
      set({ room: [...room, added] });
      return added.id;
    },
    removeDesk: (deskId) => {
      const { room, activeDeskId } = get();
      const index = room.findIndex((d) => d.id === deskId);
      if (room.length <= 1 || index < 0) return null;
      const rest = room.filter((d) => d.id !== deskId);
      const next = deskId === activeDeskId ? rest[Math.min(index, rest.length - 1)] : undefined;
      set({ room: rest, ...(deskId === activeDeskId && { activeDeskId: next?.id ?? null }) });
      return next?.id ?? null;
    },
    setActiveDesk: (activeDeskId) => {
      if (activeDeskId === null || get().room.some((d) => d.id === activeDeskId)) {
        set({ activeDeskId });
      }
    },
    swapDesks: (a, b) => {
      const { room } = get();
      const first = room.find((d) => d.id === a);
      const second = room.find((d) => d.id === b);
      if (!first || !second || first === second) return;
      set({ room: room.map((d) => (d === first ? second : d === second ? first : d)) });
    },
  };
});

/** Just the set-up, without the store's actions (for saving and exporting). */
export function currentSetup(): Setup {
  const { productId, mode, single, room, activeDeskId } = useSetupStore.getState();
  return { productId, mode, single, room, activeDeskId };
}

export function useProduct(): ProductDefinition {
  return useSetupStore((state) => getProduct(state.productId));
}

/** The desk the panel and the live sites belong to (none in the room's overview). */
export function useCurrentDesk(): DeskSetup | undefined {
  return useSetupStore(currentDesk);
}

/** The current desk's selections (the single desk's in the room's overview). */
export function useSelections(): Selections {
  return useSetupStore((state) => (currentDesk(state) ?? state.single).selections);
}

/** The current desk's open windows. */
export function useCurrentWindows(): {
  workspaceId: string;
  windows: WorkspaceWindow[];
} & DeskWindows {
  const product = useProduct();
  const desk = useSetupStore((state) => currentDesk(state) ?? state.single);
  return useMemo(() => {
    const workspace = workspaceById(product, desk.workspaceId);
    return {
      ...desk.windows,
      workspaceId: desk.workspaceId,
      windows: [
        ...(workspace?.windows ?? []).filter((w) => !desk.windows.closed.includes(w.id)),
        ...desk.windows.opened,
      ],
    };
  }, [product, desk]);
}

/** Memoised resolution of the current selections into node-level instructions. */
export function useResolvedConfiguration(): ResolvedConfiguration {
  const product = useProduct();
  const selections = useSelections();
  return useMemo(() => resolveConfiguration(product, selections), [product, selections]);
}
