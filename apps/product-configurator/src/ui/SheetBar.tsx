import { useProduct, useResolvedConfiguration } from '@/state/configuratorStore';
import { activeDesk, deskName, useDesksStore } from '@/state/desksStore';
import { usePriceFormat } from './formatPrice';
import styles from './SheetBar.module.css';

interface SheetBarProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * On a phone, the option panel is a bottom sheet: this bar is all of it until tapped, so the
 * desk keeps the screen. It says what the panel is for: this desk and its price, or in the
 * room the desk the visitor is at. Hidden on wider screens, where the panel is a column.
 */
export function SheetBar({ open, onToggle }: SheetBarProps) {
  const product = useProduct();
  const { totalPrice } = useResolvedConfiguration();
  const format = usePriceFormat();
  const desksMode = useDesksStore((s) => s.mode === 'desks');
  const desks = useDesksStore((s) => s.desks);
  const desk = useDesksStore(activeDesk);
  const workspace = product.workspaces.find((w) => w.id === desk?.workspaceId);

  const title = !desksMode
    ? product.name
    : desk
      ? `${workspace?.icon ?? ''} Desk ${desks.indexOf(desk) + 1} · ${deskName(product, desks, desk)}`
      : 'Pick a desk';
  // Desks in the room are virtual: no price.
  const detail = desksMode ? '' : format.price(totalPrice);

  return (
    <button type="button" className={styles.bar} aria-expanded={open} onClick={onToggle}>
      <span className={styles.handle} aria-hidden="true" />
      <span className={styles.row}>
        <span className={styles.title}>
          {title}
          {detail && <span className={styles.detail}> · {detail}</span>}
        </span>
        <span className={styles.action}>{open ? 'Done ▾' : 'Customise ▴'}</span>
      </span>
    </button>
  );
}
