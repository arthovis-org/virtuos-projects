import { Box3, Euler, Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from 'three';
import type { ModelDefinition } from '@/catalog/schema';

export function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

/**
 * A node's own meshes: itself, or the primitives glTF splits a multi-material mesh into
 * (children without a Blender name). Decals laid on the node are not part of it.
 */
export function ownMeshes(node: Object3D): Mesh[] {
  const meshes = isMesh(node) ? [node] : [];
  for (const child of node.children) {
    if (isMesh(child) && child.userData.name === undefined && !child.userData.decal) {
      meshes.push(child);
    }
  }
  return meshes;
}

/**
 * Nodes of a loaded scene by their Blender name. three.js may rename nodes (spaces, dots,
 * duplicates) but keeps the original glTF name in `userData.name`, which the catalog uses.
 */
export function indexNodes(scene: Object3D): ReadonlyMap<string, Object3D> {
  const index = new Map<string, Object3D>();
  scene.traverse((object) => {
    const name = (object.userData.name as string | undefined) ?? object.name;
    if (name && !index.has(name)) index.set(name, object);
  });
  return index;
}

/** Nodes that start another part; a part's subtree stops where another part begins. */
export type PartBoundaries = ReadonlySet<Object3D>;

const NO_BOUNDARIES: PartBoundaries = new Set();

/** Every mesh at or below `root`, not descending into other parts (`boundaries`). */
export function collectMeshes(root: Object3D, boundaries = NO_BOUNDARIES): Mesh[] {
  const meshes: Mesh[] = [];
  const visit = (object: Object3D) => {
    if (object !== root && boundaries.has(object)) return;
    if (isMesh(object)) meshes.push(object);
    object.children.forEach(visit);
  };
  visit(root);
  return meshes;
}

/**
 * Transform of `node` relative to its ancestor `root`, from local matrices only, so it is
 * correct even before the first render has computed world matrices.
 */
export function matrixRelativeTo(node: Object3D, root: Object3D, target = new Matrix4()): Matrix4 {
  target.identity();
  for (let current: Object3D | null = node; current && current !== root; current = current.parent) {
    current.updateMatrix();
    target.premultiply(current.matrix);
  }
  return target;
}

export function modelTransform(model: ModelDefinition): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...model.position),
    new Quaternion().setFromEuler(new Euler(...model.rotation)),
    new Vector3().setScalar(model.scale),
  );
}

/**
 * Bounding box of a loaded scene after the model's correction transform. Hidden nodes
 * count, so parts that are switched on later never fall outside the box.
 */
export function modelBounds(scene: Object3D, model: ModelDefinition): Box3 {
  return subtreeBounds(scene, scene, modelTransform(model));
}

/**
 * Bounding box of `node` and its descendants in the space of `root` (after `rootTransform`),
 * skipping anything below `boundaries`.
 */
export function subtreeBounds(
  node: Object3D,
  root: Object3D,
  rootTransform: Matrix4,
  boundaries = NO_BOUNDARIES,
): Box3 {
  const box = new Box3();
  const meshBox = new Box3();
  const visit = (object: Object3D, parentMatrix: Matrix4) => {
    if (object !== node && boundaries.has(object)) return;
    object.updateMatrix();
    const matrix = new Matrix4().multiplyMatrices(parentMatrix, object.matrix);
    if (isMesh(object)) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) {
        box.union(meshBox.copy(object.geometry.boundingBox).applyMatrix4(matrix));
      }
    }
    for (const child of object.children) visit(child, matrix);
  };
  // `visit` applies each object's own matrix, so start from the parent's frame; for a
  // descendant that includes the root's matrix, as `visit(root)` would.
  const parentMatrix = rootTransform.clone();
  if (node !== root && node.parent) {
    root.updateMatrix();
    parentMatrix.multiply(root.matrix).multiply(matrixRelativeTo(node.parent, root));
  }
  visit(node, parentMatrix);
  return box;
}

/**
 * Bounds of one mesh's own geometry in the space of `root` (after `rootTransform`). Unlike
 * `subtreeBounds` this ignores children: in three.js an object with a single mesh is that
 * mesh, so anything parented to it in Blender (a monitor on the desk top) is its child.
 */
export function meshBounds(mesh: Mesh, root: Object3D, rootTransform: Matrix4): Box3 {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox?.clone() ?? new Box3();
  root.updateMatrix();
  const matrix = rootTransform.clone().multiply(root.matrix).multiply(matrixRelativeTo(mesh, root));
  return box.applyMatrix4(matrix);
}

const AUTHORED_POSITION = 'configuratorAuthoredPosition';

/**
 * The node's position as loaded from the glTF. Recorded on first access, because the loader
 * caches scenes: when a product is shown again its nodes still sit where the height motion
 * last moved them.
 */
export function authoredPosition(node: Object3D): Vector3 {
  const existing = node.userData[AUTHORED_POSITION] as Vector3 | undefined;
  if (existing) return existing;
  const authored = node.position.clone();
  node.userData[AUTHORED_POSITION] = authored;
  return authored;
}
