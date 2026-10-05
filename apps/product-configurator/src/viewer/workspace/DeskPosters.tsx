import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { Object3D } from 'three';
import type { ProductDefinition } from '@/catalog/schema';
import { posterId, usePosterStore } from '@/state/posterStore';
import { coverScreens, cssProjection, screenHoleMaterial } from './cssProjection';
import { isShown, resolveScreens, screenPixels } from './resolveScreens';

interface DeskPostersProps {
  product: ProductDefinition;
  deskId: string;
  scene: Object3D;
  index: ReadonlyMap<string, Object3D>;
  /** Blender object names hidden by this desk's configuration. */
  hiddenNodes: ReadonlySet<string>;
}

/**
 * The screens of a desk the visitor is not at, in unlimited desks mode: each shows a poster
 * of the desk's workspace (a DOM surface, like the live sites, but nothing loads), so the
 * room looks alive and a click sits the visitor down there.
 */
export function DeskPosters({ product, deskId, scene, index, hiddenNodes }: DeskPostersProps) {
  const invalidate = useThree((s) => s.invalidate);
  const setPosters = usePosterStore((s) => s.setPosters);
  const clearPosters = usePosterStore((s) => s.clearPosters);
  const screens = useMemo(() => resolveScreens(product, scene, index), [product, scene, index]);
  const visible = useMemo(
    () => screens.filter((s) => isShown(s.node, scene, hiddenNodes)),
    [screens, scene, hiddenNodes],
  );

  useEffect(() => {
    const restore = coverScreens(screens, screenHoleMaterial(), product.screenMaterial);
    invalidate();
    return () => {
      restore();
      invalidate();
    };
  }, [screens, product.screenMaterial, invalidate]);

  useEffect(() => {
    const posters = visible.map((s) => ({
      id: posterId(deskId, s.screen.id),
      deskId,
      screen: s.screen,
      ...screenPixels(product, s),
    }));
    visible.forEach((s, i) => cssProjection.frames.set(posters[i]?.id ?? '', s.frame));
    setPosters(deskId, posters);
    invalidate();
    return () => {
      for (const poster of posters) cssProjection.frames.delete(poster.id);
      clearPosters(deskId);
    };
  }, [visible, deskId, product, setPosters, clearPosters, invalidate]);

  return null;
}
