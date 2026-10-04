import { useProduct, useResolvedConfiguration } from '@/state/configuratorStore';
import { useCurrencyStore } from '@/state/currencyStore';
import { usePriceFormat } from './formatPrice';
import styles from './PriceSummary.module.css';

export function PriceSummary() {
  const { basePrice, currency } = useProduct();
  const format = usePriceFormat();
  const live = useCurrencyStore((s) => s.live);
  const { priceLines, totalPrice } = useResolvedConfiguration();

  return (
    <section className={styles.summary} aria-label="Price summary">
      <dl className={styles.lines}>
        <div className={styles.line}>
          <dt>Base price</dt>
          <dd>{format.price(basePrice)}</dd>
        </div>
        {priceLines.map((line) => (
          <div key={line.groupId} className={styles.line}>
            <dt>
              {line.groupLabel} <span className={styles.muted}>· {line.optionLabel}</span>
            </dt>
            <dd>{format.delta(line.priceDelta)}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.total}>
        <span>Total</span>
        <span className={styles.amount} data-testid="total-price">
          {format.price(totalPrice)}
        </span>
      </div>
      {format.converted && (
        <p className={styles.note}>
          {live ? 'Converted' : 'Roughly converted'} from {currency}
          {live ? " at today's rate" : ' (live rates unavailable)'}; you pay in {currency}.
        </p>
      )}
    </section>
  );
}
