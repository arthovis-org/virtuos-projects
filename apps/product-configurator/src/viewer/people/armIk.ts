import { MathUtils, Quaternion, Vector3, type Bone, type Object3D } from 'three';

/** An arm's bones: upper arm, forearm and hand (Mixamo: LeftArm, LeftForeArm, LeftHand). */
export interface Arm {
  upper: Bone;
  fore: Bone;
  hand: Bone;
}

const isBone = (node: Object3D): node is Bone => 'isBone' in node;

/** The arms of a Mixamo skeleton (names as three.js loads them: "mixamorigLeftArm"). */
export function findArms(root: Object3D): Arm[] {
  const bones = new Map<string, Bone>();
  root.traverse((node) => {
    if (isBone(node)) bones.set(node.name, node);
  });
  const find = (suffix: string) => [...bones.values()].find((b) => b.name.endsWith(suffix));
  return (['Left', 'Right'] as const).flatMap((side) => {
    const upper = find(`${side}Arm`);
    const fore = find(`${side}ForeArm`);
    const hand = find(`${side}Hand`);
    return upper && fore && hand ? [{ upper, fore, hand }] : [];
  });
}

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const ac = new Vector3();
const ab = new Vector3();
const at = new Vector3();
const ba = new Vector3();
const bc = new Vector3();
const axis0 = new Vector3();
const axis1 = new Vector3();
const upperWorld = new Quaternion();
const foreWorld = new Quaternion();
const r0 = new Quaternion();
const r1 = new Quaternion();
const r2 = new Quaternion();
const delta = new Quaternion();
const upperBefore = new Quaternion();
const foreBefore = new Quaternion();

const angle = (u: Vector3, v: Vector3) =>
  Math.acos(MathUtils.clamp(u.dot(v) / Math.max(1e-9, u.length() * v.length()), -1, 1));

/** Turns a bone by a world-space rotation `q`, about its own origin. */
function rotateWorld(bone: Bone, q: Quaternion, boneWorld: Quaternion) {
  // new local = local · (world⁻¹ · q · world)
  delta.copy(boneWorld).invert().multiply(q).multiply(boneWorld);
  bone.quaternion.multiply(delta);
}

/**
 * Bends an arm so the hand reaches `target` (world space), keeping the elbow in the plane the
 * animation put it in: two-bone IK as in Daniel Holden's "Simple Two Joint IK". `weight`
 * blends from the animated pose (0) to the solved one (1).
 */
export function reach(arm: Arm, target: Vector3, weight: number) {
  if (weight <= 0) return;
  const { upper, fore, hand } = arm;
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(a);
  fore.getWorldPosition(b);
  hand.getWorldPosition(c);
  upper.getWorldQuaternion(upperWorld);
  fore.getWorldQuaternion(foreWorld);
  upperBefore.copy(upper.quaternion);
  foreBefore.copy(fore.quaternion);

  const lab = a.distanceTo(b);
  const lcb = b.distanceTo(c);
  const lat = MathUtils.clamp(a.distanceTo(target), 0.01, (lab + lcb) * 0.999);
  ac.subVectors(c, a);
  ab.subVectors(b, a);
  at.subVectors(target, a);
  ba.subVectors(a, b);
  bc.subVectors(c, b);

  const acAb0 = angle(ac, ab);
  const baBc0 = angle(ba, bc);
  const acAb1 = Math.acos(
    MathUtils.clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1),
  );
  const baBc1 = Math.acos(
    MathUtils.clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1),
  );
  axis0.crossVectors(ac, ab);
  // A straight arm has no bending plane: bend about the horizontal across the reach.
  if (axis0.lengthSq() < 1e-10) axis0.crossVectors(ac, new Vector3(0, 1, 0));
  axis0.normalize();
  axis1.crossVectors(ac, at);
  const turns = axis1.lengthSq() > 1e-10;
  if (turns) axis1.normalize();

  r0.setFromAxisAngle(axis0, acAb1 - acAb0);
  r1.setFromAxisAngle(axis0, baBc1 - baBc0);
  rotateWorld(upper, r0, upperWorld);
  rotateWorld(fore, r1, foreWorld);
  if (turns) {
    r2.setFromAxisAngle(axis1, angle(ac, at));
    rotateWorld(upper, r2, upperWorld);
  }

  if (weight < 1) {
    upper.quaternion.copy(upperBefore.slerp(upper.quaternion, weight));
    fore.quaternion.copy(foreBefore.slerp(fore.quaternion, weight));
  }
  upper.updateWorldMatrix(false, true);
}
