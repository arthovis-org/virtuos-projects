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
 * same id, registered from inside the canvas (the live screens, and in multiple desks mode
 * the posters on the other desks).
 */
export const cssProjection = {
  camera: null as HTMLElement | null,
  surfaces: new Map<string, HTMLElement>(),
  frames: new Map<string, ScreenFrame>(),
  /** Asks the canvas for a frame, e.g. when an element was just mounted. */
  invalidate: null as (() => void) | null,
  /**
   * When the screens last moved on the page (`performance.now()`): the camera, or a desk going
   * up or down. While they move, the layer is marked `data-moving` (see `MOVING_REST`).
   */
  movedAt: 0,
  /** What the screens were last laid out with. */
  view: null as { camera: PerspectiveCamera; size: { width: number; height: number } } | null,
  pixelsPerMetre: 1,
  /**
   * Called once, right after the next frame of the scene is drawn, with its WebGL context and
   * pixel ratio: what is drawn can be read then (`readPixels`). Ask for a frame after adding one.
   */
  probes: [] as ((gl: WebGLRenderingContext, pixelRatio: number) => void)[],
};

/**
 * How long the screens must stay still before the layer's `data-moving` mark goes (ms). While
 * it is on, screens with a recent picture show it in place of their live pages, which then need
 * no redrawing at every new angle (`screenSnapshots`): that redrawing made moving the camera
 * stutter with a few busy sites on view, the more the closer.
 */
const MOVING_REST = 250;
let restTimer = 0;

/** What each element was last given, so it is only written (and counted as a move) on change. */
const placed = new WeakMap<HTMLElement, string>();
const place = (element: HTMLElement, transform: string) => {
  if (placed.get(element) === transform) return false;
  placed.set(element, transform);
  element.style.transform = transform;
  return true;
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
  cssProjection.view = { camera, size };
  cssProjection.pixelsPerMetre = pixelsPerMetre;
  const v = view.copy(camera.matrixWorldInverse).elements;
  const k = PX_PER_METRE;
  // prettier-ignore
  let moved = place(cameraElement,
    `translateZ(${focal}px)` +
    matrix3d([
      v[0], -v[1], v[2], v[3],
      v[4], -v[5], v[6], v[7],
      v[8], -v[9], v[10], v[11],
      v[12] * k, -v[13] * k, v[14] * k, v[15],
    ]) +
    `translate(${size.width / 2}px,${size.height / 2}px)`);

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
    const surfaceMoved = place(element,
      'translate(-50%,-50%)' +
      matrix3d([
        w[0] * s, w[1] * s, w[2] * s, 0,
        -w[4] * s, -w[5] * s, -w[6] * s, 0,
        w[8] * s, w[9] * s, w[10] * s, 0,
        w[12] * k, w[13] * k, w[14] * k, 1,
      ]));
    moved ||= surfaceMoved;
  }

  if (moved) {
    cssProjection.movedAt = performance.now();
    layer.dataset.moving = '';
    window.clearTimeout(restTimer);
    restTimer = window.setTimeout(() => delete layer.dataset.moving, MOVING_REST);
  }
}

const corner = new Vector3();
const toCamera = new Vector3();
const normal = new Vector3();

/**
 * Where the corners of the screen `id` (its DOM surface of `width` × `height` CSS pixels) are
 * drawn in the layer, in CSS pixels from its top left: top left, top right, bottom right,
 * bottom left. Null when the screen is behind the camera or turned away from it.
 */
export function screenCorners(id: string, width: number, height: number) {
  const frame = cssProjection.frames.get(id);
  const { view: drawn, pixelsPerMetre } = cssProjection;
  if (!frame || !drawn) return null;
  const { camera, size } = drawn;
  frame.mesh.updateWorldMatrix(true, false);
  frame.mesh.matrixWorld.decompose(meshPosition, meshRotation, meshScale);
  centre.copy(frame.position).applyMatrix4(frame.mesh.matrixWorld);
  rotation.multiplyQuaternions(meshRotation, frame.quaternion);
  normal.set(0, 0, 1).applyQuaternion(rotation);
  if (toCamera.copy(camera.position).sub(centre).dot(normal) <= 0) return null;
  const corners: [number, number][] = [];
  for (const [u, v] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    // One CSS pixel of the surface spans 1 / pixelsPerMetre; CSS y points down.
    corner
      .set((u * width) / 2 / pixelsPerMetre, (-v * height) / 2 / pixelsPerMetre, 0)
      .applyQuaternion(rotation)
      .add(centre);
    if (corner.clone().applyMatrix4(camera.matrixWorldInverse).z >= -camera.near) return null;
    corner.project(camera);
    corners.push([((corner.x + 1) / 2) * size.width, ((1 - corner.y) / 2) * size.height]);
  }
  return corners;
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
