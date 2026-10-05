import type { Room } from '@/state/desksStore';

/** Space between neighbouring desks along an arc, in metres. */
const GAP = 0.7;
/**
 * Radius of the first arc, in metres: the distance from the focal point to the desks. Wide
 * enough for eight desks side by side.
 */
const FIRST_RADIUS = 6.5;
/** Aisle between one arc and the next, room for a chair, in metres. */
const AISLE = 1.8;
/** Widest an arc may open, in radians: wider and the end desks are seen edge-on. */
const MAX_ARC = (150 * Math.PI) / 180;

export interface DeskPlacement {
  position: [number, number, number];
  /** Turn about the vertical axis, in radians, so the desk faces the focal point. */
  rotation: number;
}

export interface DeskLayout {
  /** Where each desk stands, in order: the first arc left to right, then the next arc. */
  placements: DeskPlacement[];
  room: Room;
}

/**
 * The room of unlimited desks mode: desks side by side on arcs around one focal point, each
 * turned to face it, like seats on a huge sphere, so wherever the visitor looks from the
 * middle they see a desk's screens. A full arc continues on a wider one behind it (which
 * holds more desks). Centred on the origin.
 */
export function deskArcs(count: number, width: number, depth: number): DeskLayout {
  const pitch = width + GAP;
  const raw: DeskPlacement[] = [];
  for (let row = 0, placed = 0; placed < count; row++) {
    const radius = FIRST_RADIUS + row * (depth + AISLE);
    const step = 2 * Math.asin(Math.min(1, pitch / (2 * radius)));
    const capacity = Math.floor(MAX_ARC / step) + 1;
    const inRow = Math.min(capacity, count - placed);
    // Left to right, like the switcher, so Ctrl + → moves to the desk on the right.
    for (let i = 0; i < inRow; i++) {
      const angle = (i - (inRow - 1) / 2) * step;
      raw.push({
        position: [radius * Math.sin(angle), 0, -radius * Math.cos(angle)],
        rotation: -angle,
      });
    }
    placed += inRow;
  }

  // Centre the room on the origin; each desk reaches about half its diagonal around itself.
  const reach = Math.hypot(width, depth) / 2;
  const xs = raw.map((p) => p.position[0]);
  const zs = raw.map((p) => p.position[2]);
  const minX = Math.min(...xs) - reach;
  const maxX = Math.max(...xs) + reach;
  const minZ = Math.min(...zs) - reach;
  const maxZ = Math.max(...zs) + reach;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return {
    placements: raw.map(({ position: [x, y, z], rotation }) => ({
      position: [x - cx, y, z - cz],
      rotation,
    })),
    room: { width: maxX - minX, depth: maxZ - minZ },
  };
}
