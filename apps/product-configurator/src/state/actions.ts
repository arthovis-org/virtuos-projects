/**
 * What the visitor does that changes both the set-up and how it is looked at: moving to a
 * desk sits down at it, opening the room starts at the overview, and so on. Plain functions
 * for event handlers.
 */
import { currentDesk, type DeskSetup, type Setup } from './setup';
import { useSetupStore } from './setupStore';
import { useViewStore } from './viewStore';

const setup = () => useSetupStore.getState();
const view = () => useViewStore.getState();

/** Moves to a desk in the room and turns its sites on, seated or looking around. */
export function selectDesk(deskId: string, seat = true) {
  const { activeDeskId } = setup();
  const { seated, focus, active } = view();
  if (deskId === activeDeskId && active && seated === seat && !focus) return;
  setup().setActiveDesk(deskId);
  if (setup().activeDeskId === deskId) view().showSites(seat);
}

/** The next or previous desk, seated; from the overview, the first or the last. */
export function stepDesk(step: number) {
  const { room, activeDeskId } = setup();
  const index = room.findIndex((d) => d.id === activeDeskId);
  const next =
    index < 0
      ? room[step > 0 ? 0 : room.length - 1]
      : room[(index + step + room.length) % room.length];
  if (next && next.id !== activeDeskId) selectDesk(next.id, true);
}

/** Adds a desk with a workspace and sits down at it. */
export function addDesk(workspaceId: string) {
  const id = setup().addDesk(workspaceId);
  if (id) selectDesk(id, true);
}

/** Adds a ready-made desk (planned by the AI) and sits down at it. */
export function addPlannedDesk(desk: DeskSetup) {
  const id = setup().insertDesk(desk);
  if (id) selectDesk(id, true);
  return id;
}

/** Removes a desk; when it was the one the visitor was at, they move to a neighbour. */
export function removeDesk(deskId: string) {
  const next = setup().removeDesk(deskId);
  if (next) view().showSites(view().seated);
}

/**
 * How the visitor was looking at the single desk when they opened the room: its sites on
 * (seated or not), or off. Back at the single desk, it is as they left it.
 */
let singleView: { seated: boolean } | null = null;

/**
 * Opens the room. With the single desk's workspace open, the visitor carries on at that desk
 * in the room (it came along, or joined the room), its sites on as they were. Otherwise: as
 * they left the room (back at their desk, looking around), or the first time at the overview.
 */
export function enterRoom() {
  const before = setup();
  if (before.mode === 'desks') return;
  const { active, seated } = view();
  singleView = active ? { seated } : null;
  const hadRoom = before.room.length > 0;
  setup().enterRoom(active);
  const after = setup();
  // A new room starts with the single desk as its first desk: be at it.
  const carried = !hadRoom && active ? after.room[0] : undefined;
  if (carried) setup().setActiveDesk(carried.id);
  const joined = hadRoom && after.room.length > before.room.length;
  const desk = currentDesk(setup());
  if (!desk) view().close();
  else if (active && (carried ?? joined)) view().showSites(seated);
  else view().showSites(false);
}

/**
 * Home, from wherever the visitor is: in the room, the overview of every desk with none
 * chosen (as the room first opens); at the single desk, the desk itself with its workspace
 * closed (as the page first opens).
 */
export function goHome() {
  if (setup().mode === 'desks') setup().setActiveDesk(null);
  view().close();
}

/** Back to the single desk, as the visitor left it: its workspace open again if it was. */
export function exitRoom() {
  if (setup().mode !== 'desks') return;
  setup().exitRoom();
  if (singleView) view().showSites(singleView.seated);
  else view().close();
}

/** Gives the current desk a workspace and sits down in front of it with the sites on. */
export function enterWorkspace(workspaceId?: string) {
  const desk = currentDesk(setup());
  if (!desk) return;
  if (workspaceId) setup().chooseWorkspace(desk.id, workspaceId);
  view().showSites(true);
}

/** Switches the current desk's workspace, staying where the camera is. */
export function switchWorkspace(workspaceId: string) {
  const desk = currentDesk(setup());
  if (!desk) return;
  setup().chooseWorkspace(desk.id, workspaceId);
  view().setFocus(null);
}

/** Brings a whole set-up in (a saved layout, the sheet): back at its desk, or the overview. */
export function loadSetup(next: Setup) {
  singleView = null;
  setup().replace(next);
  if (next.mode === 'desks' && currentDesk(next)) view().showSites(false);
  else view().close();
}
