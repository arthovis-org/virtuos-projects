import { Box3, Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from 'three';
import { isMesh, matrixRelativeTo } from '../nodeUtils';

/** Where a screen's display surface is, in the local space of its mesh. */
export interface ScreenFrame {
  mesh: Mesh;
  /** Centre of the display surface. */
  position: Vector3;
  /** Rotation whose +X is the screen's right, +Y its up and +Z its front. */
  quaternion: Quaternion;
  /** Size of the display surface in the mesh's local units. */
  width: number;
  height: number;
}

/**
 * The meshes of a monitor object that use the screen material. A monitor with several
 * materials is a group whose primitive meshes carry no Blender name of their own.
 */
export function screenMeshes(node: Object3D, material: string): Mesh[] {
  const candidates = isMesh(node)
    ? [node]
    : node.children.filter(
        (child): child is Mesh => isMesh(child) && child.userData.name === undefined,
      );
  return candidates.filter((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some((m) => m.name === material);
  });
}

/** Average vertex normal: which side is displayed, but skewed by bevels around the edge. */
function averageNormal(mesh: Mesh): Vector3 | null {
  const normal = mesh.geometry.getAttribute('normal') as
    ReturnType<typeof mesh.geometry.getAttribute> | undefined;
  if (!normal) return null;
  const sum = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < normal.count; i++) sum.add(n.fromBufferAttribute(normal, i));
  return sum.lengthSq() > 1e-6 ? sum.normalize() : null;
}

/**
 * Normal of the flat display surface, from a least-squares fit of `P = O + u·R + v·D` over
 * the vertices: UVs of a flat screen are affine in position even when the layout is rotated,
 * so `R × D` is the exact plane normal (bevelled edge vertices do not bias it).
 */
function planeNormal(mesh: Mesh): Vector3 | null {
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv') as
    ReturnType<typeof mesh.geometry.getAttribute> | undefined;
  if (!uv || position.count < 3 || uv.count !== position.count) return null;
  // Normal equations A^T A x = A^T P for rows [1, u, v], solved with Cramer's rule.
  let n = 0,
    su = 0,
    sv = 0,
    suu = 0,
    suv = 0,
    svv = 0;
  const sp = new Vector3();
  const sup = new Vector3();
  const svp = new Vector3();
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    p.fromBufferAttribute(position, i);
    n += 1;
    su += u;
    sv += v;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    sp.add(p);
    sup.addScaledVector(p, u);
    svp.addScaledVector(p, v);
  }
  const det = n * (suu * svv - suv * suv) - su * (su * svv - suv * sv) + sv * (su * suv - suu * sv);
  if (Math.abs(det) < 1e-12) return null;
  // Columns 2 and 3 of the inverse give R and D.
  const r = new Vector3()
    .addScaledVector(sp, (sv * suv - su * svv) / det)
    .addScaledVector(sup, (n * svv - sv * sv) / det)
    .addScaledVector(svp, (su * sv - n * suv) / det);
  const d = new Vector3()
    .addScaledVector(sp, (su * suv - sv * suu) / det)
    .addScaledVector(sup, (sv * su - n * suv) / det)
    .addScaledVector(svp, (n * suu - su * su) / det);
  const normal = new Vector3().crossVectors(r, d);
  return normal.lengthSq() > 1e-12 ? normal.normalize() : null;
}

/** Direction the displayed side faces. */
function frontOf(mesh: Mesh): Vector3 {
  const approximate = averageNormal(mesh);
  const exact = planeNormal(mesh);
  if (exact) return approximate && exact.dot(approximate) < 0 ? exact.negate() : exact;
  if (approximate) return approximate;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const size = (mesh.geometry.boundingBox ?? new Box3()).getSize(new Vector3());
  const thinnest = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
  return new Vector3().setComponent(thinnest, 1);
}

/**
 * Fits the display surface of a screen mesh. UV maps are not trusted for orientation (they
 * are often rotated in Blender); instead the screen's top is the edge closest to the real
 * world's up, and for a screen lying almost flat (a desk display) the edge furthest from the
 * viewer, which sits along the scene's -Z.
 */
export function screenFrame(mesh: Mesh, root: Object3D): ScreenFrame {
  const front = frontOf(mesh);
  // Scene directions expressed in the mesh's local space.
  const toLocal = new Matrix4().copy(matrixRelativeTo(mesh, root)).invert();
  const sceneUp = new Vector3(0, 1, 0).transformDirection(toLocal);
  const sceneBack = new Vector3(0, 0, -1).transformDirection(toLocal);
  const onPlane = (v: Vector3) => v.clone().addScaledVector(front, -v.dot(front));

  let up = onPlane(sceneUp);
  if (up.length() < 0.5) up = onPlane(sceneBack);
  up.normalize();
  const right = new Vector3().crossVectors(up, front).normalize();

  // Extent of the vertices along the screen's own axes.
  const position = mesh.geometry.getAttribute('position');
  const p = new Vector3();
  let rMin = Infinity;
  let rMax = -Infinity;
  let uMin = Infinity;
  let uMax = -Infinity;
  let depth = 0;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const r = p.dot(right);
    const u = p.dot(up);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    depth += p.dot(front);
  }
  depth /= Math.max(1, position.count);

  const centre = new Vector3()
    .addScaledVector(right, (rMin + rMax) / 2)
    .addScaledVector(up, (uMin + uMax) / 2)
    .addScaledVector(front, depth);
  return {
    mesh,
    position: centre,
    quaternion: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, front)),
    width: rMax - rMin,
    height: uMax - uMin,
  };
}
