import { Vector3, type Box3, type PerspectiveCamera } from 'three';

/**
 * How far from `center` along `aim` the camera must be to see every corner of `box`. Unlike
 * drei's estimate this counts the corners nearer the camera, which look bigger: a room of
 * desks is deep, and its front corners were cut off.
 */
export function fitDistance(box: Box3, center: Vector3, aim: Vector3, camera: PerspectiveCamera) {
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * camera.aspect;
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), aim).normalize();
  const up = new Vector3().crossVectors(aim, right).normalize();
  let distance = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const offset = new Vector3(x, y, z).sub(center);
        const depth = offset.dot(aim);
        distance = Math.max(
          distance,
          depth + Math.abs(offset.dot(right)) / tanH,
          depth + Math.abs(offset.dot(up)) / tanV,
        );
      }
    }
  }
  return distance;
}
