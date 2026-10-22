import { useEffect } from 'react';
import { create } from 'zustand';
import { desktopWindows } from '@/desktop';
import { posterId } from '@/state/posterStore';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { cssProjection, screenCorners } from './cssProjection';

/**
 * Pictures of the screens of the desk the visitor is at (desktop app): its posters show them
 * once the visitor leaves it, so the room's other desks show what was on their screens instead
 * of their workspace's icon, at no more cost than an image. Taken while seated, once the view
 * has been still for a moment, and again now and then while it stays so; a screen half out of
 * the picture or under the toolbar keeps its last one.
 */
export interface ScreenSnapshot {
  /** The picture (an object URL), of the box around the screen as drawn. */
  url: string;
  width: number;
  height: number;
  /** The screen's corners in the picture: top left, top right, bottom right, bottom left. */
  corners: [number, number][];
}

interface SnapshotState {
  /** By poster id (`<desk>/<screen>`). */
  shots: Readonly<Record<string, ScreenSnapshot>>;
  setShot: (id: string, shot: ScreenSnapshot) => void;
}

export const useSnapshotStore = create<SnapshotState>()((set, get) => ({
  shots: {},
  setShot: (id, shot) => {
    const previous = get().shots[id];
    set((state) => ({ shots: { ...state.shots, [id]: shot } }));
    if (previous) URL.revokeObjectURL(previous.url);
  },
}));

/** How long the view stays still before a picture, and how often one is taken again (ms). */
const SETTLE = 1200;
const REFRESH = 10_000;

/** Takes the pictures, while the desk is seen seated in multiple desks mode. */
export function useScreenSnapshots() {
  const capture = desktopWindows?.capture;
  const deskId = useSetupStore((s) => (s.mode === 'desks' ? s.activeDeskId : null));
  const live = useViewStore((s) => s.active && s.seated);

  useEffect(() => {
    if (!capture || !deskId || !live) return;
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
    }, 500);
    return () => window.clearInterval(timer);
  }, [capture, deskId, live]);
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
  for (const { screen, widthPx, heightPx } of surfaces) {
    const corners = screenCorners(screen.id, widthPx, heightPx);
    if (!corners) continue;
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    // Wholly in the picture, clear of the toolbars, and big enough to be worth showing.
    if (left < 0 || right > box.width || top < hudInset || bottom > box.height - hudInsetBottom)
      continue;
    if ((right - left) * (bottom - top) < 20_000) continue;
    const x = Math.floor(left);
    const y = Math.floor(top);
    const width = Math.ceil(right) - x;
    const height = Math.ceil(bottom) - y;
    const jpeg = await capture({ x: box.left + x, y: box.top + y, width, height });
    // Moved meanwhile: the picture may be of the view on its way elsewhere.
    if (!jpeg || cssProjection.movedAt !== movedAt) return;
    useSnapshotStore.getState().setShot(posterId(deskId, screen.id), {
      url: URL.createObjectURL(new Blob([jpeg as BlobPart], { type: 'image/jpeg' })),
      width,
      height,
      corners: corners.map(([cx, cy]) => [cx - x, cy - y]),
    });
  }
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
