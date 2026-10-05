import { useEffect, useState } from 'react';
import { productList } from '@/catalog';
import { useConfiguratorStore, useProduct } from '@/state/configuratorStore';
import { DISPLAY_CURRENCIES, useCurrencyStore } from '@/state/currencyStore';
import { useDesksStore } from '@/state/desksStore';
import { shareSearch } from '@/state/shareLink';
import { Feedback } from './Feedback';
import { Layouts } from './Layouts';
import styles from './Header.module.css';

export function Header() {
  const product = useProduct();
  const resetToDefaults = useConfiguratorStore((state) => state.resetToDefaults);
  const selectProduct = useConfiguratorStore((state) => state.selectProduct);
  const desksMode = useDesksStore((s) => s.mode === 'desks');
  const enterDesks = useDesksStore((s) => s.enterDesks);
  const exitDesks = useDesksStore((s) => s.exitDesks);
  // A room of desks needs workspaces to tell the desks apart.
  const hasWorkspaces = product.workspaces.length > 1;
  const [copied, setCopied] = useState(false);
  const currency = useCurrencyStore((s) => s.currency);
  const rates = useCurrencyStore((s) => s.rates);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${shareSearch()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.title}>
        <span className={styles.eyebrow}>Configurator</span>
        {productList.length > 1 ? (
          <h1 className={styles.name}>
            <select
              className={styles.productSelect}
              value={product.id}
              aria-label="Product"
              onChange={(event) => selectProduct(event.target.value)}
            >
              {productList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </h1>
        ) : (
          <h1 className={styles.name}>{product.name}</h1>
        )}
      </div>
      <div className={styles.actions}>
        <Layouts />
        <Feedback />
        {hasWorkspaces && (
          <div className={styles.modes} role="radiogroup" aria-label="Desks">
            <button
              type="button"
              role="radio"
              aria-checked={!desksMode}
              className={styles.mode}
              onClick={exitDesks}
            >
              One desk
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={desksMode}
              className={styles.mode}
              onClick={enterDesks}
              title="A desk for every kind of work: finance, crypto, sports and more"
            >
              Unlimited desks
            </button>
          </div>
        )}
        {/* Virtual desks are free, so there are no prices to convert in the room. */}
        {!desksMode && (
          <select
            className={styles.currency}
            value={currency}
            aria-label="Currency"
            title="Show prices in"
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
          >
            {DISPLAY_CURRENCIES.map((c) => (
              <option
                key={c.code}
                value={c.code}
                // Labels stay the same while rates load: a select keeps the width of its longest.
                title={rates[c.code] === undefined ? `${c.label}: rate unavailable` : c.label}
                disabled={rates[c.code] === undefined}
              >
                {c.code}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={styles.button}
          onClick={resetToDefaults}
          title={desksMode ? "Reset this desk's setup" : undefined}
        >
          Reset
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => void copyShareLink()}
        >
          <span className={styles.long}>{copied ? 'Link copied' : 'Copy share link'}</span>
          <span className={styles.short}>{copied ? 'Copied' : 'Share'}</span>
        </button>
      </div>
    </header>
  );
}
