import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, type RefObject } from 'react';
import { Color, PerspectiveCamera, Vector3, type Box3, type Object3D } from 'three';
import { useProduct } from '@/state/configuratorStore';
import { useDesksStore } from '@/state/desksStore';
import { motionKey, useMotionStore } from '@/state/motionStore';
import { useWorkspaceStore } from '@/state/workspaceStore';
import { fitDistance } from './fitDistance';
import styles from './HeightInset.module.css';
import { screenHoleMaterial } from './workspace/cssProjection';

/** Size of the side view, in CSS pixels, and its distance from the viewer's right edge. */
const INSET = { width: 240, height: 170, margin: 16 };
/** How long the side view stays after the desk stops, in milliseconds. */
const LINGER_MS = 1500;
/** Where the side camera looks from, in the desk's own axes: its right side, a little ahead. */
const SIDE = new Vector3(1, 0.14, 0.3).normalize();

/** Distance of the side view from the bottom of the viewer: above the desk switcher. */
function useInsetBottom() {
  const switcher = useWorkspaceStore((s) => s.hudInsetBottom);
  return Math.max(INSET.margin, switcher);
}

/**
 * The frame and readout of the side view of the desk, over the viewer (the picture itself
 * is drawn into the canvas by `HeightInset`). Decides when the side view shows: while the
 * desk the visitor is at moves or they are on the height controls, and a moment after.
 * Only where the main view doesn't already show the whole desk: seated, or in the room.
 */
export function HeightInsetFrame() {
  const product = useProduct();
  const motion = product.motions[0];
  const bottom = useInsetBottom();
  const peek = useMotionStore((s) => s.peek);
  const open = useMotionStore((s) => s.insetOpen);
  const setInsetOpen = useMotionStore((s) => s.setInsetOpen);
  const value = useMotionStore((s) =>
    motion ? s.current[motionKey(s.deskKey, motion.id)] : undefined,
  );
  const direction = useMotionStore((s) => {
    if (!motion) return 0;
    const key = motionKey(s.deskKey, motion.id);
    const current = s.current[key];
    const target = s.targets[key];
    return current === undefined || target === undefined ? 0 : Math.sign(target - current);
  });
  const seated = useWorkspaceStore((s) => s.seated);
  const desksMode = useDesksStore((s) => s.mode === 'desks');
  const wanted = Boolean(motion) && (seated || desksMode) && (direction !== 0 || peek);

  useEffect(() => {
    if (wanted) {
      setInsetOpen(true);
      return;
    }
    const timer = window.setTimeout(() => setInsetOpen(false), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [wanted, setInsetOpen]);
  useEffect(() => () => setInsetOpen(false), [setInsetOpen]);

  if (!open || !motion) return null;
  return (
    <div
      className={styles.frame}
      style={{ right: INSET.margin, bottom, width: INSET.width, height: INSET.height }}
      aria-hidden="true"
    >
      <span className={styles.title}>{motion.label}</span>
      <span className={styles.value}>
        {value === undefined ? '–' : Math.round(value)}
        <span className={styles.unit}> {motion.unit}</span>
        {direction !== 0 && <span className={styles.arrow}>{direction > 0 ? '↑' : '↓'}</span>}
      </span>
    </div>
  );
}

interface HeightInsetProps {
  /** The desk's outer group. */
  desk: RefObject<Object3D | null>;
  /** Everything the desk can reach as it moves, in the desk group's space. */
  reach: Box3;
}

/**
 * The picture of the side view: the desk the visitor is at, seen from its side and framed on
 * its whole height range, so the legs can be seen extending. Mounted only while the side
 * view shows; meanwhile it draws the frame itself (main view, then the side view into a
 * corner), so it costs nothing the rest of the time.
 */
export function HeightInset({ desk, reach }: HeightInsetProps) {
  const invalidate = useThree((s) => s.invalidate);
  const bottom = useInsetBottom();
  const camera = useMemo(
    () => new PerspectiveCamera(30, INSET.width / INSET.height, 0.05, 100),
    [],
  );
  const background = useMemo(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg');
    return new Color(value.trim() || '#ececea');
  }, []);

  // Where the side camera sits, in the desk's space: fixed while the desk moves.
  const pose = useMemo(() => {
    const center = reach.getCenter(new Vector3());
    const distance = fitDistance(reach, center, SIDE, camera) * 1.12;
    return { center, position: center.clone().addScaledVector(SIDE, distance) };
  }, [reach, camera]);

  useEffect(() => {
    invalidate();
    return () => invalidate();
  }, [invalidate]);

  const previousClear = useMemo(() => new Color(), []);
  useFrame(({ gl, scene, camera: main, size }) => {
    gl.render(scene, main);
    const group = desk.current;
    if (!group) return;

    group.updateWorldMatrix(true, false);
    camera.position.copy(pose.position).applyMatrix4(group.matrixWorld);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.center.clone().applyMatrix4(group.matrixWorld));
    camera.updateMatrixWorld();

    // Only this desk: in the room its neighbours stand right where the side camera looks from.
    const others = (group.parent?.children ?? []).filter((o) => o !== group && o.visible);
    for (const other of others) other.visible = false;
    // The screens are holes onto the sites under the canvas; here they are dark glass.
    const hole = screenHoleMaterial();
    const holeOpacity = hole.opacity;
    hole.opacity = 1;
    gl.getClearColor(previousClear);
    const previousAlpha = gl.getClearAlpha();

    const x = size.width - INSET.margin - INSET.width;
    gl.setScissorTest(true);
    gl.setScissor(x, bottom, INSET.width, INSET.height);
    gl.setViewport(x, bottom, INSET.width, INSET.height);
    gl.setClearColor(background, 1);
    gl.render(scene, camera);

    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.setClearColor(previousClear, previousAlpha);
    hole.opacity = holeOpacity;
    for (const other of others) other.visible = true;
  }, 1);

  return null;
}
