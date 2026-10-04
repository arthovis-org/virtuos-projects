import { useLayoutEffect, useRef } from 'react';
import { useProduct } from '@/state/configuratorStore';
import {
  layoutWindows,
  openWindows,
  useWorkspaceStore,
  workspaceById,
} from '@/state/workspaceStore';
import { cssProjection } from './cssProjection';
import styles from './ScreenLayer.module.css';
import { ScreenSurface } from './ScreenSurface';

/**
 * The websites of workspace mode, in a DOM layer over the canvas. The viewer publishes which
 * screens are on and positions each surface every frame; nothing is mounted (or loaded) until
 * a visitor enters the mode.
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
  const camera = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!active) return;
    cssProjection.camera = camera.current;
    cssProjection.invalidate?.();
    return () => {
      cssProjection.camera = null;
    };
  }, [active]);

  if (!active) return null;

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
    <div className={styles.layer}>
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
      </div>
    </div>
  );
}
