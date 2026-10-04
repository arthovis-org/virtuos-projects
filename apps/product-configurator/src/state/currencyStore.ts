/**
 * The currency prices are shown in. Products are priced in one currency (product.json); the
 * visitor can view them converted into another at the current rate. The choice is kept per
 * browser, not in share links.
 */
import { create } from 'zustand';

export const DISPLAY_CURRENCIES = [
  { code: 'USD', label: 'US dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'COP', label: 'Colombian peso' },
  { code: 'BTC', label: 'Bitcoin' },
  { code: 'ETH', label: 'Ether' },
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]['code'];

/** Units of each currency per US dollar. */
export type Rates = Partial<Record<DisplayCurrency, number>>;

/**
 * Used until live rates arrive, or if they can't be fetched: rough fiat rates only. Crypto
 * moves too much to guess, so it stays unavailable without live rates.
 */
const FALLBACK_RATES: Rates = { USD: 1, EUR: 0.88, COP: 3370 };

const STORAGE_KEY = 'configurator.currency';
/** Coinbase's public rates: every currency per US dollar, readable from any site. */
const RATES_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';

interface CurrencyState {
  currency: DisplayCurrency;
  rates: Rates;
  /** Whether `rates` are today's (fetched) or the rough fallback. */
  live: boolean;
  setCurrency: (currency: DisplayCurrency) => void;
}

function storedCurrency(): DisplayCurrency {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return DISPLAY_CURRENCIES.find((c) => c.code === stored)?.code ?? 'USD';
  } catch {
    return 'USD';
  }
}

export const useCurrencyStore = create<CurrencyState>()((set) => ({
  currency: storedCurrency(),
  rates: FALLBACK_RATES,
  live: false,
  setCurrency: (currency) => {
    set({ currency });
    try {
      window.localStorage.setItem(STORAGE_KEY, currency);
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
  },
}));

/** Fetches today's rates once. */
async function loadRates() {
  try {
    const response = await fetch(RATES_URL);
    if (!response.ok) return;
    const body = (await response.json()) as { data?: { rates?: Record<string, string> } };
    const rates: Rates = {};
    for (const { code } of DISPLAY_CURRENCIES) {
      const rate = Number(body.data?.rates?.[code]);
      if (rate > 0) rates[code] = rate;
    }
    if (Object.keys(rates).length === DISPLAY_CURRENCIES.length) {
      useCurrencyStore.setState({ rates, live: true });
    }
  } catch {
    // Offline or blocked: the fallback rates stay.
  }
}
void loadRates();
