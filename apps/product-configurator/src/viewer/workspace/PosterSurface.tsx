import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useProduct } from '@/state/configuratorStore';
import { deskName, useDesksStore } from '@/state/desksStore';
import type { PosterSurfaceInfo } from '@/state/posterStore';
import { openWindows, useWorkspaceStore } from '@/state/workspaceStore';
import { deskDropAttribute, pressDesk } from '@/ui/workspace/deskDrag';
import { cssProjection } from './cssProjection';
import styles from './PosterSurface.module.css';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';

/**
 * What a screen of a desk the visitor is not at shows: the desk's workspace and the windows
 * waiting on this screen (as they were left, if the visitor was there before). Nothing
 * loads until the visitor sits down, which a click does.
 */
export function PosterSurface({ poster }: { poster: PosterSurfaceInfo }) {
  const { id, deskId, screen, widthPx, heightPx } = poster;
  const ref = useRef<HTMLButtonElement>(null);
  const product = useProduct();
  const desks = useDesksStore((s) => s.desks);
  const selectDesk = useDesksStore((s) => s.selectDesk);
  const saved = useWorkspaceStore((s) => s.saved[deskId]);
  const dropTarget = useDesksStore((s) => s.deskDrag?.over === deskId);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    cssProjection.surfaces.set(id, element);
    cssProjection.invalidate?.();
    return () => {
      cssProjection.surfaces.delete(id);
    };
  }, [id]);

  const desk = desks.find((d) => d.id === deskId);
  const workspace = product.workspaces.find((w) => w.id === desk?.workspaceId);
  if (!desk || !workspace) return null;
  const kept = saved?.workspaceId === workspace.id ? saved : undefined;
  const windows = (
    kept ? openWindows(workspace, kept.closed, kept.opened) : workspace.windows
  ).filter((w) => (kept?.placement[w.id] ?? w.screen) === screen.id);
  const name = deskName(product, desks, desk);

  return (
    <button
      ref={ref}
      type="button"
      className={styles.poster}
      data-portrait={heightPx > widthPx || undefined}
      data-drop={dropTarget || undefined}
      {...deskDropAttribute(deskId)}
      style={
        {
          width: widthPx,
          height: heightPx,
          '--desk-accent': workspace.accent ?? '#4c8dff',
        } as CSSProperties
      }
      onPointerDown={(event) => pressDesk(event, deskId, () => selectDesk(deskId))}
      // Pointer clicks are handled by the press; this is the keyboard's.
      onClick={(event) => {
        if (event.detail === 0) selectDesk(deskId);
      }}
      aria-label={`${screen.label} screen of the ${name} desk: sit down here`}
    >
      <span className={styles.icon} aria-hidden="true">
        <WorkspaceIcon name={workspace.icon} />
      </span>
      {windows.length > 0 ? (
        <span className={styles.windows}>
          {windows.map((w) => (
            <span key={w.id} className={styles.window}>
              {w.title}
            </span>
          ))}
        </span>
      ) : (
        <span className={styles.window}>{name}</span>
      )}
      <span className={styles.desk}>
        {name} · {screen.label}
      </span>
    </button>
  );
}
