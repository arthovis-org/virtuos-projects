import { Html } from '@react-three/drei';
import { Armchair, Rotate3d } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Workspace } from '@/catalog/schema';
import { selectDesk } from '@/state/actions';
import { useViewStore } from '@/state/viewStore';
import { deskDropAttribute, pressDesk } from '@/ui/workspace/deskDrag';
import styles from './DeskLabel.module.css';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';
import { AgentTag } from '@/agents/AgentTag';
import { useAgentStore } from '@/agents/agentStore';

interface DeskLabelProps {
  deskId: string;
  name: string;
  number: number;
  workspace: Workspace | undefined;
  /** Height above the floor, in metres. */
  height: number;
  active: boolean;
}

/**
 * The name tag floating over a desk in the room overview: clicking it picks that desk, dragging
 * it onto another desk swaps the two. In the overview of all desks, pointing at it (or the
 * click) also opens a small bar of icons over the tag to sit at the desk or look around it,
 * right where the pointer is.
 */
/** How long a menu opened by pointing stays once the pointer has left it (ms). */
const HOVER_LINGER = 250;

export function DeskLabel({ deskId, name, number, workspace, height, active }: DeskLabelProps) {
  const dropTarget = useViewStore((s) => s.deskDrag?.over === deskId);
  const dragged = useViewStore((s) => s.deskDrag?.deskId === deskId);
  const agent = useAgentStore((s) => s.agents[deskId]);
  // Overlooking all the desks (not seated at one, nor looking around one).
  const overview = useViewStore((s) => !s.seated && !s.aroundDesk);
  const standUp = useViewStore((s) => s.standUp);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragging = useViewStore((s) => !!s.deskDrag);
  const menu = menuOpen && overview && !dragging;
  const tag = useRef<HTMLDivElement>(null);
  // Opened by pointing (not a click): it goes once the pointer has left for a moment.
  const hovered = useRef(false);
  const leaving = useRef(0);

  // Gone with a press anywhere else (another desk's tag opens its own) or Escape, and for good
  // once the view changes: back in the overview later, it waits for another click.
  useEffect(() => {
    if (!menu) return;
    const press = (event: PointerEvent) => {
      if (!tag.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('keydown', key);
      setMenuOpen(false);
    };
  }, [menu]);

  const pick = () => {
    const { seated, aroundDesk } = useViewStore.getState();
    const opens = !seated && !aroundDesk;
    selectDesk(deskId);
    hovered.current = false;
    if (opens) setMenuOpen(true);
  };

  const enter = () => {
    window.clearTimeout(leaving.current);
    const { seated, aroundDesk, deskDrag } = useViewStore.getState();
    if (menuOpen || seated || aroundDesk || deskDrag) return;
    hovered.current = true;
    setMenuOpen(true);
  };
  const leave = () => {
    if (!hovered.current) return;
    window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(() => {
      hovered.current = false;
      setMenuOpen(false);
    }, HOVER_LINGER);
  };
  useEffect(() => () => window.clearTimeout(leaving.current), []);

  return (
    // Nearer tags cover farther ones: drei orders them by distance over the camera's whole
    // depth range, so the range must be wide; a narrow one (it was 50 steps) gave desks a few
    // metres apart the same order, and a farther tag could cover a nearer one. They stay under
    // the viewer's controls whatever the number: the canvas they live in is a layer below them.
    <Html position={[0, height, 0]} center zIndexRange={[16777271, 0]}>
      <div
        ref={tag}
        className={styles.tag}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') enter();
        }}
        onPointerLeave={leave}
        style={{ '--desk-accent': workspace?.accent ?? '#888888' } as CSSProperties}
      >
        <button
          type="button"
          className={styles.label}
          data-active={active || undefined}
          data-drop={dropTarget || undefined}
          data-dragged={dragged || undefined}
          data-desk-tag=""
          data-agent={agent ? '' : undefined}
          {...deskDropAttribute(deskId)}
          style={{ '--desk-accent': workspace?.accent ?? '#888888' } as CSSProperties}
          onPointerDown={(event) => pressDesk(event, deskId, pick)}
          // Pointer clicks are handled by the press; this is the keyboard's.
          onClick={(event) => {
            if (event.detail === 0) pick();
          }}
          aria-expanded={menu}
          title={`Pick desk ${number} (drag onto another desk to swap, or to the trash to remove): ${workspace?.description ?? name}`}
        >
          {agent ? (
            // An agent's desk: who works there, and what they are doing now.
            <AgentTag agent={agent} />
          ) : (
            <>
              <span className={styles.icon} aria-hidden="true">
                <WorkspaceIcon name={workspace?.icon} size={15} />
              </span>
              <span className={styles.name}>{name}</span>
            </>
          )}
        </button>
        {menu && (
          <div className={styles.menu} role="menu" aria-label={`Desk ${number}`}>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              aria-label="Seated view"
              title="Seated view"
              onClick={() => {
                setMenuOpen(false);
                selectDesk(deskId, true);
              }}
            >
              <Armchair size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              aria-label="Look around"
              title="Look around"
              onClick={() => {
                setMenuOpen(false);
                selectDesk(deskId);
                standUp(true);
              }}
            >
              <Rotate3d size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </Html>
  );
}
