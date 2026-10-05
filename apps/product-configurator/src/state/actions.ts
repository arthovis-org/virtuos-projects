/**
 * What the visitor does that changes both the set-up and how it is looked at: moving to a
 * desk sits down at it, opening the room starts at the overview, and so on. Plain functions
 * for event handlers.
 */
import { currentDesk, type Setup } from './setup';
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

/** Removes a desk; when it was the one the visitor was at, they move to a neighbour. */
export function removeDesk(deskId: string) {
  const next = setup().removeDesk(deskId);
  if (next) view().showSites(view().seated);
}

/**
 * Opens the room: as the visitor left it (back at their desk, looking around), or the first
 * time from the single desk, at the overview with the sites off.
 */
export function enterRoom() {
  const before = setup();
  if (before.mode === 'desks') return;
  setup().enterRoom(view().active);
  const desk = currentDesk(setup());
  if (desk) view().showSites(false);
  else view().close();
}

/** Back to the single desk, with the sites off. */
export function exitRoom() {
  if (setup().mode !== 'desks') return;
  setup().exitRoom();
  view().close();
}

/** Gives the current desk a workspace and sits down in front of it with the sites on. */
export function enterWorkspace(workspaceId?: string) {
  const desk = currentDesk(setup());
  if (!desk) return;
  if (workspaceId) setup().setDeskWorkspace(desk.id, workspaceId);
  view().showSites(true);
}

/** Switches the current desk's workspace, staying where the camera is. */
export function switchWorkspace(workspaceId: string) {
  const desk = currentDesk(setup());
  if (!desk) return;
  setup().setDeskWorkspace(desk.id, workspaceId);
  view().setFocus(null);
}

/** Brings a whole set-up in (a saved layout, the sheet): back at its desk, or the overview. */
export function loadSetup(next: Setup) {
  setup().replace(next);
  if (next.mode === 'desks' && currentDesk(next)) view().showSites(false);
  else view().close();
}
