import { useGLTF } from '@react-three/drei';
import type { Object3D } from 'three';
import { getProduct } from '@/catalog';
import { useConfiguratorStore } from '@/state/configuratorStore';
import { indexNodes } from './nodeUtils';

/**
 * Every glTF goes through these functions so the loader setup lives in one place. Models are
 * loaded exactly as exported. Draco- or meshopt-compressed exports work too: the meshopt
 * decoder ships with three, and drei fetches the Draco decoder only if a file needs it.
 */
const USE_DRACO = true;
const USE_MESHOPT = true;

export function useModel(src: string) {
  return useGLTF(src, USE_DRACO, USE_MESHOPT);
}

export function preloadModel(src: string) {
  useGLTF.preload(src, USE_DRACO, USE_MESHOPT);
}

/**
 * Starts downloading the current product's model whenever the product changes, outside
 * React rendering, so the download begins as soon as the viewer code has loaded.
 * Returns the unsubscribe function.
 */
export function preloadCurrentProduct(): () => void {
  const preload = ({ productId }: { productId: string }) => {
    preloadModel(getProduct(productId).model.src);
  };
  preload(useConfiguratorStore.getState());
  return useConfiguratorStore.subscribe(preload);
}

/**
 * Untouched copies of loaded scenes, taken before the configurator changes anything on them
 * (visibility, finishes, desk height), so every desk of unlimited desks mode starts from the
 * model as exported.
 */
const pristine = new WeakMap<Object3D, Object3D>();
const deskModels = new WeakMap<Object3D, Map<string, DeskModel>>();

export interface DeskModel {
  scene: Object3D;
  index: ReadonlyMap<string, Object3D>;
}

/** Call while rendering, before anything has changed the scene (effects run later). */
export function rememberPristine(scene: Object3D) {
  if (!pristine.has(scene)) pristine.set(scene, scene.clone(true));
}

/**
 * The model of one desk: the loaded scene itself for the single desk, else a copy of it per
 * desk (sharing geometry and materials), kept for as long as the desk exists.
 */
export function deskModel(scene: Object3D, deskId: string | null): DeskModel {
  let models = deskModels.get(scene);
  if (!models) deskModels.set(scene, (models = new Map<string, DeskModel>()));
  const key = deskId ?? '';
  let model = models.get(key);
  if (!model) {
    const copy = deskId === null ? scene : (pristine.get(scene) ?? scene).clone(true);
    model = { scene: copy, index: indexNodes(copy) };
    models.set(key, model);
  }
  return model;
}

/** Lets go of the copies of desks that no longer exist. */
export function releaseDeskModels(scene: Object3D, keep: readonly string[]) {
  const models = deskModels.get(scene);
  if (!models) return;
  for (const key of models.keys()) if (key !== '' && !keep.includes(key)) models.delete(key);
}
