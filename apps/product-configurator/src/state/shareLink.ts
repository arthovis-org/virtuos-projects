/**
 * The query string that reproduces what the visitor sees (see `setupUrl.ts`), kept in the
 * address bar so the page's URL is always a shareable link.
 */
import { getProduct } from '@/catalog';
import { currentSetup, useSetupStore } from './setupStore';
import { encodeSetupSearch } from './setupUrl';

export function shareSearch(): string {
  const setup = currentSetup();
  return encodeSetupSearch(getProduct(setup.productId), setup);
}

/** Keeps the address bar on `shareSearch()`, so it is always a shareable link. */
export function syncAddressBar(): () => void {
  return useSetupStore.subscribe(() => {
    const search = shareSearch();
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}`);
    }
  });
}
