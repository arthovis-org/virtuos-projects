import {
  Matrix4,
  MeshBasicMaterial,
  NoBlending,
  type Material,
  type Mesh,
  Quaternion,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { ScreenFrame } from './screenFrame';

/**
 * CSS pixels per world metre inside the 3D layer. Browsers round the positions of 3D
 * transformed layers to whole pixels, so at 1 px per metre (drei's `<Html transform>`) a
 * screen 1.45 m up is drawn at 1 m; at 1000 px per metre the rounding stays under a millimetre.
 * The perspective projection does not change with the scale.
 */
const PX_PER_METRE = 1000;

/**
 * The DOM elements the viewer positions every frame: the camera element (inside the layer
 * that sets the perspective) and one element per screen, registered by the screen layer,
 * which lives outside the canvas; and the display surface each one is laid over, by the
 * same id, registered from inside the canvas (the live screens, and in unlimited desks mode
 * the posters on the other desks).
 */
export const cssProjection = {
  camera: null as HTMLElement | null,
  surfaces: new Map<string, HTMLElement>(),
  frames: new Map<string, ScreenFrame>(),
  /** Asks the canvas for a frame, e.g. when an element was just mounted. */
  invalidate: null as (() => void) | null,
};

const epsilon = (value: number) => (Math.abs(value) < 1e-10 ? 0 : value);
const matrix3d = (e: ArrayLike<number>) =>
  `matrix3d(${Array.from({ length: 16 }, (_, i) => epsilon(e[i] ?? 0)).join(',')})`;

const view = new Matrix4();
const world = new Matrix4();
const meshPosition = new Vector3();
const meshRotation = new Quaternion();
const meshScale = new Vector3();
const centre = new Vector3();
const rotation = new Quaternion();
const unit = new Vector3(1, 1, 1);

/**
 * Lays each screen element over its display surface, the way three's CSS3DRenderer does:
 * the camera element holds the inverse camera transform (CSS y points down, hence the flips),
 * each surface element its world transform with one CSS pixel spanning 1 / pixelsPerMetre.
 */
export function updateCssProjection(
  camera: PerspectiveCamera,
  size: { width: number; height: number },
  pixelsPerMetre: number,
) {
  const { frames } = cssProjection;
  const cameraElement = cssProjection.camera;
  const layer = cameraElement?.parentElement;
  if (!cameraElement || !layer) return;

  const focal = camera.projectionMatrix.elements[5] * (size.height / 2);
  layer.style.perspective = `${focal}px`;
  cameraElement.style.width = `${size.width}px`;
  cameraElement.style.height = `${size.height}px`;

  camera.updateMatrixWorld();
  const v = view.copy(camera.matrixWorldInverse).elements;
  const k = PX_PER_METRE;
  // prettier-ignore
  cameraElement.style.transform =
    `translateZ(${focal}px)` +
    matrix3d([
      v[0], -v[1], v[2], v[3],
      v[4], -v[5], v[6], v[7],
      v[8], -v[9], v[10], v[11],
      v[12] * k, -v[13] * k, v[14] * k, v[15],
    ]) +
    `translate(${size.width / 2}px,${size.height / 2}px)`;

  const s = k / pixelsPerMetre;
  for (const [id, element] of cssProjection.surfaces) {
    const frame = frames.get(id);
    if (!frame) continue;
    frame.mesh.updateWorldMatrix(true, false);
    frame.mesh.matrixWorld.decompose(meshPosition, meshRotation, meshScale);
    centre.copy(frame.position).applyMatrix4(frame.mesh.matrixWorld);
    rotation.multiplyQuaternions(meshRotation, frame.quaternion);
    const w = world.compose(centre, rotation, unit).elements;
    // prettier-ignore
    element.style.transform =
      'translate(-50%,-50%)' +
      matrix3d([
        w[0] * s, w[1] * s, w[2] * s, 0,
        -w[4] * s, -w[5] * s, -w[6] * s, 0,
        w[8] * s, w[9] * s, w[10] * s, 0,
        w[12] * k, w[13] * k, w[14] * k, 1,
      ]);
  }
}

let hole: MeshBasicMaterial | null = null;

/**
 * What a screen with a DOM surface draws as: a transparent hole that still hides what is
 * behind it, so the page under the canvas shows through it and whatever is in front of the
 * screen (another monitor, its own back, the desk) covers the page. Shared by every screen.
 */
export function screenHoleMaterial(): MeshBasicMaterial {
  hole ??= new MeshBasicMaterial({
    color: 0x000000,
    opacity: 0,
    transparent: true,
    blending: NoBlending,
  });
  return hole;
}

/**
 * Gives the display surfaces of `screens` another material (only their screen material slot
 * when a mesh has several). Returns the function that puts the originals back.
 */
export function coverScreens(
  screens: readonly { frame: ScreenFrame }[],
  look: Material,
  screenMaterial: string,
): () => void {
  // Named like the screen material, so the screens are still found while covered: the desk
  // the visitor just left still wears the live screens' look when its posters look for them.
  look.name = screenMaterial;
  const originals: [Mesh, Material | Material[]][] = [];
  for (const { frame } of screens) {
    const { mesh } = frame;
    const original = mesh.material;
    originals.push([mesh, original]);
    mesh.material = Array.isArray(original)
      ? original.map((m) => (m.name === screenMaterial ? look : m))
      : look;
  }
  return () => {
    for (const [mesh, original] of originals) mesh.material = original;
  };
}
