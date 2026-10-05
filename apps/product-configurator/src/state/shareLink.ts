/**
 * The query string that reproduces what the visitor sees: the configuration, or in unlimited
 * desks mode every desk with its workspace and configuration.
 */
import { useConfiguratorStore } from './configuratorStore';
import { encodeDesks, useDesksStore } from './desksStore';
import { encodeConfigSearch } from './urlState';

export function shareSearch(): string {
  const { productId, selections } = useConfiguratorStore.getState();
  const desks = useDesksStore.getState();
  return desks.mode === 'desks'
    ? `${encodeConfigSearch(productId, {})}${encodeDesks(desks)}`
    : encodeConfigSearch(productId, selections);
}

/** Keeps the address bar on `shareSearch()`, so it is always a shareable link. */
export function syncAddressBar(): () => void {
  const update = () => {
    const search = shareSearch();
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}`);
    }
  };
  const stops = [useConfiguratorStore.subscribe(update), useDesksStore.subscribe(update)];
  return () => stops.forEach((stop) => stop());
}
