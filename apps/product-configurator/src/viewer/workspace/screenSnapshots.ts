import { useEffect } from 'react';
import { create } from 'zustand';
import { desktopWindows } from '@/desktop';
import { posterId } from '@/state/posterStore';
import { currentDesk, SINGLE_DESK } from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { cssProjection, screenCorners } from './cssProjection';

/**
 * Pictures of the screens of the desk the visitor is at (desktop app), for two things:
 *
 * - While the camera (or the desk) moves, each screen shows its picture instead of its live
 *   pages (`data-moving`, see `cssProjection`): live pages are redrawn at every new angle, and
 *   with a few busy sites on view (TinyGnomes) that made moving stutter, the more the closer.
 *   The picture is laid flat onto the screen, so it turns with it as the page would.
 * - In multiple desks mode, the posters of a desk the visitor left show them, so the room's
 *   other desks show what was on their screens instead of their workspace's icon.
 *
 * Taken once the view has been still for a moment, and again now and then while it stays so.
 * A screen that is partly out of the picture, under the toolbars or behind something (the
 * person, another monitor: read from the scene's own pixels) keeps its last picture, and so
 * does one seen much smaller than in its last picture, unless that one is getting old.
 */
export interface ScreenSnapshot {
  /** The picture (an object URL), of the box around the screen as drawn. */
  url: string;
  width: number;
  height: number;
  /** The screen's corners in the picture: top left, top right, bottom right, bottom left. */
  corners: [number, number][];
  /** When it was taken (`performance.now()`). */
  at: number;
}

interface SnapshotState {
  /**
   * Pictures of whole screens, by poster id (`<desk>/<screen>`; the one desk outside the room
   * is `SINGLE_DESK`).
   */
  shots: Readonly<Record<string, ScreenSnapshot>>;
  /**
   * Close up, sharper pictures of the part of a screen that was in view (it did not all fit),
   * shown over the whole one while the view moves; by the same id. A newer whole picture
   * replaces them.
   */
  parts: Readonly<Record<string, ScreenSnapshot>>;
  setShot: (id: string, shot: ScreenSnapshot, part: boolean) => void;
}

export const useSnapshotStore = create<SnapshotState>()((set, get) => ({
  shots: {},
  parts: {},
  setShot: (id, shot, part) => {
    const { shots, parts } = get();
    const replaced = [part ? undefined : shots[id], parts[id]];
    set(
      part
        ? { parts: { ...parts, [id]: shot } }
        : {
            shots: { ...shots, [id]: shot },
            parts: Object.fromEntries(Object.entries(parts).filter(([key]) => key !== id)),
          },
    );
    for (const old of replaced) if (old) URL.revokeObjectURL(old.url);
  },
}));

/** How long the view stays still before a picture, and how often one is taken again (ms). */
const SETTLE = 500;
const REFRESH = 4000;
/** A picture smaller than this share of the last one waits until that one is this old (ms). */
const SMALLER = 0.6;
const STALE = 30_000;
/** The share of a screen's pixels something may cover before its picture is not taken. */
const COVERED = 0.002;

type Quad = [number, number][];

/** Takes the pictures while the desk is on view (seated or looking around it). */
export function useScreenSnapshots() {
  const capture = desktopWindows?.capture;
  const deskId = useSetupStore((s) => currentDesk(s)?.id ?? SINGLE_DESK);
  const live = useViewStore((s) => s.active);

  useEffect(() => {
    if (!capture || !live) return;
    let takenAt = 0;
    let busy = false;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const { movedAt } = cssProjection;
      if (busy || document.hidden || now - movedAt < SETTLE) return;
      if (takenAt > movedAt && now - takenAt < REFRESH) return;
      const view = useViewStore.getState();
      if (view.drag || view.deskDrag || view.menu) return;
      busy = true;
      takenAt = now;
      void takeAll(capture, deskId, movedAt).finally(() => {
        busy = false;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [capture, deskId, live]);
}

/** A picture to take: of the box `x, y, width, height` (CSS pixels of the layer). */
interface Wanted {
  id: string;
  part: boolean;
  corners: Quad;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A close-up part is only worth taking this much bigger than the whole picture (by area). */
const CLOSER = 1.5;

async function takeAll(
  capture: NonNullable<NonNullable<typeof desktopWindows>['capture']>,
  deskId: string,
  movedAt: number,
) {
  const layer = cssProjection.camera?.parentElement;
  if (!layer) return;
  const box = layer.getBoundingClientRect();
  const { surfaces, hudInset, hudInsetBottom } = useViewStore.getState();
  const { shots } = useSnapshotStore.getState();
  // What can be pictured: the layer, less the toolbars over its top and bottom.
  const view = { left: 0, top: hudInset, right: box.width, bottom: box.height - hudInsetBottom };
  const wanted: Wanted[] = [];
  for (const { screen, widthPx, heightPx } of surfaces) {
    const corners = screenCorners(screen.id, widthPx, heightPx);
    if (!corners) continue;
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const outline = {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
    const area = (outline.right - outline.left) * (outline.bottom - outline.top);
    if (area < 20_000) continue;
    const id = posterId(deskId, screen.id);
    const last = shots[id];
    const whole =
      outline.left >= view.left &&
      outline.right <= view.right &&
      outline.top >= view.top &&
      outline.bottom <= view.bottom;
    let crop = outline;
    if (whole) {
      // Not when much smaller than the last whole picture, unless that is getting old.
      if (last && area < last.width * last.height * SMALLER && performance.now() - last.at < STALE)
        continue;
    } else {
      // Close up: the part in view, when it is much sharper than the whole picture.
      crop = {
        left: Math.max(outline.left, view.left),
        top: Math.max(outline.top, view.top),
        right: Math.min(outline.right, view.right),
        bottom: Math.min(outline.bottom, view.bottom),
      };
      if (crop.right - crop.left < 100 || crop.bottom - crop.top < 100) continue;
      if (last && area < last.width * last.height * CLOSER) continue;
    }
    const x = Math.floor(crop.left);
    const y = Math.floor(crop.top);
    wanted.push({
      id,
      part: !whole,
      corners,
      x,
      y,
      width: Math.floor(crop.right) - x,
      height: Math.floor(crop.bottom) - y,
    });
  }
  if (wanted.length === 0) return;
  const covered = await coveredScreens(wanted);
  for (const [i, { id, part, corners, x, y, width, height }] of wanted.entries()) {
    if (covered[i] ?? true) continue;
    const jpeg = await capture({ x: box.left + x, y: box.top + y, width, height });
    // Moved meanwhile: the picture may be of the view on its way elsewhere.
    if (!jpeg || cssProjection.movedAt !== movedAt) return;
    useSnapshotStore.getState().setShot(
      id,
      {
        url: URL.createObjectURL(new Blob([jpeg as BlobPart], { type: 'image/jpeg' })),
        width,
        height,
        corners: corners.map(([cx, cy]) => [cx - x, cy - y]),
        at: performance.now(),
      },
      part,
    );
  }
}

/**
 * Whether something in the scene is in front of each screen to picture, within its box, from
 * the next frame's pixels: a screen is drawn as a transparent hole, so anything covering it
 * shows as opaque pixels inside its outline.
 */
function coveredScreens(wanted: Wanted[]): Promise<boolean[]> {
  return new Promise((resolve) => {
    cssProjection.probes.push((gl, ratio) => resolve(wanted.map((w) => covered(gl, ratio, w))));
    cssProjection.invalidate?.();
  });
}

function covered(gl: WebGLRenderingContext, ratio: number, wanted: Wanted): boolean {
  const quad = wanted.corners;
  // In device pixels, a little inside the outline, clear of its soft (antialiased) edge.
  const cx = quad.reduce((t, [x]) => t + x, 0) / 4;
  const cy = quad.reduce((t, [, y]) => t + y, 0) / 4;
  const inner: Quad = quad.map(([x, y]) => [
    (cx + (x - cx) * 0.96) * ratio,
    (cy + (y - cy) * 0.96) * ratio,
  ]);
  const bufferHeight = gl.drawingBufferHeight;
  const left = Math.max(0, Math.floor(wanted.x * ratio));
  const top = Math.max(0, Math.floor(wanted.y * ratio));
  const w = Math.min(gl.drawingBufferWidth, Math.ceil((wanted.x + wanted.width) * ratio)) - left;
  const h = Math.min(bufferHeight, Math.ceil((wanted.y + wanted.height) * ratio)) - top;
  if (w <= 0 || h <= 0) return true;
  const pixels = new Uint8Array(w * h * 4);
  // WebGL's rows run from the bottom.
  gl.readPixels(left, bufferHeight - top - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let inside = 0;
  let opaque = 0;
  const step = Math.max(2, Math.round(ratio * 3));
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      if (!insideQuad(inner, left + px, top + py)) continue;
      inside++;
      if ((pixels[((h - 1 - py) * w + px) * 4 + 3] ?? 0) > 16) opaque++;
    }
  }
  return inside === 0 || opaque > inside * COVERED;
}

/** Whether (x, y) is inside a convex quadrilateral, its corners in order. */
function insideQuad(quad: Quad, x: number, y: number) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i] ?? [0, 0];
    const [bx, by] = quad[(i + 1) % 4] ?? [0, 0];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * The CSS transform (matrix3d, from the top left) that lays the quadrilateral `from` (four
 * corners, clockwise from the top left) onto a `width` × `height` box: a perspective mapping,
 * which undoes the screen's turn in the picture.
 */
export function quadToBox(from: [number, number][], width: number, height: number): string {
  const to: [number, number][] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  // Solve for h (h8 = 1): u = (h0 x + h1 y + h2) / (h6 x + h7 y + 1), v likewise with h3..h5;
  // eight equations, by Gauss-Jordan elimination on an 8 × 9 matrix kept flat.
  const m: number[] = [];
  from.forEach(([x, y], i) => {
    const [u, v] = to[i] ?? [0, 0];
    m.push(x, y, 1, 0, 0, 0, -u * x, -u * y, u);
    m.push(0, 0, 0, x, y, 1, -v * x, -v * y, v);
  });
  const at = (r: number, c: number) => m[r * 9 + c] ?? 0;
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(at(r, c)) > Math.abs(at(pivot, c))) pivot = r;
    for (let k = 0; k < 9; k++) {
      const t = at(c, k);
      m[c * 9 + k] = at(pivot, k);
      m[pivot * 9 + k] = t;
    }
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = at(r, c) / at(c, c);
      for (let k = c; k < 9; k++) m[r * 9 + k] = at(r, k) - f * at(c, k);
    }
  }
  const h = (i: number) => at(i, 8) / at(i, i);
  const [a, b, c, d, e, f, g, k] = [h(0), h(1), h(2), h(3), h(4), h(5), h(6), h(7)];
  return `matrix3d(${[a, d, 0, g, b, e, 0, k, 0, 0, 1, 0, c, f, 0, 1].join(',')})`;
}
