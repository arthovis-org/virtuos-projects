/**
 * Saved layouts in the page: the list this browser saved (mirrored in local storage) and the
 * layout open now, if any, so it can be saved again under the same link.
 */
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import { loadSetup } from '@/state/actions';
import { currentSetup } from '@/state/setupStore';
import { layoutFromSetup, setupFromLayout } from './layoutData';
import {
  createLayout,
  deleteLayout,
  fetchLayout,
  readMyLayouts,
  updateLayout,
  writeMyLayouts,
  type MyLayout,
} from './layoutsApi';

interface LayoutsState {
  mine: readonly MyLayout[];
  /** The layout open now (saved or opened from a link), or null. */
  current: { id: string; name: string } | null;
  /** A layout being opened from a link, for the page to say so. */
  opening: boolean;
  /** Saves the set-up as a new layout; returns its id. */
  saveNew: (name: string) => Promise<string>;
  /** Saves the set-up into the open layout (only one this browser saved). */
  saveCurrent: () => Promise<void>;
  open: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const product = () => getProduct(currentSetup().productId);
const productId = () => product().id;
/** The set-up as it is now, as a layout. */
const captureLayout = () => layoutFromSetup(product(), currentSetup());

export const useLayoutsStore = create<LayoutsState>()((set, get) => {
  const remember = (layouts: MyLayout[]) => {
    const sorted = [...layouts].sort((a, b) => b.updatedAt - a.updatedAt);
    writeMyLayouts(sorted);
    set({ mine: sorted });
  };
  const keyOf = (id: string) => get().mine.find((l) => l.id === id)?.key;

  return {
    mine: readMyLayouts(),
    current: null,
    opening: false,

    saveNew: async (name) => {
      const { id, key, updatedAt } = await createLayout(name, productId(), captureLayout());
      remember([...get().mine.filter((l) => l.id !== id), { id, name, key, updatedAt }]);
      set({ current: { id, name } });
      return id;
    },

    saveCurrent: async () => {
      const current = get().current;
      const key = current && keyOf(current.id);
      if (!current || !key) throw new Error('Save it as a new layout instead');
      const { updatedAt } = await updateLayout(current.id, key, { data: captureLayout() });
      remember(get().mine.map((l) => (l.id === current.id ? { ...l, updatedAt } : l)));
    },

    open: async (id) => {
      set({ opening: true });
      try {
        const layout = await fetchLayout(id);
        if (layout.product !== productId()) throw new Error('This layout is for another product');
        loadSetup(setupFromLayout(product(), layout.data));
        set({ current: { id: layout.id, name: layout.name } });
        // Keep this browser's list in step with the saved name.
        if (keyOf(id)) {
          remember(get().mine.map((l) => (l.id === id ? { ...l, name: layout.name } : l)));
        }
      } finally {
        set({ opening: false });
      }
    },

    rename: async (id, name) => {
      const key = keyOf(id);
      if (!key) throw new Error('Only layouts saved in this browser can be renamed');
      const { updatedAt } = await updateLayout(id, key, { name });
      remember(get().mine.map((l) => (l.id === id ? { ...l, name, updatedAt } : l)));
      if (get().current?.id === id) set({ current: { id, name } });
    },

    remove: async (id) => {
      const key = keyOf(id);
      if (!key) throw new Error('Only layouts saved in this browser can be deleted');
      await deleteLayout(id, key).catch((error: unknown) => {
        // Already gone online: just forget it here.
        if (!(error instanceof Error) || !error.message.includes('does not exist')) throw error;
      });
      remember(get().mine.filter((l) => l.id !== id));
      if (get().current?.id === id) set({ current: null });
    },
  };
});
