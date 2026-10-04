/**
 * Query-string encoding of a configuration so it can be shared as a link:
 * `?product=<id>&c=<group>:<option>,<group>:<option>`
 */
import type { Selections } from './derive';

const PRODUCT_PARAM = 'product';
const CONFIG_PARAM = 'c';

export function encodeConfigSearch(productId: string, selections: Selections): string {
  // Built by hand rather than with URLSearchParams, which escapes `:` and `,` and turns a
  // shared link into `%3A`/`%2C` soup. Ids are lowercase letters, digits and dashes, so
  // encodeURIComponent leaves them readable; only the separators are literal.
  const pairs = Object.entries(selections).map(
    ([groupId, optionId]) => `${encodeURIComponent(groupId)}:${encodeURIComponent(optionId)}`,
  );
  const config = pairs.length > 0 ? `&${CONFIG_PARAM}=${pairs.join(',')}` : '';
  return `?${PRODUCT_PARAM}=${encodeURIComponent(productId)}${config}`;
}

export function decodeConfigSearch(search: string): {
  productId: string | null;
  selections: Selections;
} {
  const params = new URLSearchParams(search);
  const selections: Record<string, string> = {};
  for (const pair of (params.get(CONFIG_PARAM) ?? '').split(',')) {
    const [groupId, optionId] = pair.split(':');
    if (groupId && optionId) selections[groupId] = optionId;
  }
  return { productId: params.get(PRODUCT_PARAM), selections };
}
