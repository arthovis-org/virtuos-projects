/**
 * Motions (desk height) as they animate. Where each desk's motion is set to is part of the
 * set-up (`DeskSetup.motions`); this store holds where it is right now, which the viewer
 * writes every animation frame, and the height control's side view. Never saved.
 */
import { create } from 'zustand';
import { useSetupStore } from './setupStore';

/** Where a desk's motion value is kept in `current`. */
export const motionKey = (deskId: string, motionId: string) => `${deskId}/${motionId}`;

interface MotionState {
  /** Where each desk's motion is now, by `motionKey`. */
  current: Readonly<Record<string, number>>;
  /** The visitor is on the controls (pointer or keyboard): the side view shows. */
  peek: boolean;
  /** The side view of the desk is on show (while it moves, and a moment after). */
  insetOpen: boolean;
  setCurrent: (key: string, value: number) => void;
  setPeek: (peek: boolean) => void;
  setInsetOpen: (open: boolean) => void;
}

export const useMotionStore = create<MotionState>()((set) => ({
  current: {},
  peek: false,
  insetOpen: false,
  setCurrent: (key, value) => set((state) => ({ current: { ...state.current, [key]: value } })),
  setPeek: (peek) => set({ peek }),
  setInsetOpen: (insetOpen) => set({ insetOpen }),
}));

// Values belong to the product's desks: a new product starts afresh.
useSetupStore.subscribe((state, previous) => {
  if (state.productId !== previous.productId) useMotionStore.setState({ current: {} });
});
