import { useEffect, useLayoutEffect, useRef } from 'react';
import { useProduct } from '@/state/configuratorStore';
import { usePosterStore } from '@/state/posterStore';
import {
  layoutWindows,
  openWindows,
  useWorkspaceStore,
  workspaceById,
} from '@/state/workspaceStore';
import { cssProjection } from './cssProjection';
import { PosterSurface } from './PosterSurface';
import styles from './ScreenLayer.module.css';
import { ScreenSurface } from './ScreenSurface';

/**
 * The websites of workspace mode, in a DOM layer over the canvas. The viewer publishes which
 * screens are on and positions each surface every frame; nothing is mounted (or loaded) until
 * a visitor enters the mode. In unlimited desks mode the other desks' screens show posters.
 */
export function ScreenLayer() {
  const product = useProduct();
  const active = useWorkspaceStore((s) => s.active);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const placement = useWorkspaceStore((s) => s.placement);
  const order = useWorkspaceStore((s) => s.order);
  const closed = useWorkspaceStore((s) => s.closed);
  const opened = useWorkspaceStore((s) => s.opened);
  const surfaces = useWorkspaceStore((s) => s.surfaces);
  const primaryScreen = useWorkspaceStore((s) => s.primaryScreen);
  const posters = usePosterStore((s) => s.posters);
  const hasPosters = usePosterStore((s) => Object.keys(s.posters).length > 0);
  // Live sites, or the posters of the room's desks (also with no desk chosen yet).
  const shown = active || hasPosters;
  const camera = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  // Browsers don't hit-test the mouse wheel into this 3D-transformed layer: a wheel over a
  // screen goes to whatever is under the layer (the orbit surface), so lists on the screens
  // (an empty screen's suggestions) didn't scroll. Find the element the way clicks do and
  // scroll its nearest scrollable box. (Websites in windows are other documents; their own
  // scrolling is theirs.)
  useEffect(() => {
    if (!shown) return;
    const onWheel = (event: WheelEvent) => {
      const root = layer.current;
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (!root || !hit || !root.contains(hit)) return;
      for (let node: Element | null = hit; node && node !== root; node = node.parentElement) {
        if (!(node instanceof HTMLElement)) continue;
        const overflow = getComputedStyle(node).overflowY;
        if (overflow !== 'auto' && overflow !== 'scroll') continue;
        const room = node.scrollHeight - node.clientHeight;
        const down = event.deltaY > 0;
        if (room <= 0 || (down ? node.scrollTop >= room - 1 : node.scrollTop <= 0)) continue;
        event.preventDefault();
        const unit =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 40
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? node.clientHeight
              : 1;
        node.scrollTop += event.deltaY * unit;
        return;
      }
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [shown]);

  useLayoutEffect(() => {
    if (!shown) return;
    cssProjection.camera = camera.current;
    cssProjection.invalidate?.();
    return () => {
      cssProjection.camera = null;
    };
  }, [shown]);

  if (!shown) return null;

  const workspace = workspaceById(product, workspaceId);
  const closedWindows = (workspace?.windows ?? []).filter((w) => closed.includes(w.id));
  const layout = layoutWindows(
    openWindows(workspace, closed, opened),
    placement,
    order,
    surfaces.map((s) => s.screen.id),
    primaryScreen,
  );
  const targets = surfaces.map((s) => s.screen);

  return (
    <div ref={layer} className={styles.layer}>
      <div ref={camera} className={styles.camera}>
        {surfaces.map((surface) => (
          <ScreenSurface
            key={surface.screen.id}
            surface={surface}
            windows={layout.get(surface.screen.id) ?? []}
            targets={targets}
            closed={closedWindows}
          />
        ))}
        {Object.values(posters)
          .flat()
          .map((poster) => (
            <PosterSurface key={poster.id} poster={poster} />
          ))}
      </div>
    </div>
  );
}
