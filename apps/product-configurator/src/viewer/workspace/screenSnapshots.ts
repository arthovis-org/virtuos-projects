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
 * - While the camera (or the desk) moves, a busy site's screen shows its pictures instead of its
 *   live pages (`data-moving`, see `cssProjection`): live pages are redrawn at every new angle,
 *   and with a few busy sites on view (TinyGnomes) that made moving stutter, the more the
 *   closer. A picture is laid flat onto its screen, so it turns with it as the page would.
 * - In multiple desks mode, the posters of a desk the visitor left show them, so the room's
 *   other desks show what was on their screens instead of their workspace's icon.
 *
 * Taken once the view has been still for a moment, and again now and then while it stays so.
 * A screen keeps a few pictures, newest on top: what covered part of it (the person, another
 * monitor's frame: read from the scene's own pixels) is cut out of a picture, so an older one
 * shows through there; a screen partly out of the view or under the toolbars is pictured as far
 * as it is in view, and a newer whole, uncovered picture replaces them all.
 */
export interface ScreenSnapshot {
  /** The picture (an object URL), of the box around the screen (or its part in view) as drawn. */
  url: string;
  width: number;
  height: number;
  /** The screen's corners in the picture: top left, top right, bottom right, bottom left. */
  corners: [number, number][];
  /** When it was taken (`performance.now()`). */
  at: number;
  /** All of the screen was in view. */
  whole: boolean;
  /** Something covered part of it: those pixels are transparent. */
  holes: boolean;
}

interface SnapshotState {
  /**
   * Each screen's pictures, oldest first, by poster id (`<desk>/<screen>`; the one desk
   * outside the room is `SINGLE_DESK`).
   */
  shots: Readonly<Record<string, readonly ScreenSnapshot[]>>;
  addShot: (id: string, shot: ScreenSnapshot) => void;
}

/** Pictures kept of a screen, at most. */
const LAYERS = 3;

export const useSnapshotStore = create<SnapshotState>()((set, get) => ({
  shots: {},
  addShot: (id, shot) => {
    const before = get().shots[id] ?? [];
    const after = shot.whole && !shot.holes ? [shot] : [...before, shot].slice(-LAYERS);
    set((state) => ({ shots: { ...state.shots, [id]: after } }));
    for (const old of before) if (!after.includes(old)) URL.revokeObjectURL(old.url);
  },
}));

/** A screen's pictures can stand in for its live pages: the lowest one has nothing cut out. */
export const showsWhole = (shots: readonly ScreenSnapshot[] | undefined) =>
  !!shots?.[0] && !shots[0].holes;

/** How long the view stays still before a picture, and how often one is taken again (ms). */
const SETTLE = 500;
const REFRESH = 4000;
/** A picture smaller than this share of the last whole one waits until that one is this old. */
const SMALLER = 0.6;
const STALE = 30_000;
/** A close-up part is only worth taking this much bigger than the last whole picture. */
const CLOSER = 1.5;
/** Covered beyond this share, a screen is not pictured; up to this one, nothing is cut out. */
const MOSTLY_COVERED = 0.5;
const UNCOVERED = 0.002;

type Quad = [number, number][];

/**
 * The sites whose screens show their picture while the view moves: the busy ones, whose
 * redrawing made moving stutter (TinyGnomes, for now). Other screens stay live.
 */
const STILL_WHILE_MOVING = /(^|\.)tinygnomes\.com$/i;

/** Whether a screen showing these sites shows its picture while the view moves. */
export function stillWhileMoving(urls: readonly string[]): boolean {
  return urls.some((url) => {
    try {
      return STILL_WHILE_MOVING.test(new URL(url).hostname);
    } catch {
      return false;
    }
  });
}

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
  whole: boolean;
  corners: Quad;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What covers a screen to picture: its share, and which pixels of its box (device pixels). */
interface Cover {
  share: number;
  /** Per pixel of the box, from the top left: 0 where something covers the screen, else 255. */
  mask: Uint8Array;
  width: number;
  height: number;
}

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
    // Big enough to be worth a picture (the other desks are seen far smaller in the room).
    if (area < 5_000) continue;
    const id = posterId(deskId, screen.id);
    const last = [...(shots[id] ?? [])].reverse().find((s) => s.whole);
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
      whole,
      corners,
      x,
      y,
      width: Math.floor(crop.right) - x,
      height: Math.floor(crop.bottom) - y,
    });
  }
  if (wanted.length === 0) return;
  const covers = await coveredScreens(wanted);
  for (const [i, { id, whole, corners, x, y, width, height }] of wanted.entries()) {
    const cover = covers[i];
    if (!cover || cover.share > MOSTLY_COVERED) continue;
    const jpeg = await capture({ x: box.left + x, y: box.top + y, width, height });
    // Moved meanwhile: the picture may be of the view on its way elsewhere.
    if (!jpeg || cssProjection.movedAt !== movedAt) return;
    const holes = cover.share > UNCOVERED;
    const picture = holes
      ? await cutOut(jpeg, cover)
      : new Blob([jpeg as BlobPart], { type: 'image/jpeg' });
    if (!picture) continue;
    useSnapshotStore.getState().addShot(id, {
      url: URL.createObjectURL(picture),
      width,
      height,
      corners: corners.map(([cx, cy]) => [cx - x, cy - y]),
      at: performance.now(),
      whole,
      holes,
    });
  }
}

/** The picture with the covered pixels made transparent (WebP keeps them so). */
async function cutOut(jpeg: Uint8Array, cover: Cover): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }));
    const canvas = new OffscreenCanvas(cover.width, cover.height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, cover.width, cover.height);
    bitmap.close();
    const image = context.getImageData(0, 0, cover.width, cover.height);
    for (let i = 0; i < cover.mask.length; i++) {
      if (cover.mask[i] === 0) image.data[i * 4 + 3] = 0;
    }
    context.putImageData(image, 0, 0);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  } catch {
    return null;
  }
}

/**
 * What in the scene is in front of each screen to picture, within its box, from the next
 * frame's pixels: a screen is drawn as a transparent hole, so anything covering it shows as
 * opaque pixels inside its outline.
 */
function coveredScreens(wanted: Wanted[]): Promise<(Cover | null)[]> {
  return new Promise((resolve) => {
    cssProjection.probes.push((gl, ratio) => resolve(wanted.map((w) => coverOf(gl, ratio, w))));
    cssProjection.invalidate?.();
  });
}

function coverOf(gl: WebGLRenderingContext, ratio: number, wanted: Wanted): Cover | null {
  const quad = wanted.corners;
  // In device pixels, a little inside the outline, clear of its soft (antialiased) edge.
  const cx = quad.reduce((t, [x]) => t + x, 0) / 4;
  const cy = quad.reduce((t, [, y]) => t + y, 0) / 4;
  const inner: Quad = quad.map(([x, y]) => [
    (cx + (x - cx) * 0.98) * ratio,
    (cy + (y - cy) * 0.98) * ratio,
  ]);
  const bufferHeight = gl.drawingBufferHeight;
  const left = Math.max(0, Math.floor(wanted.x * ratio));
  const top = Math.max(0, Math.floor(wanted.y * ratio));
  const w = Math.min(gl.drawingBufferWidth, Math.ceil((wanted.x + wanted.width) * ratio)) - left;
  const h = Math.min(bufferHeight, Math.ceil((wanted.y + wanted.height) * ratio)) - top;
  if (w <= 0 || h <= 0) return null;
  const pixels = new Uint8Array(w * h * 4);
  // WebGL's rows run from the bottom.
  gl.readPixels(left, bufferHeight - top - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const mask = new Uint8Array(w * h).fill(255);
  let inside = 0;
  let opaque = 0;
  for (let py = 0; py < h; py++) {
    // Along the row, only between the outline's edges.
    for (let px = 0; px < w; px++) {
      if (!insideQuad(inner, left + px, top + py)) continue;
      inside++;
      if ((pixels[((h - 1 - py) * w + px) * 4 + 3] ?? 0) > 8) {
        opaque++;
        mask[py * w + px] = 0;
      }
    }
  }
  if (inside === 0) return null;
  return { share: opaque / inside, mask: grow(mask, w, h), width: w, height: h };
}

/** The cut-out a pixel wider all round, so no soft edge of what covered the screen is left. */
function grow(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = mask.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 0;
      }
    }
  }
  return out;
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
