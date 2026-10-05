import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { PerspectiveCamera } from 'three';
import { useProduct } from '@/state/setupStore';
import { cssProjection, updateCssProjection } from './cssProjection';

/**
 * Lays the DOM screens (live sites, and the posters of unlimited desks mode) over their display
 * surfaces each time the scene is drawn, after everything moved this frame (camera, desk
 * height), so they never lag behind. Always mounted: the posters need it with no desk live.
 * Other renders of the scene (contact shadows, the height side view) use other cameras.
 */
export function CssProjectionDriver() {
  const product = useProduct();
  const root = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    cssProjection.invalidate = invalidate;
    return () => {
      cssProjection.invalidate = null;
    };
  }, [invalidate]);

  useEffect(() => {
    const previous = root.onAfterRender.bind(root);
    root.onAfterRender = (renderer, scene, drawn, ...rest) => {
      previous(renderer, scene, drawn, ...rest);
      if (drawn === camera) {
        updateCssProjection(camera as PerspectiveCamera, size, product.pixelsPerMetre);
      }
    };
    invalidate();
    return () => {
      root.onAfterRender = previous;
    };
  }, [root, camera, size, product.pixelsPerMetre, invalidate]);

  return null;
}
