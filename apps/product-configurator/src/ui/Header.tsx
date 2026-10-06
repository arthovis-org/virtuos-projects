import { publicPageUrl } from '@/desktop';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { productList } from '@/catalog';
import { enterRoom, exitRoom, goHome } from '@/state/actions';
import { useProduct, useSetupStore } from '@/state/setupStore';
import { DISPLAY_CURRENCIES, useCurrencyStore } from '@/state/currencyStore';
import { shareSearch } from '@/state/shareLink';
import { CommandSheet } from './CommandSheet';
import { Layouts } from './Layouts';
import styles from './Header.module.css';

export function Header() {
  const product = useProduct();
  const resetSelections = useSetupStore((state) => state.resetSelections);
  const selectProduct = useSetupStore((state) => state.selectProduct);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  // A room of desks needs workspaces to tell the desks apart.
  const hasWorkspaces = product.workspaces.length > 1;
  const [copied, setCopied] = useState(false);
  const homeTitle = desksMode ? 'Home: every desk' : 'Home';
  const currency = useCurrencyStore((s) => s.currency);
  const rates = useCurrencyStore((s) => s.rates);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyShareLink = async () => {
    const url = `${publicPageUrl()}${shareSearch()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <header className={styles.header}>
      {productList.length > 1 ? (
        <div className={styles.title}>
          {/* The product menu is the name: "Configurator" alone leads home. */}
          <button
            type="button"
            className={`${styles.home} ${styles.eyebrow}`}
            onClick={goHome}
            title={homeTitle}
          >
            Configurator
          </button>
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
        </div>
      ) : (
        <h1 className={styles.heading}>
          {/* The title leads home, as a site's logo does. */}
          <button
            type="button"
            className={`${styles.title} ${styles.home}`}
            onClick={goHome}
            title={homeTitle}
          >
            <span className={styles.eyebrow}>Configurator</span>
            <span className={styles.name}>{product.name}</span>
          </button>
        </h1>
      )}
      <div className={styles.actions}>
        <CommandSheet />
        <Layouts />
        {hasWorkspaces && (
          <div className={styles.modes} role="radiogroup" aria-label="Desks">
            <button
              type="button"
              role="radio"
              aria-checked={!desksMode}
              className={styles.mode}
              onClick={exitRoom}
            >
              One desk
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={desksMode}
              className={styles.mode}
              onClick={enterRoom}
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
          onClick={resetSelections}
          title={desksMode ? "Reset this desk's setup" : 'Reset'}
          aria-label="Reset"
        >
          <RotateCcw className={styles.short} size={14} aria-hidden="true" />
          <span className={styles.long}>Reset</span>
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
