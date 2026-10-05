/**
 * State for motions (live controls such as desk height). Kept apart from the configurator
 * store on purpose: motions are not part of the configuration, never go into the URL, and
 * `current` changes every animation frame.
 *
 * Values are kept per desk (see `motionKey`): in unlimited desks mode every desk has its own
 * height, and the controls move the desk the visitor is at.
 */
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import type { Motion, ProductDefinition } from '@/catalog/schema';
import { useConfiguratorStore } from './configuratorStore';

/** The single desk; unlimited desks mode uses each desk's id. */
export const SINGLE_DESK_KEY = '';

/** Where a desk's value for a motion is kept. */
export const motionKey = (deskKey: string, motionId: string) =>
  deskKey === SINGLE_DESK_KEY ? motionId : `${deskKey}/${motionId}`;

interface MotionState {
  /** Product the values belong to; values reset when it changes. */
  productId: string | null;
  /** Desk the controls move. */
  deskKey: string;
  /** Where each motion is heading, by `motionKey`. */
  targets: Readonly<Record<string, number>>;
  /** Where each motion is now, by `motionKey`, written by the viewer while it animates. */
  current: Readonly<Record<string, number>>;
  /** The visitor is on the controls (pointer or keyboard): the side view shows. */
  peek: boolean;
  /** The side view of the desk is on show (while it moves, and a moment after). */
  insetOpen: boolean;

  resetFor: (product: ProductDefinition) => void;
  setDesk: (deskKey: string) => void;
  setPeek: (peek: boolean) => void;
  setInsetOpen: (open: boolean) => void;
  /** Gives desk `to` the values of desk `from` (the single desk becoming the first of a room). */
  copyDesk: (from: string, to: string) => void;
  /** Moves the active desk. */
  setTarget: (motion: Motion, value: number) => void;
  /** Stops the active desk's motion where it is, e.g. when a hold-to-move button is released. */
  stop: (motionId: string) => void;
  setCurrent: (key: string, value: number) => void;
  /** Sets where a motion starts once the viewer knows it; ignored if already set. */
  start: (key: string, value: number) => void;
}

const clamp = (motion: Motion, value: number) => Math.min(motion.max, Math.max(motion.min, value));

export const useMotionStore = create<MotionState>()((set, get) => ({
  productId: null,
  deskKey: SINGLE_DESK_KEY,
  targets: {},
  current: {},
  peek: false,
  insetOpen: false,

  resetFor: (product) => {
    if (get().productId === product.id) return;
    // Motions without `initial` start at the exported height, which only the viewer can
    // measure; it fills them in through `start`.
    const initial = Object.fromEntries(
      product.motions.flatMap((m) => (m.initial === undefined ? [] : [[m.id, m.initial]])),
    );
    set({ productId: product.id, deskKey: SINGLE_DESK_KEY, targets: initial, current: initial });
  },

  setDesk: (deskKey) => set({ deskKey }),
  setPeek: (peek) => set({ peek }),
  setInsetOpen: (insetOpen) => set({ insetOpen }),

  copyDesk: (from, to) => {
    const { productId, current, targets } = get();
    // A desk that is still moving arrives where it was heading: both take the target.
    const nextCurrent = { ...current };
    const nextTargets = { ...targets };
    for (const motion of getProduct(productId).motions) {
      const value = targets[motionKey(from, motion.id)];
      if (value === undefined) continue;
      nextCurrent[motionKey(to, motion.id)] = value;
      nextTargets[motionKey(to, motion.id)] = value;
    }
    set({ current: nextCurrent, targets: nextTargets });
  },

  setTarget: (motion, value) => {
    const key = motionKey(get().deskKey, motion.id);
    set((state) => ({ targets: { ...state.targets, [key]: clamp(motion, value) } }));
  },

  stop: (motionId) => {
    const key = motionKey(get().deskKey, motionId);
    const current = get().current[key];
    if (current === undefined) return;
    set((state) => ({ targets: { ...state.targets, [key]: current } }));
  },

  setCurrent: (key, value) => {
    set((state) => ({ current: { ...state.current, [key]: value } }));
  },

  start: (key, value) => {
    const { current, targets } = get();
    if (current[key] !== undefined && targets[key] !== undefined) return;
    set({
      current: { ...current, [key]: current[key] ?? value },
      targets: { ...targets, [key]: targets[key] ?? value },
    });
  },
}));

// Follow the configurator's product: start at the initial values, reset on every switch.
const syncProduct = () => {
  useMotionStore.getState().resetFor(getProduct(useConfiguratorStore.getState().productId));
};
syncProduct();
useConfiguratorStore.subscribe(syncProduct);
