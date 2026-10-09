import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  type Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { deskObjects } from '@/viewer/deskObjects';
import { useAgentStore } from './agentStore';
import type { Handoff } from './types';

/** Seconds a hand-off card takes from desk to desk (at normal speed). */
const FLIGHT = 1.8;
/** Height above the floor it leaves and lands at, and how high its arc rises above that. */
const LIFT = 1.45;
const ARC = 1.3;
const TRAIL = 10;

/**
 * Results handed from one agent to another, as glowing cards in the sender's colour flying in
 * an arc over the room from desk to desk, a short trail behind, a flash on arrival.
 */
export function HandoffArcs() {
  const handoffs = useAgentStore((s) => s.handoffs);
  return (
    <>
      {handoffs.map((handoff) => (
        <Arc key={handoff.id} handoff={handoff} />
      ))}
    </>
  );
}

/** A soft round glow, drawn once. */
let glowTexture: CanvasTexture | null = null;
function glow() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}

const from = new Vector3();
const to = new Vector3();
const control = new Vector3();
const point = new Vector3();

/** A point on the arc (quadratic Bézier), t in 0..1. */
function along(t: number, out: Vector3) {
  const u = 1 - t;
  return out
    .copy(from)
    .multiplyScalar(u * u)
    .addScaledVector(control, 2 * u * t)
    .addScaledVector(to, t * t);
}

function Arc({ handoff }: { handoff: Handoff }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const speed = useAgentStore((s) => s.speed);
  const group = useRef<Group>(null);
  const parts = useMemo(() => {
    const colour = new Color(handoff.color);
    const card = new Mesh(
      new PlaneGeometry(0.5, 0.32),
      new MeshBasicMaterial({ color: colour, transparent: true, toneMapped: false }),
    );
    const halo = new Mesh(
      new PlaneGeometry(1.8, 1.8),
      new MeshBasicMaterial({
        color: colour,
        map: glow(),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    const trail = Array.from({ length: TRAIL }, () => {
      const dot = new Mesh(
        new PlaneGeometry(0.34, 0.34),
        new MeshBasicMaterial({
          color: colour,
          map: glow(),
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          toneMapped: false,
        }),
      );
      return dot;
    });
    return { card, halo, trail };
  }, [handoff.color]);

  useFrame(() => {
    const root = group.current;
    const start = deskObjects.get(handoff.fromDesk);
    const end = deskObjects.get(handoff.toDesk);
    if (!root || !start || !end) return;
    const age = (performance.now() - handoff.at) / 1000;
    const flight = FLIGHT / Math.max(1, Math.sqrt(speed));
    const t = Math.min(1, age / flight);
    root.visible = age < flight + 0.6;
    if (!root.visible) return;

    start.getWorldPosition(from).setY(LIFT);
    end.getWorldPosition(to).setY(LIFT);
    control
      .addVectors(from, to)
      .multiplyScalar(0.5)
      .setY(LIFT + ARC);
    // Eased: leaves gently, lands gently.
    const eased = t * t * (3 - 2 * t);
    along(eased, point);

    // The meshes, as drawn (halo, card, then the trail).
    const [halo, card, ...trail] = root.children as Mesh<PlaneGeometry, MeshBasicMaterial>[];
    if (!halo || !card) return;
    const landed = Math.max(0, (age - flight) / 0.6);
    const cardMaterial = card.material;
    const haloMaterial = halo.material;
    card.position.copy(point);
    halo.position.copy(point);
    card.quaternion.copy(camera.quaternion);
    halo.quaternion.copy(camera.quaternion);
    cardMaterial.opacity = landed > 0 ? 1 - landed : Math.min(1, age * 4);
    // A flash as it lands.
    const flash = landed > 0 ? 1 + landed * 2.5 : 1;
    halo.scale.setScalar(flash);
    haloMaterial.opacity = (landed > 0 ? 1 - landed : 1) * 0.9;

    trail.forEach((dot, i) => {
      const behind = Math.max(0, eased - (i + 1) * 0.025);
      along(behind, dot.position);
      dot.quaternion.copy(camera.quaternion);
      dot.scale.setScalar(1 - i / TRAIL);
      dot.material.opacity = landed > 0 ? 0 : (1 - i / TRAIL) * 0.55 * Math.min(1, age * 4);
    });
    invalidate();
  });

  return (
    <group ref={group}>
      <primitive object={parts.halo} />
      <primitive object={parts.card} />
      {parts.trail.map((dot, i) => (
        <primitive key={i} object={dot} />
      ))}
    </group>
  );
}
