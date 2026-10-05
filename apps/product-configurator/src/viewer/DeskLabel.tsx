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
    <Html position={[0, height, 0]} center zIndexRange={[150, 100]}>
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
