import { Quaternion, Vector3, type Object3D } from 'three';
import type { ProductDefinition } from '@/catalog/schema';
import { matrixRelativeTo } from '../nodeUtils';
import { screenFrame, screenMeshes, type ScreenFrame } from './screenFrame';

export interface ResolvedScreen {
  screen: ProductDefinition['screens'][number];
  node: Object3D;
  frame: ScreenFrame;
  /** World metres per local unit of the screen mesh. */
  worldScale: number;
}

const blenderName = (object: Object3D) =>
  (object.userData.name as string | undefined) ?? object.name;

/** True unless the node or one of its ancestors is hidden by the configuration. */
export function isShown(node: Object3D, scene: Object3D, hidden: ReadonlySet<string>) {
  for (
    let current: Object3D | null = node;
    current && current !== scene;
    current = current.parent
  ) {
    if (hidden.has(blenderName(current))) return false;
  }
  return true;
}

/** Each screen's display surface in one copy of the model. */
export function resolveScreens(
  product: ProductDefinition,
  scene: Object3D,
  index: ReadonlyMap<string, Object3D>,
): ResolvedScreen[] {
  const resolved: ResolvedScreen[] = [];
  for (const screen of product.screens) {
    const node = index.get(screen.node);
    const mesh = node ? screenMeshes(node, product.screenMaterial)[0] : undefined;
    if (!node || !mesh) {
      console.warn(
        `[configurator] screen "${screen.node}" has no "${product.screenMaterial}" mesh`,
      );
      continue;
    }
    const scale = new Vector3();
    matrixRelativeTo(mesh, scene).decompose(new Vector3(), new Quaternion(), scale);
    resolved.push({
      screen,
      node,
      frame: screenFrame(mesh, scene),
      worldScale: ((scale.x + scale.y + scale.z) / 3) * product.model.scale,
    });
  }
  return resolved;
}

/** A screen's size in CSS pixels at the product's pixel density. */
export function screenPixels(product: ProductDefinition, { frame, worldScale }: ResolvedScreen) {
  const ppm = product.pixelsPerMetre;
  return {
    widthPx: Math.round(frame.width * worldScale * ppm),
    heightPx: Math.round(frame.height * worldScale * ppm),
  };
}
