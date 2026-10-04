import { useTexture } from '@react-three/drei';
import { createPortal } from '@react-three/fiber';
import { Fragment, useMemo } from 'react';
import {
  Box3,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector3,
  type Intersection,
  type Object3D,
} from 'three';
import type { Decal, ProductDefinition } from '@/catalog/schema';
import { matrixRelativeTo, ownMeshes } from './nodeUtils';

interface DecalsProps {
  product: ProductDefinition;
  scene: Object3D;
  index: ReadonlyMap<string, Object3D>;
  /** Objects whose own geometry is hidden; their decals hide with them. */
  hiddenOwnNodes: ReadonlySet<string>;
}

/** Model directions for each side; the model's front faces +Z. */
const SIDES: Record<Decal['side'], Vector3> = {
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
  top: new Vector3(0, 1, 0),
  bottom: new Vector3(0, -1, 0),
};

/** Distance above the surface, in metres: enough to never flicker, too little to see. */
const LIFT = 0.0008;

interface Placement {
  position: Vector3;
  quaternion: Quaternion;
  /** Size in the node's local units. */
  width: number;
  height: number;
}

/**
 * Where a decal goes on a node, in the node's local space: centred on the side of its own
 * geometry that faces `side`, upright (for the top and bottom, reading from the front).
 */
function place(node: Object3D, scene: Object3D, decal: Decal, aspect: number): Placement | null {
  const box = new Box3();
  for (const mesh of ownMeshes(node)) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const geometryBox = mesh.geometry.boundingBox;
    if (geometryBox) box.union(geometryBox.clone().applyMatrix4(matrixRelativeTo(mesh, node)));
  }
  if (box.isEmpty()) return null;

  const toModel = matrixRelativeTo(node, scene);
  const scale = new Vector3();
  toModel.decompose(new Vector3(), new Quaternion(), scale);
  const metre = 1 / ((scale.x + scale.y + scale.z) / 3);
  const toLocal = toModel.clone().invert();
  const local = (v: Vector3) => v.clone().transformDirection(toLocal);

  // The box face whose axis is closest to the wanted side.
  const want = local(SIDES[decal.side]);
  const axis = (['x', 'y', 'z'] as const).reduce((a, b) =>
    Math.abs(want[b]) > Math.abs(want[a]) ? b : a,
  );
  const sign = Math.sign(want[axis]) || 1;
  const normal = new Vector3().setComponent('xyz'.indexOf(axis), sign);

  const upward = decal.side === 'top' || decal.side === 'bottom' ? SIDES.back : SIDES.top;
  const up = local(upward).projectOnPlane(normal).normalize();
  if (up.lengthSq() < 0.5) up.set(0, 1, 0).projectOnPlane(normal).normalize();
  const right = new Vector3().crossVectors(up, normal);

  // Start outside the box at the wanted spot and drop onto the surface below it, so the image
  // lies on whatever is there (a mount plate or the panel behind it) instead of floating at
  // the box's furthest point.
  const [dx, dy] = decal.offset;
  const outside = box.getCenter(new Vector3());
  outside[axis] = (sign > 0 ? box.max[axis] : box.min[axis]) + sign * 0.01 * metre;
  outside.addScaledVector(right, dx * metre).addScaledVector(up, dy * metre);
  node.updateWorldMatrix(true, true);
  const raycaster = new Raycaster(
    outside.clone().applyMatrix4(node.matrixWorld),
    normal.clone().negate().transformDirection(node.matrixWorld),
  );
  // Tested mesh by mesh: a swapped-out part is on no render layer, which `intersectObjects`
  // would skip, and it still needs its decal for when it shows.
  const hits: Intersection[] = [];
  for (const mesh of ownMeshes(node)) mesh.raycast(raycaster, hits);
  const hit = hits.sort((a, b) => a.distance - b.distance)[0];
  if (!hit) return null;
  const centre = node.worldToLocal(hit.point.clone()).addScaledVector(normal, LIFT * metre);

  return {
    position: centre,
    quaternion: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal)),
    width: decal.width * metre,
    height: (decal.width / aspect) * metre,
  };
}

function DecalSet({
  decal,
  scene,
  index,
  hiddenOwnNodes,
}: Omit<DecalsProps, 'product'> & { decal: Decal }) {
  const texture = useTexture(decal.image);
  const image = texture.image as { width: number; height: number } | undefined;
  const aspect = image ? image.width / image.height : 1;

  const placements = useMemo(
    () =>
      decal.objects.flatMap((name) => {
        const node = index.get(name);
        const placement = node && place(node, scene, decal, aspect);
        return node && placement ? [{ name, node, placement }] : [];
      }),
    [decal, index, scene, aspect],
  );

  return placements.map(({ name, node, placement }) => (
    <Fragment key={name}>
      {createPortal(
        <mesh
          position={placement.position}
          quaternion={placement.quaternion}
          visible={!hiddenOwnNodes.has(name)}
          // Not part of the object's own geometry (see `ownMeshes`).
          userData={{ decal: true }}
          renderOrder={1}
        >
          <planeGeometry args={[placement.width, placement.height]} />
          {/* The image is a mask: white shows the colour, black lets the object through. */}
          <meshStandardMaterial
            color={decal.color}
            alphaMap={texture}
            alphaTest={0.4}
            roughness={0.45}
            metalness={0.1}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>,
        node,
      )}
    </Fragment>
  ));
}

/** Images laid on the model, such as a logo, from the product's `decals`. */
export function Decals({ product, ...rest }: DecalsProps) {
  return product.decals.map((decal) => (
    <DecalSet key={`${decal.image}:${decal.objects.join(',')}`} decal={decal} {...rest} />
  ));
}
