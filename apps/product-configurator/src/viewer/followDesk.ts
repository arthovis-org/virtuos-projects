import { MathUtils, Vector3, type Box3, type PerspectiveCamera } from 'three';
import { fitDistance } from './fitDistance';

/**
 * How high up the framed product (0 floor, 1 top) the camera orbits and zooms towards: about
 * the main screen, not the middle of the bounds (the screen lying on the desk), so zooming in
 * comes to the screen one looks at.
 */
export const TARGET_HEIGHT = 0.7;

/** The point the camera orbits in `box`. */
export function orbitCentre(box: Box3, target = new Vector3()) {
  box.getCenter(target);
  return target.setY(MathUtils.lerp(box.min.y, box.max.y, TARGET_HEIGHT));
}

const aim = new Vector3();
const shift = new Vector3();
const fromCentre = new Vector3();
const toCentre = new Vector3();

/**
 * Moves a camera pose (`position` looking at `target`, both changed in place) from a desk
 * filling `from` to the desk filling `to` (raised or lowered): from the same side, as close in
 * for its size. Seen whole, the view follows the middle of the desk; zoomed in, the top
 * (the screens), which moves by as much as the desk.
 */
export function followDesk(
  position: Vector3,
  target: Vector3,
  from: Box3,
  to: Box3,
  camera: PerspectiveCamera,
) {
  const distance = position.distanceTo(target);
  if (distance < 1e-6 || from.isEmpty() || to.isEmpty()) return;
  aim.subVectors(position, target).divideScalar(distance);
  orbitCentre(from, fromCentre);
  orbitCentre(to, toCentre);
  const fitFrom = fitDistance(from, fromCentre, aim, camera);
  const fitTo = fitDistance(to, toCentre, aim, camera);
  if (fitFrom < 1e-6) return;
  const zoomedIn = MathUtils.clamp(1 - distance / fitFrom, 0, 1);
  shift.subVectors(toCentre, fromCentre);
  shift.y = MathUtils.lerp(shift.y, to.max.y - from.max.y, zoomedIn);
  target.add(shift);
  position.copy(target).addScaledVector(aim, (distance * fitTo) / fitFrom);
}
