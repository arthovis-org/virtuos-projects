/**
 * State for motions (live controls such as desk height). Kept apart from the configurator
 * store on purpose: motions are not part of the configuration, never go into the URL, and
 * `current` changes every animation frame.
 */
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import type { Motion, ProductDefinition } from '@/catalog/schema';
import { useConfiguratorStore } from './configuratorStore';

interface MotionState {
  /** Product the values belong to; values reset when it changes. */
  productId: string | null;
  /** Where each motion is heading. */
  targets: Readonly<Record<string, number>>;
  /** Where each motion is now, written by the viewer while it animates. */
  current: Readonly<Record<string, number>>;

  resetFor: (product: ProductDefinition) => void;
  setTarget: (motion: Motion, value: number) => void;
  /** Stops a motion where it is, e.g. when a hold-to-move button is released. */
  stop: (motionId: string) => void;
  setCurrent: (motionId: string, value: number) => void;
  /** Sets where a motion starts once the viewer knows it; ignored if already set. */
  start: (motionId: string, value: number) => void;
}

const clamp = (motion: Motion, value: number) => Math.min(motion.max, Math.max(motion.min, value));

export const useMotionStore = create<MotionState>()((set, get) => ({
  productId: null,
  targets: {},
  current: {},

  resetFor: (product) => {
    if (get().productId === product.id) return;
    // Motions without `initial` start at the exported height, which only the viewer can
    // measure; it fills them in through `start`.
    const initial = Object.fromEntries(
      product.motions.flatMap((m) => (m.initial === undefined ? [] : [[m.id, m.initial]])),
    );
    set({ productId: product.id, targets: initial, current: initial });
  },

  setTarget: (motion, value) => {
    set((state) => ({ targets: { ...state.targets, [motion.id]: clamp(motion, value) } }));
  },

  stop: (motionId) => {
    const current = get().current[motionId];
    if (current === undefined) return;
    set((state) => ({ targets: { ...state.targets, [motionId]: current } }));
  },

  setCurrent: (motionId, value) => {
    set((state) => ({ current: { ...state.current, [motionId]: value } }));
  },

  start: (motionId, value) => {
    const { current, targets } = get();
    if (current[motionId] !== undefined && targets[motionId] !== undefined) return;
    set({
      current: { ...current, [motionId]: current[motionId] ?? value },
      targets: { ...targets, [motionId]: targets[motionId] ?? value },
    });
  },
}));

// Follow the configurator's product: start at the initial values, reset on every switch.
const syncProduct = () => {
  useMotionStore.getState().resetFor(getProduct(useConfiguratorStore.getState().productId));
};
syncProduct();
useConfiguratorStore.subscribe(syncProduct);
