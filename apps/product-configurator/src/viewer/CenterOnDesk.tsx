import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type Camera } from 'three';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { deskObjects } from './deskObjects';

/** The parts of drei's OrbitControls this moves. */
interface Controls {
  target: Vector3;
  update: () => void;
}

/** How quickly the view glides onto a desk (per second, exponential). */
const GLIDE = 4;

/**
 * In the room's overview, the selected desk in the middle of the view: the camera glides
 * sideways (same distance, same angle) until the desk is centred, onto the next one picked,
 * and back to the whole room when none is.
 */
export function CenterOnDesk() {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera) as Camera;
  const invalidate = useThree((s) => s.invalidate);
  const activeDeskId = useSetupStore((s) => (s.mode === 'desks' ? s.activeDeskId : null));
  const seated = useViewStore((s) => s.seated);
  const aroundDesk = useViewStore((s) => s.aroundDesk);
  const cameraFree = useViewStore((s) => s.cameraFree);
  /** Where the overview looked before centring on a desk; the glide's goal. */
  const home = useRef<Vector3 | null>(null);
  const goal = useRef<Vector3 | null>(null);

  // Seated or looking around a desk, the camera is theirs: no glide, and the overview starts
  // afresh after (it flies back to the whole room by itself; centring then would fight it).
  useEffect(() => {
    if (seated || aroundDesk || !cameraFree) {
      home.current = null;
      goal.current = null;
    }
  }, [seated, aroundDesk, cameraFree]);

  // Only a different desk picked (or none) moves the view: not a change of view mode.
  const picked = useRef(activeDeskId);

  // A new room, or one desk instead of the room: the camera is reframed (Refit), and gliding
  // back to the old overview on top of that left the desk off centre.
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  const deskCount = useSetupStore((s) => s.room.length);
  useEffect(() => {
    home.current = null;
    goal.current = null;
    picked.current = desksMode ? useSetupStore.getState().activeDeskId : null;
  }, [desksMode, deskCount]);
  useEffect(() => {
    if (picked.current === activeDeskId) return;
    picked.current = activeDeskId;
    const view = useViewStore.getState();
    if (!controls || view.seated || view.aroundDesk || !view.cameraFree) return;
    const desk = activeDeskId ? deskObjects.get(activeDeskId) : undefined;
    if (desk) {
      home.current ??= controls.target.clone();
      const at = desk.getWorldPosition(new Vector3());
      goal.current = new Vector3(at.x, controls.target.y, at.z);
    } else if (home.current) {
      goal.current = home.current;
      home.current = null;
    }
    invalidate();
  }, [activeDeskId, controls, invalidate]);

  const step = useRef(new Vector3());
  useFrame((_, delta) => {
    const to = goal.current;
    if (!to || !controls) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * GLIDE);
    step.current.subVectors(to, controls.target).multiplyScalar(k);
    controls.target.add(step.current);
    camera.position.add(step.current);
    controls.update();
    if (controls.target.distanceToSquared(to) < 1e-6) goal.current = null;
    invalidate();
  });
  return null;
}
