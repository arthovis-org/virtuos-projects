import { Box3, Vector3, type Matrix4, type Mesh, type Object3D } from 'three';

const isMesh = (node: Object3D): node is Mesh => 'isMesh' in node;
import type { ProductDefinition } from '@/catalog/schema';

/**
 * Where hands rest at a desk: a flat surface, in the desk's own space (its front, where its
 * person sits, towards +Z). `front` is the middle of its near edge, `along` runs along that
 * edge towards +X, `inward` across the surface away from the person, `up` out of it.
 */
export interface Surface {
  front: Vector3;
  along: Vector3;
  inward: Vector3;
  up: Vector3;
  width: number;
}

/** Shown: no hidden ancestor, and drawn (toggled parts are hidden with layers). */
function shown(node: Object3D) {
  for (let n: Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  let drawn = false;
  node.traverse((child) => {
    if (isMesh(child) && child.layers.mask !== 0) drawn = true;
  });
  return drawn;
}

function firstMesh(node: Object3D): Mesh | undefined {
  let found: Mesh | undefined;
  node.traverse((child) => {
    if (!found && isMesh(child)) found = child;
  });
  return found;
}

const corner = new Vector3();

/** A thin box's top face (the one facing up most), as a surface in `toDesk`'s space. */
function slabSurface(mesh: Mesh, toDesk: Matrix4): Surface | null {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  const size = box.getSize(new Vector3()).toArray();
  const thin = size.indexOf(Math.min(...size));
  const faces = [box.min, box.max].map((plane) => {
    const points: Vector3[] = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z);
          if (corner.getComponent(thin) !== plane.getComponent(thin)) continue;
          points.push(corner.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(toDesk));
        }
    return points;
  });
  // The face higher up is the top.
  const height = (points: Vector3[]) => points.reduce((sum, p) => sum + p.y, 0);
  const top = height(faces[1] ?? []) >= height(faces[0] ?? []) ? faces[1] : faces[0];
  if (top?.length !== 4) return null;
  const byNear = [...top].sort((p, q) => q.z - p.z);
  const [n0, n1, f0, f1] = byNear as [Vector3, Vector3, Vector3, Vector3];
  const front = n0.clone().add(n1).multiplyScalar(0.5);
  const back = f0.clone().add(f1).multiplyScalar(0.5);
  const along = n1.clone().sub(n0);
  if (along.x < 0) along.negate();
  const width = along.length();
  along.normalize();
  const inward = back.sub(front).normalize();
  const up = along.clone().cross(inward).normalize();
  if (up.y < 0) up.negate();
  return { front, along, inward, up, width };
}

/**
 * The surface a desk's person types on: its flat screen (the desk monitor) when it has one
 * switched on, else the top of the desk. `toDesk` turns world space into the desk's space.
 */
export function deskSurface(
  product: ProductDefinition,
  index: ReadonlyMap<string, Object3D>,
  toDesk: Matrix4,
): Surface | null {
  let best: { surface: Surface; flat: number } | null = null;
  for (const screen of product.screens) {
    const node = index.get(screen.node);
    const mesh = node && shown(node) ? firstMesh(node) : undefined;
    const surface = mesh ? slabSurface(mesh, toDesk) : null;
    if (surface && surface.up.y > 0.7 && (!best || surface.up.y > best.flat)) {
      best = { surface, flat: surface.up.y };
    }
  }
  if (best) return best.surface;

  // No desk monitor: the desk top (the height's reference part).
  const motion = product.motions[0];
  const part = product.parts.find((p) => p.id === motion?.referencePart);
  const nodes = (part?.nodes ?? []).flatMap((name) => index.get(name) ?? []);
  if (nodes.length === 0) return null;
  const box = new Box3();
  for (const node of nodes) box.expandByObject(node);
  box.applyMatrix4(toDesk);
  if (box.isEmpty()) return null;
  return {
    front: new Vector3((box.min.x + box.max.x) / 2, box.max.y, box.max.z),
    along: new Vector3(1, 0, 0),
    inward: new Vector3(0, 0, -1),
    up: new Vector3(0, 1, 0),
    width: box.max.x - box.min.x,
  };
}
