import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { selectDesk } from '@/state/actions';
import type { PosterSurfaceInfo } from '@/state/posterStore';
import { deskName, deskWindows } from '@/state/setup';
import { useProduct, useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { deskDropAttribute, pressDesk } from '@/ui/workspace/deskDrag';
import { cssProjection } from './cssProjection';
import styles from './PosterSurface.module.css';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';
import { agentAppOf } from '@/agents/agentDesk';
import { useAgentStore } from '@/agents/agentStore';
import { AgentAppView } from '@/agents/apps/AgentApps';

/**
 * What a screen of a desk the visitor is not at shows: the desk's workspace and the windows
 * waiting on this screen (as they were left, if the visitor was there before). Nothing
 * loads until the visitor sits down, which a click does.
 */
export function PosterSurface({ poster }: { poster: PosterSurfaceInfo }) {
  const { id, deskId, screen, widthPx, heightPx } = poster;
  const ref = useRef<HTMLButtonElement>(null);
  const product = useProduct();
  const desks = useSetupStore((s) => s.room);
  const dropTarget = useViewStore((s) => s.deskDrag?.over === deskId);
  const hasAgent = useAgentStore((s) => !!s.agents[deskId]);

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
  const windows = deskWindows(product, desk).filter(
    (w) => (desk.windows.placement[w.id] ?? w.screen) === screen.id,
  );
  const name = deskName(product, desks, desk);
  // An agent's desk shows its agent's work live, even from across the room: its apps (the
  // first on this screen), or for a page it reads, its sources app.
  const app = hasAgent
    ? (windows.map((w) => agentAppOf(w.url)).find((a) => a !== null) ??
      (windows.length > 0 ? 'sources' : null))
    : null;

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
      {app ? (
        <AgentAppView app={app} deskId={deskId} compact />
      ) : (
        <>
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
        </>
      )}
    </button>
  );
}
