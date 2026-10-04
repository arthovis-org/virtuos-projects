import styles from './SegmentedControl.module.css';

export interface SegmentedItem {
  id: string;
  label: string;
  /** Small secondary text, e.g. a price delta. */
  hint?: string;
}

interface SegmentedControlProps {
  items: SegmentedItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function SegmentedControl({ items, selectedId, onSelect }: SegmentedControlProps) {
  return (
    <div className={styles.control} role="radiogroup">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={item.id === selectedId}
          className={styles.item}
          onClick={() => onSelect(item.id)}
        >
          <span className={styles.label}>{item.label}</span>
          {item.hint && <span className={styles.hint}>{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
