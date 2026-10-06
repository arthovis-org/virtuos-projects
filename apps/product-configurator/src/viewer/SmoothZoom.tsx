import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Vector3 } from 'three';

/** The parts of drei's OrbitControls zooming uses. */
interface Zoomable {
  enabled: boolean;
  enableZoom: boolean;
  minDistance: number;
  maxDistance: number;
  target: Vector3;
  domElement: HTMLElement | null;
  update: () => void;
}

/** Per pixel of a middle-button drag: 250 px down doubles the distance, up halves it. */
const DRAG = Math.LN2 / 250;
/** Per pixel of mouse wheel: a notch (100 px) moves about 12%. */
const WHEEL = 0.0012;
/** How quickly the camera reaches the distance asked for (higher is snappier). */
const EASE = 12;

/**
 * Smooth zoom with the mouse. The orbit controls' own zoom jumps the camera on every mouse
 * event (rotation is damped, zoom isn't), which stutters on a middle-button drag. Here the
 * wheel and the drag set the distance to reach, and the camera glides there frame by frame,
 * easing into the near and far limits instead of stopping dead. Pinching on a touch screen
 * stays the controls' own.
 */
export function SmoothZoom() {
  const controls = useThree((s) => s.controls) as unknown as Zoomable | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  /** The distance from the target the camera is gliding to; null when it is where asked. */
  const goal = useRef<number | null>(null);
  const offset = useRef(new Vector3());

  useEffect(() => {
    const surface = controls?.domElement;
    if (!controls || !surface) return;
    // Seated, the camera is the workspace view's; the controls are off then.
    const usable = () => controls.enabled && controls.enableZoom;
    const zoomBy = (amount: number) => {
      const from = goal.current ?? camera.position.distanceTo(controls.target);
      goal.current = MathUtils.clamp(
        from * Math.exp(amount),
        controls.minDistance,
        controls.maxDistance,
      );
      invalidate();
    };

    // Before the controls' own wheel zoom, which this replaces (same element, capture phase).
    const onWheel = (event: WheelEvent) => {
      if (!usable()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 33
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? 800
            : 1;
      zoomBy(event.deltaY * unit * WHEEL);
    };

    let dragY: number | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 1 || !usable()) return;
      // No autoscroll (Windows browsers start it on a middle click).
      event.preventDefault();
      dragY = event.clientY;
      surface.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (dragY === null) return;
      zoomBy((event.clientY - dragY) * DRAG);
      dragY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (dragY === null) return;
      dragY = null;
      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
    };

    surface.addEventListener('wheel', onWheel, { capture: true, passive: false });
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onUp);
    return () => {
      surface.removeEventListener('wheel', onWheel, { capture: true });
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
    };
  }, [controls, camera, invalidate]);

  useFrame((_, delta) => {
    const distance = goal.current;
    if (distance === null || !controls) return;
    if (!controls.enabled) {
      goal.current = null;
      return;
    }
    const toCamera = offset.current.subVectors(camera.position, controls.target);
    const next = MathUtils.damp(toCamera.length(), distance, EASE, delta);
    const arrived = Math.abs(next - distance) < distance * 0.001;
    toCamera.setLength(arrived ? distance : next);
    camera.position.copy(controls.target).add(toCamera);
    controls.update();
    if (arrived) goal.current = null;
    else invalidate();
  });

  return null;
}
