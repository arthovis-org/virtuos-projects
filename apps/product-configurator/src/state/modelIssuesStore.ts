/**
 * Problems found while matching a product definition against its loaded model: node or
 * anchor names the definition expects but the glTF does not contain. The viewer reports
 * them; in development the panel lists them so a renamed Blender object is obvious.
 */
import { create } from 'zustand';

interface ModelIssuesState {
  byProduct: Readonly<Record<string, readonly string[]>>;
  report: (productId: string, issues: readonly string[]) => void;
}

export const useModelIssuesStore = create<ModelIssuesState>()((set) => ({
  byProduct: {},
  report: (productId, issues) => {
    for (const issue of issues) console.warn(`[configurator] ${productId}: ${issue}`);
    set((state) => ({ byProduct: { ...state.byProduct, [productId]: issues } }));
  },
}));
