/**
 * Dragging a desk onto another in the room overview, to swap their places, or onto the trash
 * that shows while dragging, to remove it. A press on a desk's name tag or one of its screens
 * that moves becomes a drag; one that doesn't is a click (sit down at the desk).
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { removeDesk } from '@/state/actions';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';

/** How far the pointer moves before a press becomes a drag, in CSS pixels. */
const THRESHOLD = 6;
/** How near a name tag the pointer must be to drop on its desk, in CSS pixels. */
const TAG_REACH = 120;

/** Marks the trash (shown while a desk is dragged). */
export const deskTrashAttribute = { 'data-desk-trash': '' };
/** How near the trash the pointer counts as over it, in CSS pixels: an easy target. */
const TRASH_REACH = 24;

/** Whether a viewport position is on (or close to) the trash. */
function overTrash(x: number, y: number): boolean {
  const trash = document.querySelector<HTMLElement>('[data-desk-trash]');
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return (
    x >= r.left - TRASH_REACH &&
    x <= r.right + TRASH_REACH &&
    y >= r.top - TRASH_REACH &&
    y <= r.bottom + TRASH_REACH
  );
}

/** Marks an element as part of a desk, for finding the desk under the pointer. */
export const deskDropAttribute = (deskId: string) => ({ 'data-desk-drop': deskId });

/**
 * The desk under a viewport position, other than `dragged`: the one whose screen is under
 * the pointer (the smallest, where screens overlap on screen), else the one whose name tag is
 * nearest, within reach.
 */
function deskAt(x: number, y: number, dragged: string): string | null {
  let best: { id: string; score: number } | null = null;
  for (const element of document.querySelectorAll<HTMLElement>('[data-desk-drop]')) {
    const id = element.dataset.deskDrop;
    if (!id || id === dragged) continue;
    const r = element.getBoundingClientRect();
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const tag = element.dataset.deskTag !== undefined;
    // Screens under the pointer win over tags (smaller first); tags count by distance.
    const score =
      inside && !tag
        ? r.width * r.height
        : tag
          ? 1e9 + Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
          : Infinity;
    if (tag && score - 1e9 > TAG_REACH) continue;
    if (score < (best?.score ?? Infinity)) best = { id, score };
  }
  return best?.id ?? null;
}

/**
 * Starts following a press on a desk. Drags only in the overview: seated, the screens are for
 * working, and a press is just a click.
 */
export function pressDesk(
  event: ReactPointerEvent<HTMLElement>,
  deskId: string,
  onClick: () => void,
) {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const canDrag = !useViewStore.getState().seated;
  let dragging = false;

  const move = (e: PointerEvent) => {
    if (!canDrag) return;
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      // Iframes would swallow the pointer while it crosses them.
      document.body.classList.add('ws-dragging');
    }
    e.preventDefault();
    const trash = overTrash(e.clientX, e.clientY);
    useViewStore.getState().setDeskDrag({
      deskId,
      x: e.clientX,
      y: e.clientY,
      over: trash ? null : deskAt(e.clientX, e.clientY, deskId),
      trash,
    });
  };
  const end = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    document.body.classList.remove('ws-dragging');
    const view = useViewStore.getState();
    const drag = view.deskDrag;
    view.setDeskDrag(null);
    if (!dragging) {
      if (e.type === 'pointerup') onClick();
      return;
    }
    if (drag?.trash) removeDesk(drag.deskId);
    else if (drag?.over) useSetupStore.getState().swapDesks(drag.deskId, drag.over);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
