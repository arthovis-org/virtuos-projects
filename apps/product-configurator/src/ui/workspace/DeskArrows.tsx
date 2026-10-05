import { useEffect, useRef, useState } from 'react';
import { useProduct } from '@/state/setupStore';
import { stepDesk } from '@/state/actions';
import { deskName } from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';
import styles from './DeskArrows.module.css';

type Side = 'left' | 'right';

/** How near the viewer's side the mouse must come for that side's arrow, in CSS pixels. */
const EDGE = 96;

/**
 * At a desk in the room (seated or looking around it): arrows on the viewer's sides to the
 * desk on the left and on the right (as the switcher orders them, which is how they stand).
 * Each appears when the mouse comes near its side, so they stay out of the way of the screens.
 *
 * Nothing wide may sit over the side monitors (a wide hover strip blocked dragging their
 * windows), so the mouse is followed on the page itself, which blocks nothing. Over a
 * website the page gets no mouse moves, so a hairline strip at the viewer's very edge, where
 * monitors rarely reach, catches the mouse there. Only the arrow itself takes clicks, and only
 * while shown. On a touch screen, which has no hover, the arrows stay visible.
 */
export function DeskArrows() {
  const product = useProduct();
  const desks = useSetupStore((s) => s.room);
  const activeDeskId = useSetupStore((s) => s.activeDeskId);
  const atDesk = useViewStore((s) => s.seated || s.aroundDesk);
  // The arrows sit between the toolbar and the desk switcher.
  const top = useViewStore((s) => s.hudInset);
  const bottom = useViewStore((s) => s.hudInsetBottom);
  const [near, setNear] = useState<Side | null>(null);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const r = area.current?.getBoundingClientRect();
      const side: Side | null =
        !r || event.clientY < r.top || event.clientY > r.bottom
          ? null
          : event.clientX >= r.left && event.clientX - r.left < EDGE
            ? 'left'
            : event.clientX <= r.right && r.right - event.clientX < EDGE
              ? 'right'
              : null;
      setNear((current) => (current === side ? current : side));
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);

  const index = desks.findIndex((d) => d.id === activeDeskId);
  if (!atDesk || index < 0 || desks.length < 2) return null;

  const edge = (side: Side) => {
    const desk = desks[(index + (side === 'left' ? -1 : 1) + desks.length) % desks.length];
    if (!desk) return null;
    const name = deskName(product, desks, desk);
    const icon = product.workspaces.find((w) => w.id === desk.workspaceId)?.icon;
    return (
      <>
        <div className={styles.strip} data-side={side} onPointerEnter={() => setNear(side)} />
        <button
          type="button"
          className={styles.arrow}
          data-side={side}
          data-shown={near === side || undefined}
          aria-label={`${side === 'left' ? 'Previous' : 'Next'} desk: ${name}`}
          onClick={() => stepDesk(side === 'left' ? -1 : 1)}
        >
          <span className={styles.chevron} aria-hidden="true">
            {side === 'left' ? '‹' : '›'}
          </span>
          <span className={styles.name}>
            <WorkspaceIcon name={icon} size={12} className={styles.nameIcon} />
            {name}
          </span>
        </button>
      </>
    );
  };

  return (
    <div ref={area} className={styles.area} style={{ top, bottom }}>
      {edge('left')}
      {edge('right')}
    </div>
  );
}
