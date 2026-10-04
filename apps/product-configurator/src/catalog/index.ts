/**
 * Catalog registry. Products come from the `products/` folder through the `catalog` Vite
 * plugin (`virtual:catalog`); each is validated here. A product that fails validation is
 * left out and its problem reported, so one broken folder never takes down the others.
 */
import { issues as folderIssues, products as derived } from 'virtual:catalog';
import { parseProductDefinition, type ProductDefinition } from './schema';

const issues: Record<string, string[]> = Object.fromEntries(
  Object.entries(folderIssues).map(([id, list]) => [id, [...list]]),
);
const parsed: ProductDefinition[] = [];
for (const input of derived) {
  const result = parseProductDefinition(input);
  if (result.product) {
    parsed.push(result.product);
  } else {
    const id = (input as { id?: string }).id ?? '?';
    (issues[id] ??= []).push(`could not build the configurator: ${result.error}`);
  }
}

/** Problems per product id (folder name), for the setup check in development. */
export const catalogIssues: Readonly<Record<string, readonly string[]>> = issues;

export const products: Readonly<Record<string, ProductDefinition>> = Object.fromEntries(
  parsed.map((product) => [product.id, product]),
);

/** Products in switcher order; the first one is shown when the URL names none. */
export const productList: readonly ProductDefinition[] = [...parsed].sort(
  (a, b) => a.order - b.order || a.name.localeCompare(b.name),
);

/** The requested product, else the first; only call when `productList` is not empty. */
export function getProduct(productId: string | null | undefined): ProductDefinition {
  const fallback = productList[0];
  if (!fallback) throw new Error('No products are registered.');
  return (productId ? products[productId] : undefined) ?? fallback;
}
