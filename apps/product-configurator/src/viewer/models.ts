import { useGLTF } from '@react-three/drei';
import { getProduct } from '@/catalog';
import { useConfiguratorStore } from '@/state/configuratorStore';

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
