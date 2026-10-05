import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { getProduct } from '@/catalog';
import type { ProductDefinition } from '@/catalog/schema';
import {
  defaultSelections,
  resolveConfiguration,
  sanitizeSelections,
  type ResolvedConfiguration,
  type Selections,
} from './derive';
import { decodeConfigSearch, encodeConfigSearch } from './urlState';

interface ConfiguratorState {
  productId: string;
  selections: Selections;

  /** Switches product and resets selections to that product's defaults. */
  selectProduct: (productId: string) => void;
  selectOption: (groupId: string, optionId: string) => void;
  /** Replaces every selection at once, e.g. when the visitor moves to another desk. */
  setSelections: (selections: Selections) => void;
  resetToDefaults: () => void;
  /** Query string (`?product=…&c=…`) describing the current configuration. */
  serialize: () => string;
  /** Restores a configuration from a query string; unknown values fall back to defaults. */
  hydrate: (search: string) => void;
}

function stateFromSearch(search: string): Pick<ConfiguratorState, 'productId' | 'selections'> {
  const decoded = decodeConfigSearch(search);
  const product = getProduct(decoded.productId);
  return { productId: product.id, selections: sanitizeSelections(product, decoded.selections) };
}

export const useConfiguratorStore = create<ConfiguratorState>()((set, get) => ({
  // Start from the URL so the first render already loads the linked product, not the default.
  ...stateFromSearch(window.location.search),

  selectProduct: (productId) => {
    const product = getProduct(productId);
    set({ productId: product.id, selections: defaultSelections(product) });
  },

  selectOption: (groupId, optionId) => {
    const product = getProduct(get().productId);
    set((state) => ({
      selections: sanitizeSelections(product, { ...state.selections, [groupId]: optionId }),
    }));
  },

  setSelections: (selections) => {
    set({ selections: sanitizeSelections(getProduct(get().productId), selections) });
  },

  resetToDefaults: () => {
    set({ selections: defaultSelections(getProduct(get().productId)) });
  },

  serialize: () => {
    const { productId, selections } = get();
    return encodeConfigSearch(productId, selections);
  },

  hydrate: (search) => {
    set(stateFromSearch(search));
  },
}));

export function useProduct(): ProductDefinition {
  return useConfiguratorStore((state) => getProduct(state.productId));
}

export function useSelections(): Selections {
  return useConfiguratorStore(useShallow((state) => state.selections));
}

/** Memoised resolution of the current selections into node-level instructions. */
export function useResolvedConfiguration(): ResolvedConfiguration {
  const product = useProduct();
  const selections = useSelections();
  return useMemo(() => resolveConfiguration(product, selections), [product, selections]);
}
