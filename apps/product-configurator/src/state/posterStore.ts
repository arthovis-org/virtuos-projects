/**
 * The posters of unlimited desks mode: what the screens of the desks the visitor is not at
 * show (the desk's workspace and its windows, without loading the sites). Published by the
 * viewer per desk, drawn by the screen layer.
 */
import { create } from 'zustand';
import type { Screen } from '@/catalog/schema';

export interface PosterSurfaceInfo {
  /** Id of the DOM surface and its display frame (`<desk>/<screen>`). */
  id: string;
  deskId: string;
  screen: Screen;
  widthPx: number;
  heightPx: number;
}

interface PosterState {
  posters: Readonly<Record<string, readonly PosterSurfaceInfo[]>>;
  setPosters: (deskId: string, posters: readonly PosterSurfaceInfo[]) => void;
  clearPosters: (deskId: string) => void;
}

export const posterId = (deskId: string, screenId: string) => `${deskId}/${screenId}`;

export const usePosterStore = create<PosterState>()((set) => ({
  posters: {},
  setPosters: (deskId, posters) =>
    set((state) => ({ posters: { ...state.posters, [deskId]: posters } })),
  clearPosters: (deskId) =>
    set((state) => ({
      posters: Object.fromEntries(Object.entries(state.posters).filter(([id]) => id !== deskId)),
    })),
}));
