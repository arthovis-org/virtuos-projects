import { Html } from '@react-three/drei';
import type { CSSProperties } from 'react';
import type { Workspace } from '@/catalog/schema';
import { useDesksStore } from '@/state/desksStore';
import styles from './DeskLabel.module.css';

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
 * The name tag floating over a desk in the room overview; clicking it sits the visitor down
 * at that desk.
 */
export function DeskLabel({ deskId, name, number, workspace, height, active }: DeskLabelProps) {
  const selectDesk = useDesksStore((s) => s.selectDesk);
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
        style={{ '--desk-accent': workspace?.accent ?? '#888888' } as CSSProperties}
        onClick={() => selectDesk(deskId)}
        title={`Sit at desk ${number}: ${workspace?.description ?? name}`}
      >
        <span className={styles.icon} aria-hidden="true">
          {workspace?.icon ?? '🖥️'}
        </span>
        <span className={styles.name}>{name}</span>
      </button>
    </Html>
  );
}
