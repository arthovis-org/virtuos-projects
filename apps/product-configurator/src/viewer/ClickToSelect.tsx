import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector2, type Object3D } from 'three';
import { goHome, selectDesk } from '@/state/actions';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { deskObjects, occupantObjects } from './deskObjects';

/** Pointer movement that makes a press a drag (orbiting), not a click. */
const CLICK_SLOP = 5;

/**
 * Clicks on the room (in the overview): on a desk, or the person at it, picks that desk; on
 * empty space, picks none, and the view goes back to the whole room. Only clicks, never drags
 * (orbiting): the scene is ray-cast once per click.
 */
export function ClickToSelect() {
  const controls = useThree((s) => s.controls) as unknown as { domElement?: HTMLElement } | null;
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => {
    const surface = controls?.domElement;
    if (!surface) return;
    let pressed: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      pressed = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const onUp = (event: PointerEvent) => {
      const at = pressed;
      pressed = null;
      if (!at || event.button !== 0) return;
      if (Math.hypot(event.clientX - at.x, event.clientY - at.y) > CLICK_SLOP) return;
      const setup = useSetupStore.getState();
      const view = useViewStore.getState();
      if (setup.mode !== 'desks' || view.seated || view.drag || view.deskDrag) return;

      const rect = canvas.getBoundingClientRect();
      const pointer = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const owners = new Map<Object3D, string>();
      for (const [id, object] of deskObjects) owners.set(object, id);
      for (const [id, object] of occupantObjects) owners.set(object, id);
      const hits = raycaster.intersectObjects([...owners.keys()], true);
      let picked: string | undefined;
      for (const hit of hits) {
        if (!shown(hit.object)) continue;
        for (let node: Object3D | null = hit.object; node && !picked; node = node.parent) {
          picked = owners.get(node);
        }
        if (picked) break;
      }
      if (picked) selectDesk(picked);
      else if (setup.activeDeskId) goHome();
    };
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointerup', onUp);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointerup', onUp);
    };
  }, [controls, camera, raycaster, canvas]);
  return null;
}

/** Drawn: it and its ancestors visible (hidden parts and other desks seated don't count). */
function shown(object: Object3D) {
  for (let node: Object3D | null = object; node; node = node.parent)
    if (!node.visible) return false;
  return true;
}
