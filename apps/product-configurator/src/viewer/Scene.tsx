import { Bounds, ContactShadows, OrbitControls, useBounds } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { MathUtils, MOUSE, Vector3, type PerspectiveCamera } from 'three';
import { useSetupStore } from '@/state/setupStore';
import { fitDistance } from './fitDistance';
import { HeightInsetFrame } from './HeightInset';
import { LoadingIndicator } from './LoadingIndicator';
import { StudioEnvironment } from './StudioEnvironment';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
import { useViewStore } from '@/state/viewStore';
import { WorkspaceHud } from '@/ui/workspace/WorkspaceHud';
import { preloadCurrentProduct } from './models';
import { ProductModel } from './ProductModel';
import { CssProjectionDriver } from './workspace/CssProjectionDriver';
import { ScreenLayer } from './workspace/ScreenLayer';
import { SmoothZoom } from './SmoothZoom';
import { useOrbitGuard } from './useOrbitGuard';
import { HandoffArcs } from '@/agents/HandoffArcs';
import { CenterOnDesk } from './CenterOnDesk';
import styles from './Scene.module.css';

// This module is loaded lazily, and this is the earliest point where three is available.
preloadCurrentProduct();

/** Lowest angle the room overview looks down at the desks from, so back rows show too. */
const ROOM_ELEVATION = MathUtils.degToRad(32);
/**
 * On a tall view (a phone held upright) the room is seen from higher up, so the arc's depth
 * uses the height of the screen instead of shrinking to fit its width.
 */
const ROOM_ELEVATION_TALL = MathUtils.degToRad(52);
/** Farthest the orbit camera may go: one desk, or a room of them. */
const MAX_DISTANCE = { desk: 6, room: 60 };

/** The parts of drei's OrbitControls a refit moves. */
interface RefitControls {
  target: Vector3;
  update: () => void;
  addEventListener: (type: 'start', listener: () => void) => void;
  removeEventListener: (type: 'start', listener: () => void) => void;
}

interface Flight {
  from: Vector3;
  fromTarget: Vector3;
  to: Vector3;
  toTarget: Vector3;
  t: number;
  started: boolean;
}

/** Space around the product when it is framed. */
const FIT_MARGIN = 1.1;

/** How long a refit takes, in seconds. */
const REFIT_SECONDS = 0.9;
/** Fast in the middle, soft at both ends. */
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Reframes the product when the canvas is resized or the room of desks changes, unless
 * workspace mode has the camera (then once it hands the camera back). `Bounds observe`
 * can't be switched off for that: turning it off makes drei refit once.
 *
 * The camera flies here rather than through `Bounds`: drei turns the camera's up vector
 * during its animations, and one cut short (the visitor sitting down mid-flight) left every
 * later view rolled. This keeps the horizon level.
 */
function Refit() {
  const bounds = useBounds();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as RefitControls | null;
  const invalidate = useThree((s) => s.invalidate);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const cameraFree = useViewStore((s) => s.cameraFree);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  const deskCount = useSetupStore((s) => s.room.length);
  // Looking around the desk the visitor is at: the camera is theirs, not the room's.
  const aroundDesk = useViewStore((s) => s.aroundDesk);
  const wasAround = useRef(false);
  const fitted = useRef<string | null>(null);
  const flight = useRef<Flight | null>(null);
  const wasSeated = useRef(false);

  useEffect(() => {
    const key = `${width}x${height}:${desksMode ? deskCount : 'single'}`;
    // The camera was just handed back in the room (the visitor stood up): to the overview,
    // never back to wherever the camera was before they sat down.
    const backInRoom =
      desksMode && cameraFree && !aroundDesk && (wasSeated.current || wasAround.current);
    wasSeated.current = !cameraFree;
    wasAround.current = aroundDesk;
    if (!cameraFree || (aroundDesk && fitted.current !== null)) return;
    // The first framing is the only one: this, not `Bounds fit`, which could run alongside a
    // seated camera's flight when a desk was picked before the model had loaded.
    const first = fitted.current === null;
    if (!first && !backInRoom && fitted.current === key) return;
    fitted.current = key;
    bounds.refresh().clip();
    const { box, center } = bounds.getSize();
    const target = controls?.target ?? center;
    // The room from behind the point its desks face, high enough to see over the front row;
    // one desk from the side the visitor looks from now.
    const elevation =
      (camera as PerspectiveCamera).aspect < 0.9 ? ROOM_ELEVATION_TALL : ROOM_ELEVATION;
    const aim = desksMode
      ? new Vector3(0, Math.sin(elevation), Math.cos(elevation))
      : camera.position.clone().sub(target).normalize();
    const distance = fitDistance(box, center, aim, camera as PerspectiveCamera) * FIT_MARGIN;
    flight.current = {
      from: camera.position.clone(),
      fromTarget: target.clone(),
      to: center.clone().addScaledVector(aim, distance),
      toTarget: center.clone(),
      // The first framing is there at once; later ones fly.
      t: first ? 1 : 0,
      started: false,
    };
    invalidate();
  }, [
    bounds,
    camera,
    controls,
    invalidate,
    width,
    height,
    cameraFree,
    desksMode,
    deskCount,
    aroundDesk,
  ]);

  // Dragging takes the camera over.
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      flight.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, delta) => {
    const f = flight.current;
    if (!f) return;
    // Workspace mode took the camera (the visitor sat down): it flies from wherever this is.
    if (!useViewStore.getState().cameraFree) {
      flight.current = null;
      return;
    }
    // After a still period the first delta spans the whole pause; start the clock now instead.
    if (f.started) f.t = Math.min(1, f.t + Math.min(delta, 0.05) / REFIT_SECONDS);
    f.started = true;
    const k = ease(f.t);
    camera.position.lerpVectors(f.from, f.to, k);
    const target = controls?.target ?? new Vector3();
    target.lerpVectors(f.fromTarget, f.toTarget, k);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (f.t >= 1) {
      flight.current = null;
      controls?.update();
    }
    invalidate();
  });
  return null;
}

/** The parts of drei's OrbitControls the room adjusts. */
interface Limits {
  maxDistance: number;
}

/**
 * Lets the orbit camera back far enough to see the whole room. Applied while the camera is
 * free only: while seated, workspace mode has lifted the limits and puts them back itself.
 */
function RoomLimits() {
  const controls = useThree((s) => s.controls) as unknown as Limits | null;
  const cameraFree = useViewStore((s) => s.cameraFree);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  useEffect(() => {
    if (controls && cameraFree) {
      controls.maxDistance = desksMode ? MAX_DISTANCE.room : MAX_DISTANCE.desk;
    }
  }, [controls, cameraFree, desksMode]);
  return null;
}

/**
 * Studio-style viewer: soft environment light, contact shadow, damped orbit controls.
 *
 * Layers, bottom to top: the surface the orbit controls listen on, the workspace sites, the
 * transparent canvas (which lets the pointer through and shows the sites through holes in the
 * screens, so the model hides them where it is in front), then the workspace controls.
 */
export function Scene() {
  const [orbitSurface, setOrbitSurface] = useState<HTMLDivElement | null>(null);
  useOrbitGuard(orbitSurface);
  const room = useViewStore((s) => s.room);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  return (
    <div className={styles.viewer}>
      <div ref={setOrbitSurface} className={styles.orbitSurface} />
      <ScreenLayer />
      <Canvas
        // Above the sites, but the pointer goes through to them and to the orbit surface.
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
        // Render only when something changes (camera, selection); the scene is static otherwise.
        frameloop="demand"
        dpr={[1, 2]}
        // Far out, outside any room of desks (the first framing then moves it in at once): a desk
        // picked from the desk bar while the model loads flies from here, and from inside the
        // room the flight went through the other desks.
        camera={{ position: [9, 6, 11], fov: 35, near: 0.05, far: 200 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ViewerErrorBoundary>
          <Suspense fallback={<LoadingIndicator />}>
            <Bounds clip margin={1.25}>
              <Refit />
              <ProductModel />
            </Bounds>
          </Suspense>
        </ViewerErrorBoundary>
        <StudioEnvironment />
        <directionalLight position={[3, 5, 2]} intensity={1.2} />
        <ContactShadows
          position={[0, -0.001, 0]}
          opacity={0.55}
          // Under the desk, or the whole room of desks.
          scale={desksMode ? [Math.max(5, room.width + 2), Math.max(5, room.depth + 2)] : 5}
          blur={1.6}
          // Tall enough to catch a desk top at standing height.
          far={2}
          resolution={desksMode ? 2048 : 1024}
        />
        <OrbitControls
          makeDefault
          {...(orbitSurface && { domElement: orbitSurface })}
          enablePan={false}
          // Only the left button here (it orbits): the middle one and the wheel zoom smoothly
          // (SmoothZoom); pinching stays here.
          mouseButtons={{ LEFT: MOUSE.ROTATE }}
          enableDamping
          dampingFactor={0.08}
          minDistance={1}
          maxDistance={MAX_DISTANCE.desk}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2 - 0.02}
          // No fixed target: `Bounds` points the controls at the centre of what it frames,
          // which includes the full height range of a motorised desk.
        />
        <SmoothZoom />
        <HandoffArcs />
        <CenterOnDesk />
        <RoomLimits />
        <CssProjectionDriver />
      </Canvas>
      <WorkspaceHud />
      <HeightInsetFrame />
    </div>
  );
}
