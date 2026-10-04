import type { MaterialGroup } from '@/catalog/schema';
import { usePriceFormat } from '../formatPrice';
import styles from './MaterialSwatches.module.css';

interface MaterialSwatchesProps {
  options: MaterialGroup['options'];
  selectedId: string;
  onSelect: (optionId: string) => void;
}

export function MaterialSwatches({ options, selectedId, onSelect }: MaterialSwatchesProps) {
  const format = usePriceFormat();
  return (
    <div className={styles.swatches} role="radiogroup">
      {options.map((option) => {
        const delta = format.delta(option.priceDelta);
        const title = delta ? `${option.label} (${delta})` : option.label;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === selectedId}
            aria-label={title}
            title={title}
            className={styles.swatch}
            data-metallic={(option.material?.metalness ?? 0) > 0.5 || undefined}
            onClick={() => onSelect(option.id)}
          >
            <span
              className={option.material ? styles.fill : `${styles.fill} ${styles.original}`}
              style={
                option.thumbnail
                  ? { backgroundImage: `url(${option.thumbnail})` }
                  : option.material && { backgroundColor: option.material.color }
              }
            />
          </button>
        );
      })}
    </div>
  );
}
