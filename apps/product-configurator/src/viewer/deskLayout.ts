import type { Room } from '@/state/desksStore';

/** Space between desks side by side, in metres. */
const GAP = 0.9;
/** Aisle between rows, room for a chair, in metres. */
const AISLE = 1.7;

export interface DeskLayout {
  /** Where each desk stands, in order; the first row is the one nearest the viewer. */
  positions: [number, number, number][];
  room: Room;
}

/**
 * The room of unlimited desks mode: desks in rows, as square as the count allows, centred
 * on the origin and all facing the viewer like an open-plan office. A short last row is
 * centred too.
 */
export function deskGrid(count: number, width: number, depth: number): DeskLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const dx = width + GAP;
  const dz = depth + AISLE;
  const positions = Array.from({ length: count }, (_, i): [number, number, number] => {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, count - row * columns);
    return [((i % columns) - (inRow - 1) / 2) * dx, 0, ((rows - 1) / 2 - row) * dz];
  });
  return { positions, room: { width: columns * dx, depth: rows * dz } };
}
