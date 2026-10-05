import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, type PerspectiveCamera, Spherical, Vector3 } from 'three';
import { useWorkspaceStore } from '@/state/workspaceStore';
import type { ScreenFrame } from './screenFrame';

export interface CameraTarget {
  id: string;
  frame: ScreenFrame;
}

interface WorkspaceCameraProps {
  /** The visible screens. */
  screens: readonly CameraTarget[];
  /** Screen the overview looks straight at. */
  primaryId: string | undefined;
  /** Degrees the overview looks down when a screen lies on the desk. */
  tilt: number;
}

/** The parts of drei's OrbitControls this component adjusts. */
interface Controls {
  enabled: boolean;
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  update: () => void;
}

interface Pose {
  position: Vector3;
  target: Vector3;
}

/** Move duration: short hops are quick, a swing round from behind the desk a little longer. */
const MOVE_SECONDS = { min: 0.55, max: 0.9 };
/**
 * How far behind the desk the seated camera follows a height change (seconds of exponential
 * lag): long enough to see the desk move in the view, short enough to keep the screens framed.
 */
const FOLLOW_LAG = 0.6;
/** Space around the screens; small, so they fill the view. */
const MARGIN = 1.03;
const WORLD_UP = new Vector3(0, 1, 0);

/** Corners of a screen's display surface in world space. */
function worldCorners({ frame }: CameraTarget): Vector3[] {
  frame.mesh.updateWorldMatrix(true, false);
  const right = new Vector3(1, 0, 0)
    .applyQuaternion(frame.quaternion)
    .multiplyScalar(frame.width / 2);
  const up = new Vector3(0, 1, 0)
    .applyQuaternion(frame.quaternion)
    .multiplyScalar(frame.height / 2);
  return [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].map(([a = 0, b = 0]) =>
    frame.position
      .clone()
      .addScaledVector(right, a)
      .addScaledVector(up, b)
      .applyMatrix4(frame.mesh.matrixWorld),
  );
}

/** Centre of a screen's display surface in world space. */
function worldCentre({ frame }: CameraTarget): Vector3 {
  frame.mesh.updateWorldMatrix(true, false);
  return frame.position.clone().applyMatrix4(frame.mesh.matrixWorld);
}

/** Direction a screen's display faces, in world space. */
function worldFront({ frame }: CameraTarget): Vector3 {
  frame.mesh.updateWorldMatrix(true, false);
  return new Vector3(0, 0, 1)
    .applyQuaternion(frame.quaternion)
    .transformDirection(frame.mesh.matrixWorld);
}

/** `back` turned upwards by `tilt`, so the camera looks down on the desk. */
function tilted(back: Vector3, tilt: number): Vector3 {
  const level = new Vector3(back.x, 0, back.z);
  if (level.lengthSq() < 1e-6) return back.clone();
  const elevation = Math.min(Math.PI / 2 - 0.05, Math.asin(MathUtils.clamp(back.y, -1, 1)) + tilt);
  return level
    .normalize()
    .multiplyScalar(Math.cos(elevation))
    .addScaledVector(WORLD_UP, Math.sin(elevation));
}

/**
 * A pose looking along -`back` that fits all corners, like sitting in front of the desk, in
 * the part of the view between the top `inset` and the bottom `insetBottom` (shares of its
 * height, kept for the toolbar and the desk switcher).
 */
function fitPose(
  corners: Vector3[],
  back: Vector3,
  camera: PerspectiveCamera,
  inset: number,
  insetBottom = 0,
): Pose {
  const centre = corners
    .reduce((sum, c) => sum.add(c), new Vector3())
    .multiplyScalar(1 / Math.max(1, corners.length));
  const right = new Vector3().crossVectors(WORLD_UP, back);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new Vector3().crossVectors(back, right).normalize();
  const points = corners.map((corner) => {
    const offset = corner.clone().sub(centre);
    return { x: offset.dot(right), y: offset.dot(up), depth: offset.dot(back) };
  });
  const tanV = Math.tan((camera.fov * Math.PI) / 360) / MARGIN;
  const tanH = tanV * camera.aspect;
  // Top and bottom of the free part of the view, in normalised device coordinates.
  const top = 1 - 2 * inset;
  const bottom = 1 - 2 * insetBottom;

  // With the camera `d` back from the centre, the sideways and upward shifts that keep every
  // corner in view form an interval each (nearer corners appear larger, so they constrain
  // more); the pose is the smallest `d` for which both intervals are non-empty.
  const shifts = (d: number) => {
    let xMin = -Infinity;
    let xMax = Infinity;
    let yMin = -Infinity;
    let yMax = Infinity;
    for (const p of points) {
      const z = d - p.depth;
      if (z <= 0) return null;
      xMin = Math.max(xMin, p.x - z * tanH);
      xMax = Math.min(xMax, p.x + z * tanH);
      yMin = Math.max(yMin, p.y - z * tanV * top);
      yMax = Math.min(yMax, p.y + z * tanV * bottom);
    }
    return xMin <= xMax && yMin <= yMax ? { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 } : null;
  };
  let near = Math.max(0, ...points.map((p) => p.depth));
  let far = near + 50;
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (shifts(mid)) far = mid;
    else near = mid;
  }
  const shift = shifts(far) ?? { x: 0, y: 0 };
  const target = centre.clone().addScaledVector(right, shift.x).addScaledVector(up, shift.y);
  return { position: target.clone().addScaledVector(back, far), target };
}

/** Fast in the middle, soft at both ends. */
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

interface Move {
  from: Pose;
  to: Pose;
  /** Camera direction from the target, at both ends. */
  fromAngle: Spherical;
  toAngle: Spherical;
  seconds: number;
  t: number;
  started: boolean;
  onDone?: (() => void) | undefined;
}

function planMove(from: Pose, to: Pose, onDone?: () => void): Move {
  const fromAngle = new Spherical().setFromVector3(from.position.clone().sub(from.target));
  const toAngle = new Spherical().setFromVector3(to.position.clone().sub(to.target));
  // Swing the short way round.
  let turn = toAngle.theta - fromAngle.theta;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  toAngle.theta = fromAngle.theta + turn;
  const sweep = Math.min(1, (Math.abs(turn) + Math.abs(toAngle.phi - fromAngle.phi)) / Math.PI);
  return {
    from,
    to,
    fromAngle,
    toAngle,
    seconds: MathUtils.lerp(MOVE_SECONDS.min, MOVE_SECONDS.max, sweep),
    t: 0,
    started: false,
    onDone,
  };
}

const angle = new Spherical();
const target = new Vector3();

/**
 * Moves the camera for workspace mode: to a seated view of every visible screen (or one
 * focused screen), and back to where the visitor was when they get up or close the
 * workspace. Orbiting is off while seated, so pointer input goes to the websites.
 */
export function WorkspaceCamera({ screens, primaryId, tilt }: WorkspaceCameraProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const seated = useWorkspaceStore((s) => s.seated);
  const hudInset = useWorkspaceStore((s) => s.hudInset);
  const hudInsetBottom = useWorkspaceStore((s) => s.hudInsetBottom);
  const focus = useWorkspaceStore((s) => s.focus);
  const setCameraFree = useWorkspaceStore((s) => s.setCameraFree);

  const saved = useRef<(Pose & { limits: Partial<Controls> }) | null>(null);
  // Unmounted while seated (the room opened with no desk chosen): hand the camera back.
  useEffect(
    () => () => {
      if (controls && saved.current)
        Object.assign(controls, { ...saved.current.limits, enabled: true });
      saved.current = null;
      useWorkspaceStore.getState().setCameraFree(true);
    },
    [controls],
  );
  const move = useRef<Move | null>(null);
  /** Where the screen the camera faces was last frame, to follow it up and down. */
  const anchor = useRef<Vector3 | null>(null);
  /** The screen `anchor` belongs to: moving to another desk is not the desk moving. */
  const anchorScreen = useRef<object | null>(null);
  /** How much the camera still has to move to catch up with the desk. */
  const behind = useRef(new Vector3());

  const current = (): Pose => ({
    position: camera.position.clone(),
    target: controls?.target.clone() ?? new Vector3(),
  });

  // Entering: remember the orbit pose and limits, lift the limits that would fight the view.
  useEffect(() => {
    if (!seated || !controls || saved.current) return;
    saved.current = {
      ...current(),
      limits: {
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        minPolarAngle: controls.minPolarAngle,
        maxPolarAngle: controls.maxPolarAngle,
      },
    };
    Object.assign(controls, {
      enabled: false,
      minDistance: 0.05,
      maxDistance: Infinity,
      minPolarAngle: 0,
      maxPolarAngle: Math.PI,
    });
    // `current` only reads refs and the camera; it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seated, controls]);

  // While seated: frame the focused screen or all of them; refit when the canvas resizes.
  useEffect(() => {
    if (!seated || screens.length === 0) return;
    const focused = screens.find((s) => s.id === focus);
    const facing = focused ?? screens.find((s) => s.id === primaryId) ?? screens[0];
    if (!facing) return;
    let back = worldFront(facing);
    if (!focused) {
      // Look down a little when a screen lies on the desk, so it can be read too.
      const flat = screens.find((s) => Math.abs(worldFront(s).y) >= 0.7);
      if (flat) back = tilted(back, MathUtils.degToRad(tilt));
    }
    const corners = (focused ? [focused] : screens).flatMap(worldCorners);
    const inset = Math.min(0.3, hudInset / Math.max(1, size.height));
    const insetBottom = Math.min(0.25, hudInsetBottom / Math.max(1, size.height));
    move.current = planMove(current(), fitPose(corners, back, camera, inset, insetBottom));
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    seated,
    focus,
    screens,
    primaryId,
    tilt,
    size.width,
    size.height,
    hudInset,
    hudInsetBottom,
    camera,
    invalidate,
  ]);

  // Leaving: fly back, then hand the camera back to the orbit controls.
  useEffect(() => {
    if (seated || !saved.current) return;
    const back = saved.current;
    move.current = planMove(current(), back, () => {
      if (controls) Object.assign(controls, { ...back.limits, enabled: true });
      saved.current = null;
      setCameraFree(true);
    });
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seated]);

  // The camera orbits the moving target on the way, rather than cutting straight through the
  // desk, while the distance eases from one pose to the other.
  useFrame((_, delta) => {
    const m = move.current;

    // Seated, the camera rises and sinks with the desk: it moves by as much as the screen it
    // faces, but eases after it, so the desk can be seen moving (motions run before this).
    const followed = screens.find((s) => s.id === (focus ?? primaryId)) ?? screens[0];
    if (seated && followed) {
      const now = worldCentre(followed);
      if (anchor.current && anchorScreen.current === followed.frame.mesh) {
        behind.current.add(now.clone().sub(anchor.current));
      }
      anchor.current = now;
      anchorScreen.current = followed.frame.mesh;
      const lag = behind.current;
      if (m) {
        // Mid-move the pose is recomputed every frame, so shift both ends at once.
        for (const pose of [m.from, m.to]) {
          pose.position.add(lag);
          pose.target.add(lag);
        }
        lag.set(0, 0, 0);
      } else if (controls && lag.lengthSq() > 0) {
        const step =
          lag.lengthSq() < 1e-8
            ? lag.clone()
            : lag.clone().multiplyScalar(1 - Math.exp(-Math.min(delta, 0.1) / FOLLOW_LAG));
        camera.position.add(step);
        controls.target.add(step);
        camera.up.copy(WORLD_UP);
        camera.lookAt(controls.target);
        lag.sub(step);
        invalidate();
      }
    } else {
      anchor.current = null;
      behind.current.set(0, 0, 0);
    }

    if (!m) return;
    // After a still period the first delta spans the whole pause; start the clock now instead.
    if (m.started) m.t = Math.min(1, m.t + Math.min(delta, 0.05) / m.seconds);
    m.started = true;
    const k = ease(m.t);
    target.lerpVectors(m.from.target, m.to.target, k);
    angle.set(
      MathUtils.lerp(m.fromAngle.radius, m.toAngle.radius, k),
      MathUtils.lerp(m.fromAngle.phi, m.toAngle.phi, k),
      MathUtils.lerp(m.fromAngle.theta, m.toAngle.theta, k),
    );
    camera.position.setFromSpherical(angle).add(target);
    // Level, whatever turned the camera's up vector before (drei's Bounds animations do).
    camera.up.copy(WORLD_UP);
    camera.lookAt(target);
    controls?.target.copy(target);
    if (m.t >= 1) {
      move.current = null;
      m.onDone?.();
      controls?.update();
    }
    invalidate();
  });

  return null;
}
