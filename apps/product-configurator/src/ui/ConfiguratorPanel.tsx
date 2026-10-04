import { useConfiguratorStore, useProduct, useSelections } from '@/state/configuratorStore';
import { selectedOption } from '@/state/derive';
import styles from './ConfiguratorPanel.module.css';
import { MotionControl } from './controls/MotionControl';
import { ModelCheck } from './ModelCheck';
import { OptionGroupControl } from './OptionGroupControl';
import { PriceSummary } from './PriceSummary';
import { usePriceFormat } from './formatPrice';

/**
 * Lists the product's motions (live demo controls), then every option group, followed by the
 * price summary.
 */
export function ConfiguratorPanel() {
  const product = useProduct();
  const selections = useSelections();
  const selectOption = useConfiguratorStore((state) => state.selectOption);
  const format = usePriceFormat();

  return (
    <div className={styles.panel}>
      <ModelCheck />
      {product.description && <p className={styles.description}>{product.description}</p>}

      {product.motions.map((motion) => (
        <section key={motion.id} className={styles.group} aria-labelledby={`motion-${motion.id}`}>
          <div className={styles.groupHeader}>
            <h2 id={`motion-${motion.id}`} className={styles.groupLabel}>
              {motion.label}
            </h2>
            <span className={styles.demoBadge}>Live demo</span>
          </div>
          {motion.description && <p className={styles.groupDescription}>{motion.description}</p>}
          <MotionControl motion={motion} />
        </section>
      ))}

      {product.optionGroups.map((group) => {
        const option = selectedOption(group, selections);
        const delta = format.delta(option.priceDelta);
        return (
          <section key={group.id} className={styles.group} aria-labelledby={`group-${group.id}`}>
            <div className={styles.groupHeader}>
              <h2 id={`group-${group.id}`} className={styles.groupLabel}>
                {group.label}
              </h2>
              <span className={styles.selected}>
                {option.label}
                {delta && <span className={styles.delta}> {delta}</span>}
              </span>
            </div>
            {group.description && <p className={styles.groupDescription}>{group.description}</p>}
            <OptionGroupControl
              group={group}
              selectedOptionId={option.id}
              onSelect={(optionId) => selectOption(group.id, optionId)}
            />
          </section>
        );
      })}

      <PriceSummary />
    </div>
  );
}
