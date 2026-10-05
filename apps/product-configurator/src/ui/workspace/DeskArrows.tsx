import { useProduct } from '@/state/configuratorStore';
import { deskName, useDesksStore } from '@/state/desksStore';
import { useWorkspaceStore } from '@/state/workspaceStore';
import styles from './DeskArrows.module.css';

type Side = 'left' | 'right';

/**
 * Seated at a desk in the room: arrows on the viewer's sides to the desk on the left and on
 * the right (as the switcher orders them, which is how they stand). Each appears while the
 * mouse is on a thin strip along its side, so they stay out of the way of the screens. The
 * strip, not the page, notices the mouse: over a website the page gets no mouse moves, and
 * the side monitors often reach the viewer's edges. On a touch screen, which has no hover,
 * the arrows stay visible.
 */
export function DeskArrows() {
  const product = useProduct();
  const desks = useDesksStore((s) => s.desks);
  const activeDeskId = useDesksStore((s) => s.activeDeskId);
  const stepDesk = useDesksStore((s) => s.stepDesk);
  const seated = useWorkspaceStore((s) => s.seated);

  const index = desks.findIndex((d) => d.id === activeDeskId);
  if (!seated || index < 0 || desks.length < 2) return null;

  const edge = (side: Side) => {
    const desk = desks[(index + (side === 'left' ? -1 : 1) + desks.length) % desks.length];
    if (!desk) return null;
    const name = deskName(product, desks, desk);
    const icon = product.workspaces.find((w) => w.id === desk.workspaceId)?.icon;
    return (
      <div className={styles.edge} data-side={side}>
        <button
          type="button"
          className={styles.arrow}
          aria-label={`${side === 'left' ? 'Previous' : 'Next'} desk: ${name}`}
          onClick={() => stepDesk(side === 'left' ? -1 : 1)}
        >
          <span className={styles.chevron} aria-hidden="true">
            {side === 'left' ? '‹' : '›'}
          </span>
          <span className={styles.name}>
            {icon && <span aria-hidden="true">{icon} </span>}
            {name}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className={styles.area}>
      {edge('left')}
      {edge('right')}
    </div>
  );
}
