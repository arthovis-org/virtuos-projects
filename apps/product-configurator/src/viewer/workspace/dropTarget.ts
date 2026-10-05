import type { DropTarget } from '@/state/viewStore';

/** Share of a window, from each end, that puts the dropped window next to it. */
const EDGE = 0.3;

/**
 * What dropping `dragged` at `x`, `y` (CSS pixels on the screen element) would do. The window
 * under the point is split in zones along the screen's tiling direction (across on landscape
 * screens, down on portrait ones): the ends place the window before or after it, the middle
 * swaps the two. An empty screen just takes the window. Returns null for a no-op.
 */
export function dropTargetAt(
  screen: string,
  element: HTMLElement,
  x: number,
  y: number,
  dragged: string,
): DropTarget | null {
  const windows = [...element.querySelectorAll<HTMLElement>('[data-window-id]')];
  if (windows.length === 0) {
    return {
      screen,
      action: 'move',
      rect: { x: 0, y: 0, width: element.clientWidth, height: element.clientHeight },
    };
  }

  // Layout offsets are in the screen's own pixels, unaffected by the 3D transform.
  const rects = windows.map((w) => ({
    id: w.dataset.windowId ?? '',
    x: w.offsetLeft,
    y: w.offsetTop,
    width: w.offsetWidth,
    height: w.offsetHeight,
  }));
  const distance = (r: (typeof rects)[number]) =>
    Math.hypot(
      Math.max(r.x - x, 0, x - (r.x + r.width)),
      Math.max(r.y - y, 0, y - (r.y + r.height)),
    );
  const hit = rects.reduce((best, r) => (distance(r) < distance(best) ? r : best));
  if (hit.id === dragged) return null;

  const vertical = element.dataset.portrait !== undefined;
  const along = vertical ? (y - hit.y) / hit.height : (x - hit.x) / hit.width;
  const { id, ...rect } = hit;
  if (along > EDGE && along < 1 - EDGE) return { screen, action: 'swap', windowId: id, rect };

  const before = along <= EDGE;
  // Skip drops that would leave the order as it is.
  const index = rects.indexOf(hit);
  const neighbour = rects[before ? index - 1 : index + 1];
  if (neighbour?.id === dragged) return null;
  const half = vertical
    ? { ...rect, height: rect.height / 2, y: before ? rect.y : rect.y + rect.height / 2 }
    : { ...rect, width: rect.width / 2, x: before ? rect.x : rect.x + rect.width / 2 };
  return { screen, action: before ? 'before' : 'after', windowId: id, rect: half };
}
