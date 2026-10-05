import { useProduct } from '@/state/setupStore';
import { useCurrencyStore, type DisplayCurrency } from '@/state/currencyStore';

const formatters = new Map<string, Intl.NumberFormat>();

/** Symbols for currencies `Intl` doesn't know. */
const CRYPTO_SYMBOLS: Record<string, string> = { BTC: '₿', ETH: 'Ξ' };

function formatter(currency: string): Intl.NumberFormat {
  let format = formatters.get(currency);
  if (!format) {
    format =
      currency in CRYPTO_SYMBOLS
        ? // A desk costs a small fraction of a coin: significant digits, not decimals.
          new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 })
        : new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
          });
    formatters.set(currency, format);
  }
  return format;
}

export function formatPrice(amount: number, currency: string): string {
  const text = formatter(currency).format(amount);
  const symbol = CRYPTO_SYMBOLS[currency];
  return symbol ? `${symbol}${text}` : text;
}

/** `+€120` / `−€60`, or an empty string for zero. */
export function formatPriceDelta(delta: number, currency: string): string {
  if (delta === 0) return '';
  return `${delta > 0 ? '+' : '−'}${formatPrice(Math.abs(delta), currency)}`;
}

/**
 * Formats the product's prices in the currency the visitor picked, converted at the current
 * rate. Without a rate for either currency, prices stay in the product's own currency.
 */
export function usePriceFormat() {
  const { currency: base } = useProduct();
  const wanted = useCurrencyStore((s) => s.currency);
  const from = useCurrencyStore((s) => s.rates[base as DisplayCurrency]);
  const to = useCurrencyStore((s) => s.rates[wanted]);
  const converted = from !== undefined && to !== undefined && wanted !== base;
  const currency = converted ? wanted : base;
  const factor = converted ? to / from : 1;
  return {
    currency,
    /** Shown in another currency than the product is priced in. */
    converted,
    price: (amount: number) => formatPrice(amount * factor, currency),
    delta: (amount: number) => formatPriceDelta(amount * factor, currency),
  };
}
