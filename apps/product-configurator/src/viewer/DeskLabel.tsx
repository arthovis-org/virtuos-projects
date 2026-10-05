import { Html } from '@react-three/drei';
import type { CSSProperties } from 'react';
import type { Workspace } from '@/catalog/schema';
import { selectDesk } from '@/state/actions';
import { useViewStore } from '@/state/viewStore';
import { deskDropAttribute, pressDesk } from '@/ui/workspace/deskDrag';
import styles from './DeskLabel.module.css';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';

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
 * The name tag floating over a desk in the room overview: clicking it sits the visitor down
 * at that desk, dragging it onto another desk swaps the two.
 */
export function DeskLabel({ deskId, name, number, workspace, height, active }: DeskLabelProps) {
  const dropTarget = useViewStore((s) => s.deskDrag?.over === deskId);
  const dragged = useViewStore((s) => s.deskDrag?.deskId === deskId);
  return (
    // Nearer tags cover farther ones: drei orders them by distance over the camera's whole
    // depth range, so the range must be wide; a narrow one (it was 50 steps) gave desks a few
    // metres apart the same order, and a farther tag could cover a nearer one. They stay under
    // the viewer's controls whatever the number: the canvas they live in is a layer below them.
    <Html position={[0, height, 0]} center zIndexRange={[16777271, 0]}>
      <button
        type="button"
        className={styles.label}
        data-active={active || undefined}
        data-drop={dropTarget || undefined}
        data-dragged={dragged || undefined}
        data-desk-tag=""
        {...deskDropAttribute(deskId)}
        style={{ '--desk-accent': workspace?.accent ?? '#888888' } as CSSProperties}
        onPointerDown={(event) => pressDesk(event, deskId, () => selectDesk(deskId))}
        // Pointer clicks are handled by the press; this is the keyboard's.
        onClick={(event) => {
          if (event.detail === 0) selectDesk(deskId);
        }}
        title={`Sit at desk ${number} (drag onto another desk to swap, or to the trash to remove): ${workspace?.description ?? name}`}
      >
        <span className={styles.icon} aria-hidden="true">
          <WorkspaceIcon name={workspace?.icon} size={15} />
        </span>
        <span className={styles.name}>{name}</span>
      </button>
    </Html>
  );
}
