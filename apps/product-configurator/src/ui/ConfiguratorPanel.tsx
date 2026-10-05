import type { CSSProperties } from 'react';
import { useConfiguratorStore, useProduct, useSelections } from '@/state/configuratorStore';
import { selectedOption } from '@/state/derive';
import { activeDesk, deskName, useDesksStore } from '@/state/desksStore';
import styles from './ConfiguratorPanel.module.css';
import { MotionControl } from './controls/MotionControl';
import { ModelCheck } from './ModelCheck';
import { OptionGroupControl } from './OptionGroupControl';
import { PriceSummary } from './PriceSummary';
import { usePriceFormat } from './formatPrice';

/**
 * Lists the product's motions (live demo controls), then every option group, followed by the
 * price summary. In unlimited desks mode it configures the desk the visitor is at, without
 * prices: the desks are virtual.
 */
export function ConfiguratorPanel() {
  const product = useProduct();
  const selections = useSelections();
  const selectOption = useConfiguratorStore((state) => state.selectOption);
  const format = usePriceFormat();
  const desks = useDesksStore((s) => s.desks);
  const desk = useDesksStore((s) => (s.mode === 'desks' ? activeDesk(s) : undefined));
  const workspace = product.workspaces.find((w) => w.id === desk?.workspaceId);
  const desksMode = useDesksStore((s) => s.mode === 'desks');

  // The room with no desk chosen: nothing to configure yet.
  if (desksMode && !desk) {
    return (
      <div className={styles.panel}>
        <section className={styles.pick} aria-label="Desk">
          <h2 className={styles.deskName}>Pick a desk to set it up</h2>
          <p className={styles.deskNote}>
            Tap a desk, its name or a button in the desk bar. Every desk has its own setup and
            height; drag one desk onto another to swap them.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <ModelCheck />
      {desk ? (
        <section
          className={styles.desk}
          style={{ '--desk-accent': workspace?.accent ?? 'var(--text-muted)' } as CSSProperties}
          aria-label="Desk"
        >
          <span className={styles.deskIcon} aria-hidden="true">
            {workspace?.icon ?? '🖥️'}
          </span>
          <div>
            <h2 className={styles.deskName}>
              Desk {desks.indexOf(desk) + 1} · {deskName(product, desks, desk)}
            </h2>
            <p className={styles.deskNote}>
              Every desk has its own setup. Virtual desks are free, so add as many as you like.
            </p>
          </div>
        </section>
      ) : (
        product.description && <p className={styles.description}>{product.description}</p>
      )}

      {product.motions.map((motion) => (
        <section key={motion.id} className={styles.group} aria-labelledby={`motion-${motion.id}`}>
          <div className={styles.groupHeader}>
            <h2 id={`motion-${motion.id}`} className={styles.groupLabel}>
              {motion.label}
            </h2>
            <span className={styles.demoBadge}>{desk ? 'This desk' : 'Live demo'}</span>
          </div>
          {motion.description && <p className={styles.groupDescription}>{motion.description}</p>}
          <MotionControl motion={motion} />
        </section>
      ))}

      {product.optionGroups.map((group) => {
        const option = selectedOption(group, selections);
        const delta = desk ? '' : format.delta(option.priceDelta);
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
              hidePrices={Boolean(desk)}
            />
          </section>
        );
      })}

      {!desk && <PriceSummary />}
    </div>
  );
}
