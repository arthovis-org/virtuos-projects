import { MathUtils, Quaternion, Vector3, type Object3D } from 'three';

/** A Mixamo neck and head (names as three.js loads them: "mixamorigNeck", "mixamorigHead"). */
export interface Gaze {
  neck: Object3D;
  head: Object3D;
}

export function findGaze(root: Object3D): Gaze | null {
  let neck: Object3D | undefined;
  let head: Object3D | undefined;
  root.traverse((node) => {
    if (!neck && node.name.endsWith('Neck')) neck = node;
    if (!head && node.name.endsWith('Head')) head = node;
  });
  return neck && head ? { neck, head } : null;
}

/** A Mixamo bone's facing: its local +Z (its +Y runs along the bone). */
const FACING = new Vector3(0, 0, 1);
/** The most the head turns from where the animation has it: further would look strained. */
const MAX_TURN = MathUtils.degToRad(65);
/** The neck takes this share of the turn, the head the rest. */
const NECK_SHARE = 0.4;

const headPosition = new Vector3();
const facing = new Vector3();
const toTarget = new Vector3();
const world = new Quaternion();
const turn = new Quaternion();
const part = new Quaternion();
const local = new Quaternion();
const identity = new Quaternion();

/** Turns a bone by a world-space rotation, about its own origin. */
function rotateWorld(bone: Object3D, q: Quaternion) {
  bone.getWorldQuaternion(world);
  local.copy(world).invert().multiply(q).multiply(world);
  bone.quaternion.multiply(local);
  bone.updateWorldMatrix(false, true);
}

/** The rotation that turns the bone's facing towards `target`, at most MAX_TURN. */
function turnTowards(bone: Object3D, target: Vector3, out: Quaternion) {
  bone.getWorldPosition(headPosition);
  bone.getWorldQuaternion(world);
  facing.copy(FACING).applyQuaternion(world);
  toTarget.subVectors(target, headPosition).normalize();
  out.setFromUnitVectors(facing, toTarget);
  const angle = 2 * Math.acos(MathUtils.clamp(out.w, -1, 1));
  if (angle > MAX_TURN) out.copy(identity.identity().slerp(out, MAX_TURN / angle));
  return out;
}

/**
 * Turns the neck and head (after the animation, before drawing) to look at `target` (world
 * space), as far as `weight` (0: the animation's own gaze, 1: right at it).
 */
export function lookAt(gaze: Gaze, target: Vector3, weight: number) {
  if (weight <= 0.001) return;
  gaze.neck.updateWorldMatrix(true, true);
  turnTowards(gaze.head, target, turn);
  rotateWorld(gaze.neck, part.copy(identity.identity()).slerp(turn, NECK_SHARE * weight));
  // What is left of the turn, from where the neck brought the head.
  turnTowards(gaze.head, target, turn);
  rotateWorld(gaze.head, part.copy(identity.identity()).slerp(turn, weight));
}
