import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type CSSProperties } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  QuadraticBezierCurve3,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type ShaderMaterial,
} from 'three';
import { deskObjects } from '@/viewer/deskObjects';
import { useAgentStore } from './agentStore';
import type { Handoff } from './types';
import styles from './HandoffArcs.module.css';

/** Seconds the work takes from desk to desk (at normal speed); how long the trail lingers. */
const FLIGHT = 2.4;
const LINGER = 0.9;
/** Height it leaves and lands at (over the monitors), and how high its arc rises above. */
const LIFT = 1.55;
const ARC = 1.5;
/** Seconds a ring ripples out on the floor. */
const RIPPLE = 1.1;

/**
 * Work handed from one agent to another: a streak of light in the sender's colour draws itself
 * along an arc from desk to desk, carrying a card that says what is delivered and to whom. A
 * ring ripples out around the sender's desk as it leaves and the receiver's as it lands.
 */
export function HandoffArcs() {
  const handoffs = useAgentStore((s) => s.handoffs);
  return (
    <>
      {handoffs.map((handoff) => (
        <Delivery key={handoff.id} handoff={handoff} />
      ))}
    </>
  );
}

/** A soft round glow, drawn once. */
let glowTexture: CanvasTexture | null = null;
function glow() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}

/**
 * The trail: drawn along the tube up to its head (uv.x runs along it), brightest at the head
 * and fading behind, whitening right at the tip.
 */
const TRAIL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const TRAIL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHead;
  uniform float uFade;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float along = vUv.x;
    if (along > uHead) discard;
    float behind = uHead - along;
    float tail = exp(-behind * 2.6);
    float tip = smoothstep(0.06, 0.0, behind);
    vec3 colour = mix(uColor, vec3(1.0), tip * 0.75);
    float alpha = (0.18 + 0.82 * tail) * uFade * uStrength;
    gl_FragColor = vec4(colour * (0.6 + 1.2 * tail), alpha);
  }
`;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Delivery({ handoff }: { handoff: Handoff }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const speed = useAgentStore((s) => s.speed);
  const root = useRef<Group>(null);
  const trail = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const sparkle = useRef<Mesh>(null);
  const card = useRef<HTMLDivElement>(null);
  const leaveRing = useRef<Mesh>(null);
  const landRing = useRef<Mesh>(null);

  // The arc between the two desks, as they stand when the work leaves.
  const path = useMemo(() => {
    const start = new Vector3();
    const end = new Vector3();
    deskObjects.get(handoff.fromDesk)?.getWorldPosition(start);
    deskObjects.get(handoff.toDesk)?.getWorldPosition(end);
    const from = start.clone().setY(LIFT);
    const to = end.clone().setY(LIFT);
    const top = from
      .clone()
      .add(to)
      .multiplyScalar(0.5)
      .setY(LIFT + ARC);
    return { curve: new QuadraticBezierCurve3(from, top, to), start, end };
  }, [handoff.fromDesk, handoff.toDesk]);
  const colour = useMemo(() => new Color(handoff.color), [handoff.color]);
  const trailUniforms = useMemo(
    () => ({
      uColor: { value: colour },
      uHead: { value: 0 },
      uFade: { value: 1 },
      uStrength: { value: 0.55 },
    }),
    [colour],
  );
  const glowUniforms = useMemo(
    () => ({
      uColor: { value: colour },
      uHead: { value: 0 },
      uFade: { value: 1 },
      uStrength: { value: 0.1 },
    }),
    [colour],
  );
  const point = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const group = root.current;
    if (!group) return;
    const age = (performance.now() - handoff.at) / 1000;
    // Not left yet (several deliveries leave one after another).
    if (age < 0) {
      group.visible = false;
      // The card is page content, not part of the 3D scene: hidden by hand.
      if (card.current) card.current.style.opacity = '0';
      invalidate();
      return;
    }
    const flight = FLIGHT / Math.sqrt(Math.max(1, speed));
    const done = flight + LINGER + RIPPLE;
    group.visible = age < done;
    if (!group.visible) {
      if (card.current) card.current.style.opacity = '0';
      return;
    }
    const t = Math.min(1, age / flight);
    const reached = ease(t);
    const fade = age <= flight ? 1 : Math.max(0, 1 - (age - flight) / LINGER);

    // The streak and its soft glow, drawn up to the head.
    for (const mesh of [trail.current, group.children.find((c) => c.name === 'trail-glow')]) {
      const material = (mesh as Mesh | undefined)?.material as ShaderMaterial | undefined;
      if (!material) continue;
      const { uHead, uFade } = material.uniforms;
      if (uHead) uHead.value = reached;
      if (uFade) uFade.value = fade;
    }

    // The head: a bright point with a halo, carrying the card.
    path.curve.getPoint(reached, point);
    const flying = age <= flight;
    head.current?.position.copy(point);
    if (halo.current) {
      halo.current.quaternion.copy(camera.quaternion);
      const material = halo.current.material as MeshBasicMaterial;
      material.opacity = (flying ? Math.min(1, age * 3) : fade) * 0.6;
      halo.current.scale.setScalar(1 + 0.06 * Math.sin(age * 6));
    }
    if (sparkle.current) sparkle.current.visible = flying;
    if (card.current) {
      card.current.style.opacity = String(flying ? Math.min(1, age * 2.5) : fade);
      card.current.style.transform = `translateY(${flying ? 0 : -(1 - fade) * 12}px)`;
    }

    // Ripples on the floor: one as it leaves, two as it lands.
    ripple(leaveRing.current, age);
    ripple(landRing.current, age - flight);
    invalidate();
  });

  const cardStyle = { '--agent': handoff.color } as CSSProperties;
  return (
    <group ref={root}>
      <mesh ref={trail} renderOrder={5}>
        <tubeGeometry args={[path.curve, 120, 0.008, 6, false]} />
        <shaderMaterial
          uniforms={trailUniforms}
          vertexShader={TRAIL_VERTEX}
          fragmentShader={TRAIL_FRAGMENT}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh name="trail-glow" renderOrder={4}>
        <tubeGeometry args={[path.curve, 120, 0.04, 8, false]} />
        <shaderMaterial
          uniforms={glowUniforms}
          vertexShader={TRAIL_VERTEX}
          fragmentShader={TRAIL_FRAGMENT}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <group ref={head}>
        <mesh ref={halo} renderOrder={6}>
          <planeGeometry args={[0.42, 0.42]} />
          <meshBasicMaterial
            color={colour}
            map={glow()}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={sparkle} renderOrder={7}>
          <sphereGeometry args={[0.018, 12, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <Html center zIndexRange={[16777270, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={card} className={styles.card} style={{ ...cardStyle, opacity: 0 }}>
            <span className={styles.avatar}>{handoff.fromName.slice(0, 1)}</span>
            <span className={styles.text}>
              <span className={styles.title}>{handoff.title}</span>
              <span className={styles.to}>
                {handoff.fromName} → {handoff.toName}
              </span>
            </span>
          </div>
        </Html>
      </group>
      <Ring ref={leaveRing} at={path.start} colour={colour} />
      <Ring ref={landRing} at={path.end} colour={colour} />
    </group>
  );
}

/** A ring on the floor around a desk, rippling out `age` seconds in (hidden before and after). */
function ripple(ring: Mesh | null, age: number) {
  if (!ring) return;
  const t = age / RIPPLE;
  ring.visible = t > 0 && t < 1;
  if (!ring.visible) return;
  ring.scale.setScalar(0.55 + 0.75 * (1 - Math.pow(1 - t, 3)));
  (ring.material as MeshBasicMaterial).opacity = 0.3 * (1 - t);
}

function Ring({ ref, at, colour }: { ref: React.Ref<Mesh>; at: Vector3; colour: Color }) {
  return (
    <mesh ref={ref} position={[at.x, 0.02, at.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.96, 1, 72]} />
      <meshBasicMaterial
        color={colour}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
