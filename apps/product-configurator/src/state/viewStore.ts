/**
 * How the set-up is being looked at: whether the live sites are on, where the camera is
 * (seated in front of the screens, looking around a desk or the room), the screen zoomed to,
 * drags in progress and what the viewer reports about the screens. None of it is part of the
 * set-up: it is never saved, shared or exported (that's `setupStore`).
 */
import { create } from 'zustand';
import type { Screen, WorkspaceWindow } from '@/catalog/schema';
import { currentDesk, type DropPlace } from './setup';
import { useSetupStore } from './setupStore';

/** Where a dragged window would land, with the area it would take for the preview. */
export interface DropTarget extends DropPlace {
  /** Area the window would take, in the screen's CSS pixels. */
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

/** A desk being dragged onto another in the room overview, to swap places with it. */
export interface DeskDrag {
  deskId: string;
  /** Pointer position in viewport pixels. */
  x: number;
  y: number;
  /** The desk it would swap with. */
  over: string | null;
  /** Over the trash: dropping removes the desk. */
  trash: boolean;
}

/** Floor area the desks take, in metres; the viewer sizes the floor shadow and camera to it. */
export interface Room {
  width: number;
  depth: number;
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

interface ViewState {
  /** The live sites are on the current desk's screens. */
  active: boolean;
  /** The camera sits in front of the screens with orbiting off; otherwise it moves freely. */
  seated: boolean;
  /**
   * In the room, standing up to look around the desk the visitor is at (orbiting it, as on
   * the single desk) rather than the whole room.
   */
  aroundDesk: boolean;
  /** The camera is back under the orbit controls (false from sitting down until the move back ends). */
  cameraFree: boolean;
  /** Screen the camera zooms to, or null for the overview of all screens. */
  focus: string | null;
  /** Window whose touch menu is open (phones and tablets: the title bar buttons are tiny). */
  menu: string | null;
  drag: WindowDrag | null;
  deskDrag: DeskDrag | null;
  pickScreen: ScreenPicker | null;
  locateOnScreen: ScreenLocator | null;
  /** Screens that are switched on, and the one that takes the windows of the others. */
  surfaces: readonly ScreenSurfaceInfo[];
  primaryScreen: string | undefined;
  /** Height at the top of the viewer covered by the workspace toolbar, in CSS pixels. */
  hudInset: number;
  /** Height at the bottom of the viewer covered by the desk switcher, in CSS pixels. */
  hudInsetBottom: number;
  room: Room;
  /** Presentation mode: only the 3D view, for recording (see `PresentationMode`). */
  presenting: boolean;

  /** Turns the sites on: seated in front of the screens, or looking around. */
  showSites: (seat: boolean) => void;
  /** Leaves the seat; in the room, to look around this desk (`aroundDesk`) or the whole room. */
  standUp: (aroundDesk?: boolean) => void;
  sit: () => void;
  /** Turns the sites off. */
  close: () => void;
  setFocus: (screenId: string | null) => void;
  setMenu: (windowId: string | null) => void;
  setCameraFree: (free: boolean) => void;
  setPicker: (picker: ScreenPicker | null) => void;
  setLocator: (locator: ScreenLocator | null) => void;
  setSurfaces: (surfaces: readonly ScreenSurfaceInfo[], primaryScreen: string | undefined) => void;
  setHudInset: (inset: number) => void;
  setHudInsetBottom: (inset: number) => void;
  setRoom: (room: Room) => void;
  setPresenting: (presenting: boolean) => void;
  setDeskDrag: (drag: DeskDrag | null) => void;
  startDrag: (window: WorkspaceWindow, fromScreen: string, x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  /** Ends a drag, placing the window as its drop target says. */
  endDrag: () => void;
}

const SITES_OFF = {
  active: false,
  seated: false,
  aroundDesk: false,
  focus: null,
  menu: null,
  drag: null,
} as const;

export const useViewStore = create<ViewState>()((set, get) => ({
  ...SITES_OFF,
  cameraFree: true,
  deskDrag: null,
  pickScreen: null,
  locateOnScreen: null,
  surfaces: [],
  primaryScreen: undefined,
  hudInset: 0,
  hudInsetBottom: 0,
  room: { width: 0, depth: 0 },
  presenting: false,

  showSites: (seat) =>
    set({
      active: true,
      focus: null,
      drag: null,
      aroundDesk: false,
      ...(seat ? { seated: true, cameraFree: false } : { seated: false }),
    }),
  standUp: (aroundDesk = false) => set({ seated: false, aroundDesk, focus: null }),
  sit: () => set({ seated: true, aroundDesk: false, cameraFree: false }),
  close: () => set(SITES_OFF),

  // Zooming to one screen takes the seat again.
  setFocus: (focus) => set(focus ? { focus, seated: true, cameraFree: false } : { focus }),
  setMenu: (menu) => set({ menu }),
  setCameraFree: (cameraFree) => set({ cameraFree }),
  setPicker: (pickScreen) => set({ pickScreen }),
  setLocator: (locateOnScreen) => set({ locateOnScreen }),
  setSurfaces: (surfaces, primaryScreen) => set({ surfaces, primaryScreen }),
  setHudInset: (hudInset) => set({ hudInset }),
  setHudInsetBottom: (hudInsetBottom) => set({ hudInsetBottom }),
  setPresenting: (presenting) => set({ presenting }),
  setRoom: (room) => {
    const current = get().room;
    if (current.width !== room.width || current.depth !== room.depth) set({ room });
  },
  setDeskDrag: (deskDrag) => set({ deskDrag }),

  startDrag: (window, fromScreen, x, y) =>
    set({ drag: { windowId: window.id, title: window.title, fromScreen, x, y, over: null } }),
  updateDrag: (x, y) => {
    const { drag, pickScreen } = get();
    if (!drag) return;
    set({ drag: { ...drag, x, y, over: pickScreen?.(x, y, drag.windowId) ?? null } });
  },
  endDrag: () => {
    const { drag } = get();
    if (!drag) return;
    set({ drag: null });
    if (drag.over) useSetupStore.getState().dropWindow(drag.windowId, drag.fromScreen, drag.over);
  },
}));

// A new product starts with the sites off.
useSetupStore.subscribe((state, previous) => {
  if (state.productId !== previous.productId) useViewStore.setState(SITES_OFF);
});

// A room from a link that names a desk: back at that desk, its sites on.
{
  const setup = useSetupStore.getState();
  if (setup.mode === 'desks' && currentDesk(setup)) useViewStore.getState().showSites(false);
}
