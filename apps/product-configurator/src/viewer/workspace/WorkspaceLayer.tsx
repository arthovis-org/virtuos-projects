import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  MeshPhysicalMaterial,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';
import type { ProductDefinition } from '@/catalog/schema';
import { useWorkspaceStore } from '@/state/workspaceStore';
import { matrixRelativeTo } from '../nodeUtils';
import { coverScreens, cssProjection, screenHoleMaterial } from './cssProjection';
import { dropTargetAt } from './dropTarget';
import { isShown, resolveScreens, screenPixels, type ResolvedScreen } from './resolveScreens';
import { WorkspaceCamera, type CameraTarget } from './WorkspaceCamera';

interface WorkspaceLayerProps {
  product: ProductDefinition;
  scene: Object3D;
  index: ReadonlyMap<string, Object3D>;
  /** Blender object names hidden by the current configuration (monitors switched off). */
  hiddenNodes: ReadonlySet<string>;
}

/**
 * Workspace mode inside the canvas: finds each screen's display surface, tracks which ones
 * are switched on, lets the drag code find the screen under the pointer, and keeps the live
 * websites (the screen layer over the canvas) on their screens every frame.
 */
export function WorkspaceLayer({ product, scene, index, hiddenNodes }: WorkspaceLayerProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const active = useWorkspaceStore((s) => s.active);
  const dragging = useWorkspaceStore((s) => s.drag !== null);
  const setPicker = useWorkspaceStore((s) => s.setPicker);
  const setSurfaces = useWorkspaceStore((s) => s.setSurfaces);
  const updateDrag = useWorkspaceStore((s) => s.updateDrag);
  const endDrag = useWorkspaceStore((s) => s.endDrag);

  const screens = useMemo(() => resolveScreens(product, scene, index), [product, index, scene]);

  const visible = useMemo(
    () => screens.filter((s) => isShown(s.node, scene, hiddenNodes)),
    [screens, scene, hiddenNodes],
  );
  // The primary screen is the one the overview faces and that takes the windows of screens
  // switched off: the largest upright one (a monitor you look at, not a display lying on
  // the desk, which can be just as large), else the largest of any.
  const primary = useMemo(() => {
    const area = (s: ResolvedScreen) => s.frame.width * s.frame.height * s.worldScale ** 2;
    const upright = (s: ResolvedScreen) => {
      const front = new Vector3(0, 0, 1)
        .applyQuaternion(s.frame.quaternion)
        .transformDirection(matrixRelativeTo(s.frame.mesh, scene));
      return Math.abs(front.y) < 0.7;
    };
    return [...visible].sort(
      (a, b) => Number(upright(b)) - Number(upright(a)) || area(b) - area(a),
    )[0];
  }, [visible, scene]);
  const cameraTargets = useMemo<CameraTarget[]>(
    () => visible.map((s) => ({ id: s.screen.id, frame: s.frame })),
    [visible],
  );

  // Tell the screen layer which screens are on and how many CSS pixels each one spans.
  useEffect(() => {
    setSurfaces(
      visible.map((s) => ({ screen: s.screen, ...screenPixels(product, s) })),
      primary?.screen.id,
    );
  }, [visible, primary, product, setSurfaces]);
  // No live screens without this layer (the room with no desk chosen).
  useEffect(() => () => setSurfaces([], undefined), [setSurfaces]);

  // The live screens' frames, for the projection that lays the sites over them.
  useEffect(() => {
    if (!active) return;
    for (const s of visible) cssProjection.frames.set(s.screen.id, s.frame);
    cssProjection.invalidate?.();
    return () => {
      for (const s of visible) cssProjection.frames.delete(s.screen.id);
    };
  }, [active, visible]);

  // Off, the screens look like switched-off displays: glossy black glass. On, each draws as a
  // transparent hole that still hides what is behind it: the sites under the canvas show
  // through it, and whatever is in front of the screen (another monitor, its own back, the
  // desk) covers them.
  useEffect(() => {
    const look = active
      ? screenHoleMaterial()
      : new MeshPhysicalMaterial({
          color: 0x08090b,
          roughness: 0.08,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
        });
    const restore = coverScreens(screens, look, product.screenMaterial);
    invalidate();
    return () => {
      restore();
      if (!active) look.dispose();
      invalidate();
    };
  }, [active, screens, product.screenMaterial, invalidate]);

  // Screen positions under the pointer: the drop target of a dragged window, and the point on
  // a screen's plane a divider is dragged to (the plane, so it works past the screen's edge).
  const setLocator = useWorkspaceStore((s) => s.setLocator);
  useEffect(() => {
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const local = new Vector3();
    const inverse = new Quaternion();
    const plane = new Plane();
    const point = new Vector3();
    const aim = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
    };
    // A world point on a screen, in its CSS pixels: x to the right, y down from the top edge.
    const pixels = ({ frame }: ResolvedScreen, element: HTMLElement, world: Vector3) => {
      frame.mesh.worldToLocal(local.copy(world)).sub(frame.position);
      local.applyQuaternion(inverse.copy(frame.quaternion).invert());
      return {
        x: (local.x / frame.width + 0.5) * element.clientWidth,
        y: (0.5 - local.y / frame.height) * element.clientHeight,
      };
    };

    setPicker((clientX, clientY, windowId) => {
      aim(clientX, clientY);
      const hit = raycaster.intersectObjects(
        visible.map((s) => s.frame.mesh),
        false,
      )[0];
      const target = visible.find((s) => s.frame.mesh === hit?.object);
      const element = target && cssProjection.surfaces.get(target.screen.id);
      if (!hit || !target || !element) return null;
      const { x, y } = pixels(target, element, hit.point);
      return dropTargetAt(target.screen.id, element, x, y, windowId);
    });

    setLocator((screenId, clientX, clientY) => {
      const target = visible.find((s) => s.screen.id === screenId);
      const element = cssProjection.surfaces.get(screenId);
      if (!target || !element) return null;
      aim(clientX, clientY);
      const { frame } = target;
      frame.mesh.updateWorldMatrix(true, false);
      const centre = frame.position.clone().applyMatrix4(frame.mesh.matrixWorld);
      const normal = new Vector3(0, 0, 1)
        .applyQuaternion(frame.quaternion)
        .transformDirection(frame.mesh.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, centre);
      return raycaster.ray.intersectPlane(plane, point) ? pixels(target, element, point) : null;
    });
    return () => {
      setPicker(null);
      setLocator(null);
    };
  }, [visible, camera, gl, setPicker, setLocator]);

  // While a window is dragged: iframes must not swallow the pointer, and the move and
  // release are followed on the whole window wherever the pointer goes.
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('ws-dragging');
    const move = (event: PointerEvent) => updateDrag(event.clientX, event.clientY);
    const up = () => endDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      document.body.classList.remove('ws-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, updateDrag, endDrag]);

  if (screens.length === 0) return null;
  return (
    <WorkspaceCamera
      screens={cameraTargets}
      primaryId={primary?.screen.id}
      tilt={product.screenTilt}
    />
  );
}
